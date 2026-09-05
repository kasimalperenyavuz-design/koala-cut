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


class WordTiming(BaseModel):
    """Timestamp for an individual spoken word for kinetic/karaoke subtitles."""
    word: str = Field(description="Spoken word")
    start: float = Field(description="Start time in seconds")
    end: float = Field(description="End time in seconds")
    probability: float = Field(default=1.0, description="Confidence score")


def wrap_balanced_lines(text: str, max_chars: int = 32) -> str:
    """Intelligently split a single long subtitle line into two balanced lines at word boundaries."""
    text = text.strip()
    if len(text) <= max_chars or "\n" in text:
        return text
    
    words = text.split()
    if len(words) <= 2:
        return text

    total_len = len(text)
    half = total_len / 2
    best_idx = 1
    best_diff = float("inf")
    
    cur_len = 0
    for i in range(len(words) - 1):
        cur_len += len(words[i]) + 1
        diff = abs(cur_len - half)
        if diff < best_diff:
            best_diff = diff
            best_idx = i + 1

    line1 = " ".join(words[:best_idx])
    line2 = " ".join(words[best_idx:])
    return f"{line1}\n{line2}"


class SubtitleSegment(BaseModel):
    """A subtitle segment with millisecond timestamps, balanced text, and word-level timings."""
    id: int = Field(description="Sequential subtitle index")
    start: float = Field(description="Start time in seconds")
    end: float = Field(description="End time in seconds")
    text: str = Field(description="Transcribed text line")
    words: list[WordTiming] = Field(default_factory=list, description="Word-level timestamps for karaoke animations")

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


def _ensure_regular_files(folder: str | Path) -> None:
    """Ensure all model files in folder are regular files, resolving Windows symlinks to avoid CTranslate2 fopen errors."""
    folder_path = Path(folder)
    if not folder_path.exists():
        return
    for item in folder_path.rglob("*"):
        if item.is_file():
            try:
                # Check if it is a symlink or reparse point on Windows
                is_link = item.is_symlink()
                if not is_link and sys.platform == "win32":
                    attrs = item.stat().st_file_attributes
                    if attrs & 0x400:  # FILE_ATTRIBUTE_REPARSE_POINT
                        is_link = True

                if is_link:
                    resolved = item.resolve()
                    if resolved.is_file() and resolved != item:
                        content = resolved.read_bytes()
                        item.unlink()
                        item.write_bytes(content)
            except Exception as e:
                logger.warning(f"Could not resolve symlink for {item}: {e}")


class SubtitleService:
    """Manages Whisper model instances and async audio transcription."""

    _models: dict[str, object] = {}
    _lock = asyncio.Lock()

    @classmethod
    def get_model(cls, model_size: str = "base"):
        """Load and cache the Faster-Whisper model in memory (INT8 on CPU)."""
        if model_size not in cls._models:
            from faster_whisper import WhisperModel
            from faster_whisper.utils import download_model

            from app.services.storage import get_storage_dirs
            _, out_dir = get_storage_dirs()
            model_dir = os.fspath(out_dir.parent / "models" / "whisper" / model_size)
            os.makedirs(model_dir, exist_ok=True)

            try:
                # Download as regular files (no symlinks) directly into model_dir
                model_path = download_model(model_size, output_dir=model_dir)
            except Exception as dl_err:
                logger.warning(f"download_model with output_dir failed, falling back to cache_dir: {dl_err}")
                model_path = download_model(model_size, cache_dir=model_dir)

            # Ensure any Windows symlinks/reparse points are resolved to actual regular files
            _ensure_regular_files(model_path)
            _ensure_regular_files(model_dir)

            cls._models[model_size] = WhisperModel(
                model_size_or_path=model_path,
                device="cpu",
                compute_type="int8",
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
        from app.services.storage import get_storage_dirs
        _, out_dir = get_storage_dirs()
        temp_dir = os.fspath(out_dir / "subtitles")
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
                    word_timestamps=True,
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

                words: list[WordTiming] = []
                if hasattr(seg, "words") and seg.words:
                    for w in seg.words:
                        w_text = w.word.strip()
                        if w_text:
                            words.append(
                                WordTiming(
                                    word=w_text,
                                    start=round(w.start, 3),
                                    end=round(w.end, 3),
                                    probability=round(getattr(w, "probability", 1.0), 2),
                                )
                            )

                # Wrap balanced lines for clean 2-line display on mobile & social
                balanced_text = wrap_balanced_lines(clean_text, max_chars=32)

                sub_seg = SubtitleSegment(
                    id=idx,
                    start=round(seg.start, 3),
                    end=round(seg.end, 3),
                    text=balanced_text,
                    words=words,
                )
                segments.append(sub_seg)

                # Build SRT block
                srt_lines.append(f"{idx}")
                srt_lines.append(f"{sub_seg.start_timecode_srt} --> {sub_seg.end_timecode_srt}")
                srt_lines.append(f"{balanced_text}\n")

                # Build VTT block
                vtt_lines.append(f"{idx}")
                vtt_lines.append(f"{sub_seg.start_timecode_vtt} --> {sub_seg.end_timecode_vtt}")
                vtt_lines.append(f"{balanced_text}\n")

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
