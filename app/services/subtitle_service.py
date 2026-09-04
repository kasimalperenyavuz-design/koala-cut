"""Fast AI Subtitle Generation Service powered by Faster-Whisper.

Optimized for lightweight CPU execution (INT8 quantization) with native
support for Turkish ("tr") and multilingual speech-to-text.
"""

from __future__ import annotations

import os
import uuid
import asyncio
from typing import Optional, Literal
from pydantic import BaseModel, Field

from app.engine.binaries import get_ffmpeg_path


class SubtitleSegment(BaseModel):
    """A subtitle segment with millisecond timestamps and text."""
    id: int = Field(description="Sequential subtitle index")
    start: float = Field(description="Start time in seconds")
    end: float = Field(description="End time in seconds")
    text: str = Field(description="Transcribed text line")

    @property
    def start_timecode_srt(self) -> str:
        return self._format_time(self.start, ",")

    @property
    def end_timecode_srt(self) -> str:
        return self._format_time(self.end, ",")

    @property
    def start_timecode_vtt(self) -> str:
        return self._format_time(self.start, ".")

    @property
    def end_timecode_vtt(self) -> str:
        return self._format_time(self.end, ".")

    @staticmethod
    def _format_time(seconds: float, ms_sep: str = ",") -> str:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        ms = int(round((seconds - int(seconds)) * 1000))
        return f"{hours:02d}:{minutes:02d}:{secs:02d}{ms_sep}{ms:03d}"


class SubtitleResult(BaseModel):
    """Transcription and subtitle generation output."""
    id: str = Field(description="Unique subtitle ID")
    language: str = Field(description="Detected or specified language code")
    model_size: str = Field(description="Whisper model size used")
    duration: float = Field(description="Audio duration transcribed")
    segments: list[SubtitleSegment] = Field(default_factory=list)
    srt_content: str
    vtt_content: str
    srt_file_path: Optional[str] = None


class SubtitleService:
    """Manages Whisper model instances and async audio transcription."""

    _models: dict[str, object] = {}
    _lock = asyncio.Lock()

    @classmethod
    def get_model(cls, model_size: str = "base"):
        """Load and cache the Faster-Whisper model in memory (INT8 on CPU)."""
        if model_size not in cls._models:
            from faster_whisper import WhisperModel

            # Store models in project cache or local app data
            model_dir = os.path.join(os.getcwd(), "models", "whisper", model_size)
            os.makedirs(model_dir, exist_ok=True)

            cls._models[model_size] = WhisperModel(
                model_size_or_path=model_size,
                device="cpu",
                compute_type="int8",
                download_root=model_dir,
                cpu_threads=4,
            )
        return cls._models[model_size]

    @classmethod
    async def extract_audio_wav(cls, video_path: str, output_wav: str) -> bool:
        """Extract 16kHz mono 16-bit PCM WAV for maximum Whisper speed & accuracy."""
        ffmpeg = get_ffmpeg_path()
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-nostats",
            "-i", video_path,
            "-vn",
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            output_wav,
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return proc.returncode == 0 and os.path.exists(output_wav)

    @classmethod
    async def generate_subtitles(
        cls,
        video_path: str,
        language: Optional[str] = "tr",
        model_size: str = "base",
    ) -> SubtitleResult:
        """Transcribe video audio and generate structured SRT and VTT subtitles."""
        sub_id = str(uuid.uuid4())[:12]
        temp_dir = os.path.join(os.getcwd(), "outputs", "subtitles")
        os.makedirs(temp_dir, exist_ok=True)
        temp_wav = os.path.join(temp_dir, f"temp_{sub_id}.wav")

        try:
            # 1. Extract 16kHz audio
            extracted = await cls.extract_audio_wav(video_path, temp_wav)
            if not extracted:
                raise RuntimeError("Failed to extract audio track from video file.")

            # 2. Transcribe in threadpool to prevent blocking FastAPI event loop
            def _transcribe():
                model = cls.get_model(model_size)
                # If language is "auto" or empty, pass None for auto-detection
                lang_arg = language if language and language != "auto" else None
                segments_gen, info = model.transcribe(
                    temp_wav,
                    language=lang_arg,
                    beam_size=3,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=400),
                )
                # Realize generator to list inside worker thread
                return list(segments_gen), info

            async with cls._lock:
                raw_segments, info = await asyncio.to_thread(_transcribe)

            # 3. Format SubtitleSegment objects
            segments: list[SubtitleSegment] = []
            srt_lines: list[str] = []
            vtt_lines: list[str] = ["WEBVTT\n"]

            for idx, seg in enumerate(raw_segments, start=1):
                clean_text = seg.text.strip()
                if not clean_text:
                    continue

                sub_seg = SubtitleSegment(
                    id=idx,
                    start=round(seg.start, 3),
                    end=round(seg.end, 3),
                    text=clean_text,
                )
                segments.append(sub_seg)

                # Build SRT block
                srt_lines.append(f"{idx}")
                srt_lines.append(f"{sub_seg.start_timecode_srt} --> {sub_seg.end_timecode_srt}")
                srt_lines.append(f"{clean_text}\n")

                # Build VTT block
                vtt_lines.append(f"{idx}")
                vtt_lines.append(f"{sub_seg.start_timecode_vtt} --> {sub_seg.end_timecode_vtt}")
                vtt_lines.append(f"{clean_text}\n")

            srt_content = "\n".join(srt_lines)
            vtt_content = "\n".join(vtt_lines)

            # 4. Save persistent .srt file
            srt_file_path = os.path.join(temp_dir, f"sub_{sub_id}.srt")
            with open(srt_file_path, "w", encoding="utf-8") as f:
                f.write(srt_content)

            return SubtitleResult(
                id=sub_id,
                language=info.language if hasattr(info, "language") else (language or "tr"),
                model_size=model_size,
                duration=round(info.duration if hasattr(info, "duration") else 0.0, 2),
                segments=segments,
                srt_content=srt_content,
                vtt_content=vtt_content,
                srt_file_path=srt_file_path,
            )

        finally:
            # Clean up temporary WAV
            if os.path.exists(temp_wav):
                try:
                    os.remove(temp_wav)
                except Exception:
                    pass
