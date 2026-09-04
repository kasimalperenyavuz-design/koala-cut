"""Smart Silence Detector & Auto Jump-Cut Service.

Uses FFmpeg's built-in silencedetect audio filter to identify silent periods,
compute speech intervals with safety padding, and generate ripple-cut segments.
"""

from __future__ import annotations

import re
import asyncio
from typing import Optional
from pydantic import BaseModel, Field

from app.engine.binaries import get_ffmpeg_path
from app.engine.probe import probe_media_async


class SilenceInterval(BaseModel):
    """A detected silent interval in the media."""
    start: float = Field(description="Start time in seconds")
    end: float = Field(description="End time in seconds")
    duration: float = Field(description="Duration in seconds")


class SpeechSegment(BaseModel):
    """A non-silent speech segment to keep."""
    start: float = Field(description="Start time in seconds")
    end: float = Field(description="End time in seconds")
    duration: float = Field(description="Duration in seconds")


class SilenceDetectionResult(BaseModel):
    """Complete silence analysis result."""
    total_duration: float
    silence_count: int
    total_silence_duration: float
    silent_intervals: list[SilenceInterval]
    speech_segments: list[SpeechSegment]
    saved_percent: float


class SilenceDetector:
    """Detects silence in video/audio files with sub-millisecond precision."""

    @staticmethod
    async def detect_silence(
        file_path: str,
        noise_threshold_db: float = -35.0,
        min_silence_sec: float = 0.5,
        padding_sec: float = 0.1,
    ) -> SilenceDetectionResult:
        """Run silencedetect filter and return structured silence & speech intervals."""
        meta = await probe_media_async(file_path)
        if isinstance(meta, dict):
            total_duration = float(meta.get("duration") or 0.0)
        else:
            total_duration = float(getattr(meta, "duration", 0.0) or 0.0)

        ffmpeg = get_ffmpeg_path()
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-nostats",
            "-i", file_path,
            "-vn",
            "-af", f"silencedetect=noise={noise_threshold_db}dB:d={min_silence_sec}",
            "-f", "null",
            "-",
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr_bytes = await process.communicate()
        stderr_text = stderr_bytes.decode("utf-8", errors="replace")

        re_start = re.compile(r"silence_start:\s*([0-9.]+)")
        re_end = re.compile(r"silence_end:\s*([0-9.]+)")

        raw_silences: list[tuple[float, float]] = []
        current_start: Optional[float] = None

        for line in stderr_text.splitlines():
            m_start = re_start.search(line)
            if m_start:
                current_start = float(m_start.group(1))
                continue

            m_end = re_end.search(line)
            if m_end and current_start is not None:
                end_val = float(m_end.group(1))
                raw_silences.append((current_start, end_val))
                current_start = None

        if current_start is not None and total_duration > current_start:
            raw_silences.append((current_start, total_duration))

        silent_intervals: list[SilenceInterval] = []
        total_silence = 0.0
        for s, e in raw_silences:
            dur = max(0.0, e - s)
            total_silence += dur
            silent_intervals.append(SilenceInterval(
                start=round(s, 3),
                end=round(e, 3),
                duration=round(dur, 3),
            ))

        speech_segments: list[SpeechSegment] = []
        if not raw_silences:
            if total_duration > 0:
                speech_segments.append(SpeechSegment(
                    start=0.0,
                    end=round(total_duration, 3),
                    duration=round(total_duration, 3),
                ))
        else:
            raw_speech: list[tuple[float, float]] = []
            cur_pos = 0.0

            for s_start, s_end in raw_silences:
                speech_end = min(total_duration, s_start + padding_sec)
                speech_start = max(0.0, cur_pos - (padding_sec if cur_pos > 0 else 0.0))

                if speech_end > speech_start:
                    raw_speech.append((speech_start, speech_end))

                cur_pos = s_end

            if cur_pos < total_duration:
                speech_start = max(0.0, cur_pos - padding_sec)
                if total_duration > speech_start:
                    raw_speech.append((speech_start, total_duration))

            if raw_speech:
                merged: list[tuple[float, float]] = []
                cur_s, cur_e = raw_speech[0]
                for n_s, n_e in raw_speech[1:]:
                    if n_s <= cur_e:
                        cur_e = max(cur_e, n_e)
                    else:
                        merged.append((cur_s, cur_e))
                        cur_s, cur_e = n_s, n_e
                merged.append((cur_s, cur_e))

                for ms, me in merged:
                    mdur = max(0.0, me - ms)
                    if mdur >= 0.1:
                        speech_segments.append(SpeechSegment(
                            start=round(ms, 3),
                            end=round(me, 3),
                            duration=round(mdur, 3),
                        ))

        saved_percent = round((total_silence / total_duration * 100), 1) if total_duration > 0 else 0.0

        return SilenceDetectionResult(
            total_duration=round(total_duration, 3),
            silence_count=len(silent_intervals),
            total_silence_duration=round(total_silence, 3),
            silent_intervals=silent_intervals,
            speech_segments=speech_segments,
            saved_percent=min(100.0, max(0.0, saved_percent)),
        )
