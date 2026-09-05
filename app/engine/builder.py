"""FFmpeg command construction engine.

Provides strongly-typed configuration models and command builder for trimming,
scaling, cropping, padding, framerate conversion, and bitrate/CRF compression.
"""

from __future__ import annotations

import os
from typing import Optional, Literal
from pydantic import BaseModel, Field, model_validator

from app.engine.binaries import get_ffmpeg_path


FitMode = Literal["scale", "pad", "crop"]
EncodingMode = Literal["crf", "target_size", "copy"]
VideoCodec = Literal[
    "libx264",
    "libx265",
    "h264_nvenc",
    "hevc_nvenc",
    "h264_qsv",
    "hevc_qsv",
    "h264_amf",
    "hevc_amf",
    "copy",
]


class CutSegment(BaseModel):
    """Time range to remove/cut out from video."""
    start: float = Field(ge=0.0, description="Start time in seconds")
    end: float = Field(gt=0.0, description="End time in seconds")

    @model_validator(mode="after")
    def validate_segment(self) -> "CutSegment":
        if self.start >= self.end:
            raise ValueError(f"Segment start ({self.start}) must be strictly less than end ({self.end})")
        return self


class TimelineClip(BaseModel):
    """Clip positioned on an NLE timeline track."""
    id: str = Field(description="Unique clip identifier")
    in_point: float = Field(default=0.0, ge=0.0, description="Start offset in source media (seconds)")
    out_point: float = Field(gt=0.0, description="End offset in source media (seconds)")
    timeline_start: float = Field(default=0.0, ge=0.0, description="Placement timestamp on timeline track (seconds)")
    speed: float = Field(default=1.0, gt=0.0, description="Playback speed multiplier (e.g. 0.5x, 1.0x, 2.0x)")
    volume: float = Field(default=1.0, ge=0.0, description="Audio volume multiplier (1.0 = 100%)")
    file_id: Optional[str] = Field(default=None, description="Source file ID if multi-file project")
    # Audio Suite fields (Phase 2)
    denoise: bool = Field(default=False, description="Apply adaptive FFT noise reduction")
    denoise_level: Literal["low", "medium", "high"] = Field(default="medium", description="Noise reduction intensity")
    normalize_audio: bool = Field(default=False, description="Apply EBU R128 loudness normalization")
    target_lufs: float = Field(default=-14.0, description="Target integrated loudness in LUFS")
    # Visual Transform & PIP fields (Phase 3)
    pos_x: float = Field(default=0.0, description="Horizontal offset percentage (-100% to +100%) from center")
    pos_y: float = Field(default=0.0, description="Vertical offset percentage (-100% to +100%) from center")
    scale: float = Field(default=1.0, gt=0.0, le=5.0, description="Visual scale multiplier (1.0 = 100%, 0.35 = PIP)")
    rotation: float = Field(default=0.0, ge=-180.0, le=180.0, description="Rotation angle in degrees")
    opacity: float = Field(default=1.0, ge=0.0, le=1.0, description="Opacity (1.0 = 100% opaque)")
    # AI Suite: Neural Voice Isolation (RNNoise)
    neural_voice_isolation: bool = Field(default=False, description="Apply RNNoise deep learning voice isolation")
    voice_isolation_mix: float = Field(default=1.0, ge=0.0, le=1.0, description="Voice isolation intensity (0.0 - 1.0)")
    # Transitions Suite (v1.4.0)
    transition_out: Optional[str] = Field(default=None, description="Transition effect on cut exit (e.g. 'fade', 'wipeleft', 'whip_left')")
    transition_duration: float = Field(default=0.5, ge=0.05, le=5.0, description="Duration of transition in seconds")

    @model_validator(mode="after")
    def validate_clip(self) -> "TimelineClip":
        if self.in_point >= self.out_point:
            raise ValueError(f"in_point ({self.in_point}) must be strictly less than out_point ({self.out_point})")
        return self

    @property
    def duration(self) -> float:
        """Effective playback duration on the timeline taking speed into account."""
        return max(0.0, (self.out_point - self.in_point) / self.speed)

    @property
    def timeline_end(self) -> float:
        """Timestamp on the timeline where this clip ends."""
        return self.timeline_start + self.duration


class TimelineTrack(BaseModel):
    """A lane/track on the timeline (e.g. V1, V2, A1)."""
    id: str = Field(description="Track ID, e.g. 'v1', 'v2', 'a1'")
    type: Literal["video", "audio", "overlay", "text"] = Field(default="video", description="Track type")
    clips: list[TimelineClip] = Field(default_factory=list, description="Clips in sequential or positioned order")
    muted: bool = Field(default=False, description="Mute audio of this track")
    locked: bool = Field(default=False, description="Lock track against editing")


class TextOverlay(BaseModel):
    """Text element to burn into video with styling and timing."""
    id: str = Field(default="", description="Unique ID for the text overlay")
    text: str = Field(description="Text content")
    start_time: float = Field(default=0.0, ge=0.0, description="Start time on timeline (seconds)")
    end_time: float = Field(default=5.0, gt=0.0, description="End time on timeline (seconds)")
    pos_x: float = Field(default=50.0, ge=0.0, le=100.0, description="Horizontal position percent (0-100%, 50 = Center)")
    pos_y: float = Field(default=20.0, ge=0.0, le=100.0, description="Vertical position percent (0-100%, 20 = Top, 50 = Center, 85 = Bottom)")
    font_family: str = Field(default="Arial", description="Font name")
    font_size: int = Field(default=32, ge=10, le=120, description="Font size in pixels")
    color: str = Field(default="#FFFFFF", description="Hex font color e.g. #FFFFFF, #FFDD00")
    box_enabled: bool = Field(default=False, description="Enable background box/pill")
    bg_color: str = Field(default="black@0.6", description="Background box color e.g. black@0.6")
    box_border_width: int = Field(default=8, ge=0, le=40, description="Padding for background box")
    shadow: bool = Field(default=True, description="Drop shadow for readability")


def hex_to_ass_color(hex_str: str) -> str:
    """Convert #RRGGBB hex color to ASS format &H00BBGGRR."""
    clean = hex_str.lstrip("#")
    if len(clean) == 6:
        r, g, b = clean[0:2], clean[2:4], clean[4:6]
        return f"&H00{b}{g}{r}".upper()
    return "&H00FFFFFF"


class VideoFilterConfig(BaseModel):
    """Configuration for video transformation and encoding."""
    start_time: Optional[float] = Field(default=None, ge=0.0, description="Start time in seconds")
    end_time: Optional[float] = Field(default=None, gt=0.0, description="End time in seconds")
    cut_out_segments: list[CutSegment] = Field(
        default_factory=list,
        description="List of intervals to cut out / remove from video",
    )
    aspect_ratio: Optional[str] = Field(
        default=None,
        description="Target aspect ratio (e.g. '16:9', '9:16', '1:1', '4:5', 'custom')",
    )
    fit_mode: FitMode = Field(
        default="scale",
        description="Fitting strategy when changing dimensions/aspect ratio",
    )
    width: Optional[int] = Field(default=None, gt=0, description="Target width in pixels")
    height: Optional[int] = Field(default=None, gt=0, description="Target height in pixels")
    fps: Optional[float] = Field(default=None, gt=0.0, description="Target frame rate")
    mode: EncodingMode = Field(default="crf", description="Encoding mode: 'crf', 'target_size', or 'copy'")
    crf: int = Field(default=23, ge=0, le=51, description="CRF value for CRF mode (0-51)")
    preset: str = Field(default="medium", description="x264/x265 encoding preset")
    video_codec: VideoCodec = Field(default="libx264", description="Video encoder codec")
    target_size_mb: Optional[float] = Field(default=None, gt=0.0, description="Target file size in Megabytes")
    audio_bitrate_kbps: int = Field(default=128, gt=0, description="Audio bitrate in kbps")
    remove_audio: bool = Field(default=False, description="Strip audio stream entirely")
    normalize_audio: bool = Field(default=False, description="Global loudness normalization (EBU R128)")
    target_lufs: float = Field(default=-14.0, description="Target integrated loudness in LUFS (-14 for web/social)")
    # AI Suite: Neural Voice Isolation (RNNoise)
    neural_voice_isolation: bool = Field(default=False, description="Global RNNoise voice isolation")
    voice_isolation_mix: float = Field(default=1.0, ge=0.0, le=1.0, description="Voice isolation intensity (0.0 - 1.0)")
    # AI Suite: Subtitle Burn-In & Typography
    burn_subtitles: bool = Field(default=False, description="Hardcode/burn subtitles onto the video stream")
    subtitle_file_path: Optional[str] = Field(default=None, description="Path to .srt subtitle file to burn-in")
    subtitle_font: str = Field(default="Arial", description="Subtitle font family")
    subtitle_font_size: int = Field(default=22, ge=12, le=56, description="Subtitle font size in pt")
    subtitle_color: str = Field(default="#FFFFFF", description="Subtitle text color in hex")
    subtitle_style_preset: str = Field(default="outline", description="Preset: 'outline', 'box', 'yellow_pop', 'shadow', 'bar'")
    subtitle_position: str = Field(default="bottom", description="Position: 'bottom', 'middle', 'top'")
    subtitle_max_width_pct: int = Field(default=80, ge=40, le=100, description="Maximum width constraint percent (40-100%)")
    subtitle_y_pos_pct: int = Field(default=85, ge=10, le=95, description="Vertical position percent (10=top, 50=center, 85=bottom)")
    subtitle_karaoke_enabled: bool = Field(default=False, description="Enable kinetic word highlight")
    subtitle_karaoke_style: str = Field(default="pop", description="Karaoke highlight style ('pop', 'glow', 'box')")
    # Custom Text Overlays (Videoya Metin / Başlık Ekleme)
    text_overlays: list[TextOverlay] = Field(default_factory=list, description="Custom text elements overlayed on video")
    fast_seek: bool = Field(default=True, description="Place trim flags before input for fast seek")
    hwaccel: str = Field(default="auto", description="Hardware acceleration mode ('auto', 'nvenc', 'qsv', 'amf', 'cpu')")
    timeline_tracks: Optional[list[TimelineTrack]] = Field(
        default=None,
        description="Multi-track timeline configuration (CapCut NLE engine)",
    )

    @model_validator(mode="after")
    def validate_timings(self) -> "VideoFilterConfig":
        if self.start_time is not None and self.end_time is not None:
            if self.start_time >= self.end_time:
                raise ValueError(
                    f"start_time ({self.start_time}) must be strictly less than end_time ({self.end_time})"
                )
        if self.mode == "target_size" and (self.target_size_mb is None or self.target_size_mb <= 0):
            raise ValueError("target_size_mb must be provided and greater than 0 when mode is 'target_size'")
        return self


class FFmpegCommandBuilder:
    """Builds optimized FFmpeg CLI commands based on VideoFilterConfig."""

    # Standard resolutions corresponding to aspect ratios when dimensions not specified
    ASPECT_RATIO_PRESETS: dict[str, tuple[int, int]] = {
        "16:9": (1920, 1080),
        "9:16": (1080, 1920),
        "1:1": (1080, 1080),
        "4:5": (1080, 1350),
        "4:3": (1440, 1080),
        "3:4": (1080, 1440),
        "21:9": (2560, 1080),
        "9:21": (1080, 2560),
    }

    @staticmethod
    def _parse_aspect_ratio(aspect_ratio: str) -> Optional[tuple[int, int]]:
        """Parse 'W:H' string into numeric tuple."""
        if not aspect_ratio or aspect_ratio.lower() == "custom":
            return None
        if ":" in aspect_ratio:
            parts = aspect_ratio.split(":", 1)
            try:
                w, h = int(parts[0]), int(parts[1])
                if w > 0 and h > 0:
                    return w, h
            except ValueError:
                pass
        return None

    @classmethod
    def resolve_dimensions(
        cls,
        width: Optional[int],
        height: Optional[int],
        aspect_ratio: Optional[str],
    ) -> tuple[Optional[int], Optional[int]]:
        """Resolve final target width and height based on provided dimensions and aspect ratio."""
        target_w = width
        target_h = height

        ar_pair = cls._parse_aspect_ratio(aspect_ratio) if aspect_ratio else None

        if target_w is not None and target_h is not None:
            # Both explicit dimensions provided
            return (target_w if target_w % 2 == 0 else target_w + 1,
                    target_h if target_h % 2 == 0 else target_h + 1)

        if target_w is not None and target_h is None:
            if ar_pair:
                rw, rh = ar_pair
                calculated_h = int(round(target_w * rh / rw))
                target_h = calculated_h if calculated_h % 2 == 0 else calculated_h + 1
            w = target_w if target_w % 2 == 0 else target_w + 1
            return w, target_h

        if target_h is not None and target_w is None:
            if ar_pair:
                rw, rh = ar_pair
                calculated_w = int(round(target_h * rw / rh))
                target_w = calculated_w if calculated_w % 2 == 0 else calculated_w + 1
            h = target_h if target_h % 2 == 0 else target_h + 1
            return target_w, h

        # Neither width nor height provided
        if aspect_ratio:
            if aspect_ratio in cls.ASPECT_RATIO_PRESETS:
                return cls.ASPECT_RATIO_PRESETS[aspect_ratio]
            if ar_pair:
                rw, rh = ar_pair
                if rw >= rh:
                    base_w = 1920
                    base_h = int(round(base_w * rh / rw))
                else:
                    base_w = 1080
                    base_h = int(round(base_w * rh / rw))
                w = base_w if base_w % 2 == 0 else base_w + 1
                h = base_h if base_h % 2 == 0 else base_h + 1
                return w, h

        return None, None

    @staticmethod
    def calculate_target_bitrate_kbps(
        target_size_mb: float,
        effective_duration: float,
        audio_bitrate_kbps: int = 128,
        remove_audio: bool = False,
    ) -> int:
        """Calculate required video bitrate in kbps to reach a target file size.

        Formula:
            total_bits = target_size_mb * 8 * 1024 * 1024
            audio_bits = (audio_bitrate_kbps * 1000) * effective_duration (or 0 if remove_audio)
            video_bits = max(total_bits - audio_bits, 100000)
            video_bitrate_kbps = int(video_bits / effective_duration / 1000)
        """
        if effective_duration <= 0:
            raise ValueError(f"effective_duration ({effective_duration}s) must be strictly greater than 0")

        total_bits = target_size_mb * 8.0 * 1024.0 * 1024.0
        audio_bits = 0.0 if remove_audio else (float(audio_bitrate_kbps) * 1000.0 * effective_duration)
        video_bits = max(total_bits - audio_bits, 100000.0)
        video_bitrate_kbps = int(video_bits / effective_duration / 1000.0)
        return max(video_bitrate_kbps, 50)

    def build_video_filters(self, config: VideoFilterConfig) -> list[str]:
        """Generate video filter expressions (-vf) for dimensions, fitting, and fps."""
        filters: list[str] = []

        w, h = self.resolve_dimensions(config.width, config.height, config.aspect_ratio)

        if w is not None and h is not None:
            if config.fit_mode == "pad":
                filters.append(
                    f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"
                )
            elif config.fit_mode == "crop":
                filters.append(
                    f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}:(in_w-{w})/2:(in_h-{h})/2"
                )
            else:  # scale
                filters.append(f"scale={w}:{h}")
        elif w is not None and h is None:
            filters.append(f"scale={w}:-2")
        elif h is not None and w is None:
            filters.append(f"scale=-2:{h}")

        if config.fps is not None and config.fps > 0:
            filters.append(f"fps=fps={config.fps}")

        # AI Suite: Burn-in Subtitles with dynamic typography & style presets
        if config.burn_subtitles and config.subtitle_file_path:
            safe_sub_path = os.path.abspath(config.subtitle_file_path).replace("\\", "/").replace(":", "\\:")
            font_name = config.subtitle_font or "Arial"
            font_size = config.subtitle_font_size or 22
            ass_primary = hex_to_ass_color(config.subtitle_color or "#FFFFFF")

            style_parts = [
                f"FontName={font_name}",
                f"FontSize={font_size}",
                f"PrimaryColour={ass_primary}",
            ]

            preset = config.subtitle_style_preset or "outline"
            if preset == "box":
                style_parts.extend(["BorderStyle=3", "Outline=0", "BackColour=&H80000000", "Shadow=0"])
            elif preset == "yellow_pop":
                style_parts.extend(["PrimaryColour=&H0000E6FF", "BorderStyle=1", "Outline=3", "OutlineColour=&H00000000", "Shadow=1", "ShadowColour=&H80000000"])
            elif preset == "shadow":
                style_parts.extend(["BorderStyle=1", "Outline=1", "OutlineColour=&H00000000", "Shadow=2.5", "ShadowColour=&H90000000"])
            elif preset == "bar":
                style_parts.extend(["BorderStyle=4", "Outline=1", "BackColour=&HA0000000"])
            else:  # outline (default)
                style_parts.extend(["BorderStyle=1", "Outline=2.2", "OutlineColour=&H00000000", "Shadow=0"])

            effective_w = w or 1280
            effective_h = h or 720
            margin_x = max(20, int(effective_w * (1.0 - (config.subtitle_max_width_pct or 80) / 100.0) / 2.0))
            
            style_parts.append(f"MarginL={margin_x}")
            style_parts.append(f"MarginR={margin_x}")
            style_parts.append("WrapStyle=0")

            pos = config.subtitle_position or "bottom"
            if pos == "top":
                style_parts.extend(["Alignment=6", f"MarginV={max(20, int(effective_h * 0.08))}"])
            elif pos == "middle":
                style_parts.extend(["Alignment=5", "MarginV=0"])
            else:
                margin_v = max(20, int(effective_h * (1.0 - (config.subtitle_y_pos_pct or 85) / 100.0)))
                style_parts.extend(["Alignment=2", f"MarginV={margin_v}"])

            style_str = f"force_style='{','.join(style_parts)}'"
            filters.append(f"subtitles=filename='{safe_sub_path}':{style_str}")

        # Custom Text Overlays (Videoya Serbest Metin / Başlık Ekleme)
        if config.text_overlays:
            for txt in config.text_overlays:
                if not txt.text or not txt.text.strip():
                    continue
                safe_text = (
                    txt.text.replace("\\", "\\\\")
                    .replace("'", "'\\''")
                    .replace("%", "\\%")
                    .replace(":", "\\:")
                )
                dt_parts = [
                    f"text='{safe_text}'",
                    f"fontsize={txt.font_size}",
                    f"fontcolor={txt.color}",
                    f"font='{txt.font_family}'",
                    f"x=(w-text_w)*{txt.pos_x/100:.3f}",
                    f"y=(h-text_h)*{txt.pos_y/100:.3f}",
                    f"enable='between(t,{txt.start_time:.3f},{txt.end_time:.3f})'",
                ]
                if txt.box_enabled:
                    dt_parts.append(f"box=1:boxcolor={txt.bg_color}:boxborderw={txt.box_border_width}")
                if txt.shadow:
                    dt_parts.append("shadowcolor=black@0.6:shadowx=2:shadowy=2")
                filters.append(f"drawtext={':'.join(dt_parts)}")

        return filters

    @staticmethod
    def get_rnnoise_model_path() -> Optional[str]:
        """Locate the bundled RNNoise neural model (bd.rnnn)."""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_dir, "models", "bd.rnnn")
        if os.path.exists(model_path):
            return model_path
        return None

    def calculate_keep_intervals(
        self,
        source_duration: float,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        cut_out_segments: Optional[list[CutSegment]] = None,
    ) -> list[tuple[float, Optional[float]]]:
        """Compute the [start, end] intervals to preserve after removing cut_out_segments."""
        t_start = max(0.0, start_time or 0.0)
        t_end = end_time if end_time is not None else (source_duration if source_duration > 0 else None)

        if not cut_out_segments:
            if t_end is not None and t_start >= t_end:
                return []
            return [(t_start, t_end)]

        valid_cuts: list[tuple[float, float]] = []
        for seg in cut_out_segments:
            s = max(t_start, seg.start)
            e = min(t_end, seg.end) if t_end is not None else seg.end
            if s < e:
                valid_cuts.append((s, e))

        if not valid_cuts:
            return [(t_start, t_end)]

        valid_cuts.sort(key=lambda x: x[0])

        merged_cuts: list[tuple[float, float]] = []
        cur_s, cur_e = valid_cuts[0]
        for s, e in valid_cuts[1:]:
            if s <= cur_e:
                cur_e = max(cur_e, e)
            else:
                merged_cuts.append((cur_s, cur_e))
                cur_s, cur_e = s, e
        merged_cuts.append((cur_s, cur_e))

        keep_intervals: list[tuple[float, Optional[float]]] = []
        cur_pos = t_start
        for cut_s, cut_e in merged_cuts:
            if cut_s > cur_pos:
                keep_intervals.append((cur_pos, cut_s))
            cur_pos = max(cur_pos, cut_e)

        if t_end is not None:
            if cur_pos < t_end:
                keep_intervals.append((cur_pos, t_end))
        else:
            keep_intervals.append((cur_pos, None))

        return keep_intervals

    @staticmethod
    def _build_encoder_options(
        video_codec: str,
        mode: str,
        crf: int = 23,
        preset: str = "medium",
        bitrate_kbps: Optional[int] = None,
    ) -> list[str]:
        """Generate encoder CLI options supporting hardware (NVENC, QSV, AMF) and CPU backends."""
        if mode == "copy":
            return ["-c:v", "copy"]

        opts: list[str] = ["-c:v", video_codec]
        is_nvenc = "nvenc" in video_codec
        is_qsv = "qsv" in video_codec
        is_amf = "amf" in video_codec

        if is_nvenc:
            # Map standard presets to NVENC p1-p7
            nv_preset = "p4"
            if preset in ("ultrafast", "superfast", "veryfast", "fast"):
                nv_preset = "p2"
            elif preset in ("slow", "slower", "veryslow"):
                nv_preset = "p6"

            if mode == "crf":
                opts.extend(["-rc:v", "vbr", "-cq:v", str(crf), "-preset", nv_preset])
            elif mode == "target_size":
                assert bitrate_kbps is not None
                max_rate = int(bitrate_kbps * 1.5)
                buf_size = int(bitrate_kbps * 2.0)
                opts.extend([
                    "-b:v", f"{bitrate_kbps}k",
                    "-maxrate:v", f"{max_rate}k",
                    "-bufsize:v", f"{buf_size}k",
                    "-preset", nv_preset,
                ])
        elif is_qsv:
            if mode == "crf":
                opts.extend(["-global_quality", str(crf), "-preset", preset])
            elif mode == "target_size":
                assert bitrate_kbps is not None
                opts.extend(["-b:v", f"{bitrate_kbps}k", "-preset", preset])
        elif is_amf:
            if mode == "crf":
                opts.extend(["-rc", "cqp", "-qp_i", str(crf), "-qp_p", str(crf)])
            elif mode == "target_size":
                assert bitrate_kbps is not None
                opts.extend(["-b:v", f"{bitrate_kbps}k"])
        else:
            # Standard software CPU (libx264, libx265)
            if mode == "crf":
                opts.extend(["-crf", str(crf), "-preset", preset])
            elif mode == "target_size":
                assert bitrate_kbps is not None
                max_rate = int(bitrate_kbps * 1.5)
                buf_size = int(bitrate_kbps * 2.0)
                opts.extend([
                    "-b:v", f"{bitrate_kbps}k",
                    "-maxrate", f"{max_rate}k",
                    "-bufsize", f"{buf_size}k",
                    "-preset", preset,
                ])

        opts.extend(["-pix_fmt", "yuv420p"])
        return opts

    def build(
        self,
        input_path: str,
        output_path: str,
        config: VideoFilterConfig,
        source_duration: float = 0.0,
        extra_inputs: Optional[dict[str, str]] = None,
    ) -> list[str]:
        """Construct full ffmpeg command line arguments.

        Args:
            input_path: Source media file path.
            output_path: Destination output file path.
            config: Video transformation settings.
            source_duration: Source media duration in seconds (for target_size bitrate calculations).
            extra_inputs: Optional mapping from file_id to file path for multi-video projects.

        Returns:
            List of command line argument strings suitable for subprocess execution.
        """
        input_file = os.path.normpath(input_path)
        output_file = os.path.normpath(output_path)

        # Separate base video track (v1) and overlay video tracks (v2, v3 etc.)
        base_video_clips: list[tuple[TimelineClip, bool]] = []
        overlay_video_clips: list[tuple[TimelineClip, bool]] = []
        
        if config.timeline_tracks:
            for t in config.timeline_tracks:
                if t.type == "video":
                    if t.id == "v1" or not base_video_clips:
                        for c in t.clips:
                            base_video_clips.append((c, t.muted))
                    else:
                        for c in t.clips:
                            overlay_video_clips.append((c, t.muted))
            base_video_clips.sort(key=lambda item: item[0].timeline_start)
            overlay_video_clips.sort(key=lambda item: item[0].timeline_start)

        timeline_clips = base_video_clips if base_video_clips else overlay_video_clips
        has_timeline = len(timeline_clips) > 0 or len(overlay_video_clips) > 0

        keep_intervals = self.calculate_keep_intervals(
            source_duration=source_duration,
            start_time=config.start_time,
            end_time=config.end_time,
            cut_out_segments=config.cut_out_segments,
        )

        has_multi_cuts = len(config.cut_out_segments) > 0 and len(keep_intervals) > 1

        if (has_timeline or has_multi_cuts) and config.mode == "copy":
            raise ValueError(
                "Cannot use 'copy' mode when cutting out segments or assembling timeline clips. "
                "Re-encoding is required for seamless splicing."
            )

        # Check for multiple tracks with media clips (e.g. V1 & V2, or V1 & A1)
        tracks_with_clips = [t for t in (config.timeline_tracks or []) if t.clips]
        is_multi_track = len(tracks_with_clips) > 1 or any(t.type == "audio" for t in tracks_with_clips) or len(overlay_video_clips) > 0

        if has_timeline:
            input_files: list[str] = [input_file]
            file_to_idx: dict[str, int] = {}
            if extra_inputs:
                for fid, fpath in extra_inputs.items():
                    norm_p = os.path.normpath(fpath)
                    if norm_p not in input_files:
                        input_files.append(norm_p)
                    file_to_idx[fid] = input_files.index(norm_p)

            n_clips = len(base_video_clips)
            complex_filters: list[str] = []
            v_inputs: list[str] = []
            a_inputs: list[str] = []

            for i, (clip, track_muted) in enumerate(base_video_clips):
                v_tag = f"v{i}"
                in_idx = file_to_idx.get(clip.file_id, 0) if clip.file_id else 0
                speed = clip.speed if clip.speed > 0 else 1.0
                pts_speed = f"setpts={1.0 / speed:.4f}*(PTS-STARTPTS)" if speed != 1.0 else "setpts=PTS-STARTPTS"
                v_trim = f"[{in_idx}:v]trim=start={clip.in_point:.3f}:end={clip.out_point:.3f},{pts_speed}[{v_tag}]"
                complex_filters.append(v_trim)
                v_inputs.append(f"[{v_tag}]")

                if not is_multi_track and not config.remove_audio and not track_muted:
                    a_tag = f"a{i}"
                    atrim_parts = [
                        f"atrim=start={clip.in_point:.3f}:end={clip.out_point:.3f}",
                        "asetpts=PTS-STARTPTS"
                    ]
                    if speed != 1.0:
                        atrim_parts.append(f"atempo={speed:.4f}")
                    if clip.volume != 1.0:
                        atrim_parts.append(f"volume={clip.volume:.2f}")
                    if clip.denoise:
                        nr_val = 12 if clip.denoise_level == "low" else (25 if clip.denoise_level == "high" else 18)
                        nf_val = -50 if clip.denoise_level == "low" else (-40 if clip.denoise_level == "high" else -45)
                        atrim_parts.extend(["highpass=f=80", f"afftdn=nr={nr_val}:nf={nf_val}:tn=1", "lowpass=f=12000"])
                    if clip.neural_voice_isolation or config.neural_voice_isolation:
                        mix = clip.voice_isolation_mix if clip.neural_voice_isolation else config.voice_isolation_mix
                        model_path = self.get_rnnoise_model_path()
                        if model_path:
                            safe_model_path = model_path.replace("\\", "/").replace(":", "\\:")
                            atrim_parts.append(f"arnndn=m='{safe_model_path}':mix={mix:.2f}")
                    if clip.normalize_audio or config.normalize_audio:
                        target_l = clip.target_lufs if clip.normalize_audio else config.target_lufs
                        atrim_parts.append(f"loudnorm=I={target_l:.1f}:LRA=11:TP=-1.5")
                    atrim_filter = f"[{in_idx}:a]" + ",".join(atrim_parts) + f"[{a_tag}]"
                    complex_filters.append(atrim_filter)
                    a_inputs.append(f"[{a_tag}]")

            # Multi-Track Audio Mixing: collect all unmuted clips across all tracks (video & audio)
            if is_multi_track and not config.remove_audio:
                all_audio_clips: list[tuple[TimelineClip, int]] = []
                for t in tracks_with_clips:
                    if not t.muted:
                        for c in t.clips:
                            in_idx = file_to_idx.get(c.file_id, 0) if c.file_id else 0
                            all_audio_clips.append((c, in_idx))

                for j, (aclip, in_idx) in enumerate(all_audio_clips):
                    a_tag = f"aud{j}"
                    speed = aclip.speed if aclip.speed > 0 else 1.0
                    delay_ms = max(0, int(round(aclip.timeline_start * 1000)))
                    afilters = [
                        f"atrim=start={aclip.in_point:.3f}:end={aclip.out_point:.3f}",
                        "asetpts=PTS-STARTPTS",
                    ]
                    if speed != 1.0:
                        afilters.append(f"atempo={speed:.4f}")
                    if aclip.volume != 1.0:
                        afilters.append(f"volume={aclip.volume:.2f}")
                    # Phase 2: Denoise filter
                    if aclip.denoise:
                        nr_val = 12 if aclip.denoise_level == "low" else (25 if aclip.denoise_level == "high" else 18)
                        nf_val = -50 if aclip.denoise_level == "low" else (-40 if aclip.denoise_level == "high" else -45)
                        afilters.extend(["highpass=f=80", f"afftdn=nr={nr_val}:nf={nf_val}:tn=1", "lowpass=f=12000"])
                    # AI Suite: Neural Voice Isolation (RNNoise)
                    if aclip.neural_voice_isolation or config.neural_voice_isolation:
                        mix = aclip.voice_isolation_mix if aclip.neural_voice_isolation else config.voice_isolation_mix
                        model_path = self.get_rnnoise_model_path()
                        if model_path:
                            safe_model_path = model_path.replace("\\", "/").replace(":", "\\:")
                            afilters.append(f"arnndn=m='{safe_model_path}':mix={mix:.2f}")
                    # Phase 2: Loudness Normalization
                    if aclip.normalize_audio or config.normalize_audio:
                        target_l = aclip.target_lufs if aclip.normalize_audio else config.target_lufs
                        afilters.append(f"loudnorm=I={target_l:.1f}:LRA=11:TP=-1.5")
                    afilters.append(f"adelay={delay_ms}|{delay_ms}")
                    filter_chain = f"[{in_idx}:a]" + ",".join(afilters) + f"[{a_tag}]"
                    complex_filters.append(filter_chain)
                    a_inputs.append(f"[{a_tag}]")

            # Check if any transition is configured between clips
            any_transitions = any(getattr(c, "transition_out", None) for c, _ in base_video_clips[:-1])

            if n_clips > 1 and any_transitions:
                from app.engine.transitions import TransitionManager
                curr_v = v_inputs[0]
                curr_a = a_inputs[0] if (not is_multi_track and not config.remove_audio and len(a_inputs) == n_clips) else None
                accum_dur = base_video_clips[0][0].duration

                for i in range(n_clips - 1):
                    clip_a = base_video_clips[i][0]
                    clip_b = base_video_clips[i + 1][0]
                    next_v = v_inputs[i + 1]
                    next_a = a_inputs[i + 1] if curr_a is not None else None

                    trans = clip_a.transition_out or "fade"
                    t_info = TransitionManager.get_transition_by_id(trans)
                    xfade_name = t_info["xfade_type"] if (t_info and "xfade_type" in t_info) else trans

                    trans_dur = min(clip_a.transition_duration or 0.5, accum_dur * 0.45, clip_b.duration * 0.45)
                    trans_dur = max(0.05, trans_dur)
                    offset = max(0.0, accum_dur - trans_dur)

                    out_v = f"v_xfade_{i}"
                    complex_filters.append(
                        f"{curr_v}{next_v}xfade=transition={xfade_name}:duration={trans_dur:.3f}:offset={offset:.3f}[{out_v}]"
                    )
                    curr_v = f"[{out_v}]"

                    if curr_a is not None and next_a is not None:
                        out_a = f"a_xfade_{i}"
                        complex_filters.append(
                            f"{curr_a}{next_a}acrossfade=d={trans_dur:.3f}:c1=tri:c2=tri[{out_a}]"
                        )
                        curr_a = f"[{out_a}]"

                    accum_dur = accum_dur + clip_b.duration - trans_dur

                current_v = curr_v
                current_a = curr_a
            elif n_clips > 1:
                if not is_multi_track and not config.remove_audio and len(a_inputs) == n_clips:
                    concat_parts = "".join(f"{v_inputs[i]}{a_inputs[i]}" for i in range(n_clips))
                    complex_filters.append(f"{concat_parts}concat=n={n_clips}:v=1:a=1[v_concat][a_concat]")
                    current_v = "[v_concat]"
                    current_a: Optional[str] = "[a_concat]"
                else:
                    concat_parts = "".join(v_inputs)
                    complex_filters.append(f"{concat_parts}concat=n={n_clips}:v=1:a=0[v_concat]")
                    current_v = "[v_concat]"
                    current_a = None
            elif n_clips == 1:
                current_v = v_inputs[0]
                current_a = a_inputs[0] if (not is_multi_track and len(a_inputs) == 1) else None
            else:
                current_v = "[0:v]"
                current_a = None

            # Phase 3: Multi-Layer Video Compositing / PIP Overlays
            if overlay_video_clips:
                for k, (ov_clip, _) in enumerate(overlay_video_clips):
                    in_idx = file_to_idx.get(ov_clip.file_id, 0) if ov_clip.file_id else 0
                    speed = ov_clip.speed if ov_clip.speed > 0 else 1.0
                    pts_speed = f"setpts={1.0 / speed:.4f}*(PTS-STARTPTS)" if speed != 1.0 else "setpts=PTS-STARTPTS"
                    ov_tag = f"ov_trim_{k}"
                    complex_filters.append(f"[{in_idx}:v]trim=start={ov_clip.in_point:.3f}:end={ov_clip.out_point:.3f},{pts_speed}[{ov_tag}]")
                    
                    ov_proc_tag = f"ov_proc_{k}"
                    ov_proc_filters = []
                    # Scale (PIP sizing)
                    if ov_clip.scale != 1.0:
                        ov_proc_filters.append(f"scale=iw*{ov_clip.scale:.3f}:-1")
                    # Rotation
                    if ov_clip.rotation != 0.0:
                        rot_rad = f"{ov_clip.rotation:.2f}*PI/180"
                        ov_proc_filters.append(f"rotate={rot_rad}:ow=rotw({rot_rad}):oh=roth({rot_rad}):c=none")
                    # Opacity
                    if ov_clip.opacity < 1.0:
                        ov_proc_filters.append(f"format=yuva420p,colorchannelmixer=aa={ov_clip.opacity:.2f}")

                    if ov_proc_filters:
                        complex_filters.append(f"[{ov_tag}]{','.join(ov_proc_filters)}[{ov_proc_tag}]")
                    else:
                        ov_proc_tag = ov_tag

                    # Overlay onto current base video stream
                    # pos_x, pos_y are percentage offsets from center (-100 to +100)
                    pos_x_expr = f"(W-w)/2+W*({ov_clip.pos_x:.2f}/100)" if ov_clip.pos_x != 0 else "(W-w)/2"
                    pos_y_expr = f"(H-h)/2+H*({ov_clip.pos_y:.2f}/100)" if ov_clip.pos_y != 0 else "(H-h)/2"
                    enable_expr = f"between(t,{ov_clip.timeline_start:.3f},{ov_clip.timeline_end:.3f})"
                    
                    next_v = f"[v_pip_{k}]"
                    complex_filters.append(
                        f"{current_v}[{ov_proc_tag}]overlay=x='{pos_x_expr}':y='{pos_y_expr}':enable='{enable_expr}'{next_v}"
                    )
                    current_v = next_v

            # If multi-track audio was gathered, mix all audio inputs together using amix
            if is_multi_track and not config.remove_audio and a_inputs:
                if len(a_inputs) == 1:
                    current_a = a_inputs[0]
                else:
                    all_a_str = "".join(a_inputs)
                    complex_filters.append(f"{all_a_str}amix=inputs={len(a_inputs)}:dropout_transition=0:normalize=0[a_mixed]")
                    current_a = "[a_mixed]"
            elif config.remove_audio:
                current_a = None

            # Apply additional transformations (aspect ratio, scale, crop, pad, fps)
            vf_list = self.build_video_filters(config)
            if vf_list:
                vf_str = ",".join(vf_list)
                complex_filters.append(f"{current_v}{vf_str}[v_out]")
                current_v = "[v_out]"

            cmd: list[str] = [get_ffmpeg_path(), "-y"]
            for inp in input_files:
                cmd.extend(["-i", inp])
            cmd.extend([
                "-filter_complex", ";".join(complex_filters),
                "-map", current_v,
            ])
            if current_a is not None:
                cmd.extend(["-map", current_a])
        elif has_multi_cuts:
            # Multi-segment trim + concat filtergraph
            n_segs = len(keep_intervals)
            complex_filters: list[str] = []
            v_inputs: list[str] = []
            a_inputs: list[str] = []

            for i, (seg_s, seg_e) in enumerate(keep_intervals):
                v_tag = f"v{i}"
                v_trim = f"[0:v]trim=start={seg_s:.3f}"
                if seg_e is not None:
                    v_trim += f":end={seg_e:.3f}"
                v_trim += f",setpts=PTS-STARTPTS[{v_tag}]"
                complex_filters.append(v_trim)
                v_inputs.append(f"[{v_tag}]")

                if not config.remove_audio:
                    a_tag = f"a{i}"
                    a_trim = f"[0:a]atrim=start={seg_s:.3f}"
                    if seg_e is not None:
                        a_trim += f":end={seg_e:.3f}"
                    a_trim += f",asetpts=PTS-STARTPTS[{a_tag}]"
                    complex_filters.append(a_trim)
                    a_inputs.append(f"[{a_tag}]")

            if not config.remove_audio:
                concat_parts = "".join(f"{v_inputs[i]}{a_inputs[i]}" for i in range(n_segs))
                complex_filters.append(f"{concat_parts}concat=n={n_segs}:v=1:a=1[v_concat][a_concat]")
                current_v = "[v_concat]"
                current_a: Optional[str] = "[a_concat]"
            else:
                concat_parts = "".join(v_inputs)
                complex_filters.append(f"{concat_parts}concat=n={n_segs}:v=1:a=0[v_concat]")
                current_v = "[v_concat]"
                current_a = None

            vf_list = self.build_video_filters(config)
            if vf_list:
                vf_str = ",".join(vf_list)
                complex_filters.append(f"{current_v}{vf_str}[v_out]")
                current_v = "[v_out]"

            cmd: list[str] = [
                get_ffmpeg_path(), "-y",
                "-i", input_file,
                "-filter_complex", ";".join(complex_filters),
                "-map", current_v,
            ]
            if current_a is not None:
                cmd.extend(["-map", current_a])
        else:
            # Standard single segment trim
            cmd = [get_ffmpeg_path(), "-y"]

            seek_before_input = config.fast_seek
            trim_flags: list[str] = []
            if config.start_time is not None:
                trim_flags.extend(["-ss", f"{config.start_time:.3f}"])
            if config.end_time is not None:
                trim_flags.extend(["-to", f"{config.end_time:.3f}"])

            if seek_before_input and trim_flags:
                cmd.extend(trim_flags)

            cmd.extend(["-i", input_file])

            if not seek_before_input and trim_flags:
                cmd.extend(trim_flags)

            vf_list = self.build_video_filters(config)
            if vf_list:
                if config.mode == "copy":
                    raise ValueError(
                        "Cannot use 'copy' mode when video filters (dimensions, crop, pad, fps) are applied. "
                        "Use 'crf' or 'target_size' instead."
                    )
                cmd.extend(["-vf", ",".join(vf_list)])

        # Encoding Mode options
        if config.mode == "copy":
            cmd.extend(self._build_encoder_options(config.video_codec, "copy"))
        elif config.mode == "crf":
            cmd.extend(self._build_encoder_options(
                video_codec=config.video_codec,
                mode="crf",
                crf=config.crf,
                preset=config.preset,
            ))
        elif config.mode == "target_size":
            if has_timeline:
                effective_duration = sum(c.duration for c, _ in timeline_clips)
            elif has_multi_cuts:
                effective_duration = sum((e - s) for s, e in keep_intervals if e is not None)
            else:
                start = config.start_time or 0.0
                end = config.end_time or source_duration
                effective_duration = end - start
            if effective_duration <= 0.0:
                raise ValueError(
                    f"Cannot calculate target size bitrate: effective duration is {effective_duration}s. "
                    "Please provide end_time or a valid source_duration."
                )
            v_bitrate_kbps = self.calculate_target_bitrate_kbps(
                target_size_mb=config.target_size_mb,
                effective_duration=effective_duration,
                audio_bitrate_kbps=config.audio_bitrate_kbps,
                remove_audio=config.remove_audio,
            )
            cmd.extend(self._build_encoder_options(
                video_codec=config.video_codec,
                mode="target_size",
                bitrate_kbps=v_bitrate_kbps,
                preset=config.preset,
            ))

        # Audio options
        if config.remove_audio:
            cmd.append("-an")
        else:
            if not has_timeline and not has_multi_cuts:
                simple_af = []
                if config.neural_voice_isolation:
                    model_path = self.get_rnnoise_model_path()
                    if model_path:
                        safe_model_path = model_path.replace("\\", "/").replace(":", "\\:")
                        simple_af.append(f"arnndn=m='{safe_model_path}':mix={config.voice_isolation_mix:.2f}")
                if config.normalize_audio:
                    simple_af.append(f"loudnorm=I={config.target_lufs:.1f}:LRA=11:TP=-1.5")
                if simple_af:
                    cmd.extend(["-af", ",".join(simple_af)])
            if config.mode == "copy" and not config.normalize_audio and not config.neural_voice_isolation:
                cmd.extend(["-c:a", "copy"])
            else:
                cmd.extend(["-c:a", "aac", "-b:a", f"{config.audio_bitrate_kbps}k"])

        # Container / muxer optimization
        ext = os.path.splitext(output_file)[1].lower()
        if ext in (".mp4", ".m4v", ".mov"):
            cmd.extend(["-movflags", "+faststart"])

        # Output destination
        cmd.append(output_file)

        return cmd
