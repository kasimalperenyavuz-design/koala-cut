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
    start: float = Field(ge=0.0, description="Start timestamp in seconds")
    end: float = Field(gt=0.0, description="End timestamp in seconds")

    @model_validator(mode="after")
    def validate_segment(self) -> "CutSegment":
        if self.start >= self.end:
            raise ValueError(f"Segment start ({self.start}) must be strictly less than end ({self.end})")
        return self


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
    fast_seek: bool = Field(default=True, description="Place trim flags before input for fast seek")
    hwaccel: str = Field(default="auto", description="Hardware acceleration mode ('auto', 'nvenc', 'qsv', 'amf', 'cpu')")

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

        return filters

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
    ) -> list[str]:
        """Construct full ffmpeg command line arguments.

        Args:
            input_path: Source media file path.
            output_path: Destination output file path.
            config: Video transformation settings.
            source_duration: Source media duration in seconds (for target_size bitrate calculations).

        Returns:
            List of command line argument strings suitable for subprocess execution.
        """
        input_file = os.path.normpath(input_path)
        output_file = os.path.normpath(output_path)

        keep_intervals = self.calculate_keep_intervals(
            source_duration=source_duration,
            start_time=config.start_time,
            end_time=config.end_time,
            cut_out_segments=config.cut_out_segments,
        )

        has_multi_cuts = len(config.cut_out_segments) > 0 and len(keep_intervals) > 1

        if has_multi_cuts and config.mode == "copy":
            raise ValueError(
                "Cannot use 'copy' mode when cutting out segments. "
                "Re-encoding is required for seamless splicing."
            )

        if has_multi_cuts:
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
            assert config.target_size_mb is not None
            if has_multi_cuts:
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
            if config.mode == "copy":
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
