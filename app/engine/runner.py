"""Asynchronous FFmpeg process runner with real-time stderr progress parsing.

Supports real-time parsing of frame, fps, time, bitrate, speed, eta, and percentage,
with progress callback support and graceful task cancellation.
"""

from __future__ import annotations

import asyncio
import inspect
import re
import time
from typing import Any, Callable, Optional, Union
from pydantic import BaseModel, Field


class FFmpegExecutionError(Exception):
    """Raised when FFmpeg process terminates with a non-zero exit code."""
    def __init__(self, message: str, returncode: int, stderr: str):
        super().__init__(message)
        self.message = message
        self.returncode = returncode
        self.stderr = stderr


class FFmpegCancelledError(Exception):
    """Raised when an active FFmpeg process is explicitly cancelled."""
    pass


class FFmpegProgress(BaseModel):
    """Structured progress metrics emitted during transcoding."""
    percent: float = Field(ge=0.0, le=100.0, description="Completion percentage")
    time: str = Field(description="Current video timestamp formatted as HH:MM:SS.xx")
    time_seconds: float = Field(description="Current video timestamp in seconds")
    fps: float = Field(description="Current processing frame rate")
    speed: float = Field(description="Processing speed multiplier (e.g. 1.5 for 1.5x realtime)")
    speed_str: str = Field(description="Processing speed as string (e.g. '1.5x')")
    bitrate: str = Field(description="Current bitrate string")
    frame: int = Field(description="Total encoded frames so far")
    eta: Optional[float] = Field(default=None, description="Estimated remaining time in seconds")
    expected_duration: float = Field(description="Total expected target duration in seconds")


class FFmpegResult(BaseModel):
    """Execution result metadata."""
    returncode: int
    success: bool
    stderr: str
    elapsed_seconds: float


ProgressCallback = Callable[[dict[str, Any]], Union[None, Any]]


class AsyncFFmpegRunner:
    """Runs FFmpeg asynchronously and streams parsed progress statistics."""

    # Pre-compiled regex patterns for stderr parsing
    TIME_PATTERN = re.compile(r"time=(-?(\d+):(\d{2}):(\d{2}(?:\.\d+)?))")
    FRAME_PATTERN = re.compile(r"frame=\s*(\d+)")
    FPS_PATTERN = re.compile(r"fps=\s*([\d.]+)")
    SPEED_PATTERN = re.compile(r"speed=\s*([\d.]+)x")
    BITRATE_PATTERN = re.compile(r"bitrate=\s*([\d.]+\s*(?:kbits/s|mbits/s|bits/s|kbps|N/A))")

    def __init__(self, on_progress: Optional[ProgressCallback] = None):
        """Initialize runner.

        Args:
            on_progress: Optional async or sync callable that accepts progress dictionary.
        """
        self.on_progress = on_progress
        self._process: Optional[asyncio.subprocess.Process] = None
        self._is_cancelled: bool = False
        self._last_progress: Optional[dict[str, Any]] = None

    @property
    def is_cancelled(self) -> bool:
        return self._is_cancelled

    @property
    def last_progress(self) -> Optional[dict[str, Any]]:
        return self._last_progress

    @staticmethod
    def _parse_time_to_seconds(time_str: str) -> float:
        """Convert HH:MM:SS.xx or MM:SS.xx timestamp to seconds."""
        time_str = time_str.strip()
        is_negative = time_str.startswith("-")
        if is_negative:
            time_str = time_str[1:]

        parts = time_str.split(":")
        try:
            if len(parts) == 3:
                h, m, s = float(parts[0]), float(parts[1]), float(parts[2])
                sec = h * 3600.0 + m * 60.0 + s
            elif len(parts) == 2:
                m, s = float(parts[0]), float(parts[1])
                sec = m * 60.0 + s
            else:
                sec = float(parts[0])
            return -sec if is_negative else sec
        except (ValueError, IndexError):
            return 0.0

    async def _emit_progress(
        self,
        line: str,
        expected_duration: float,
        start_time: float,
    ) -> None:
        """Parse a line from FFmpeg stderr and notify callback if progress found."""
        time_match = self.TIME_PATTERN.search(line)
        if not time_match:
            return

        time_raw = time_match.group(1)
        current_sec = self._parse_time_to_seconds(time_raw)

        frame_match = self.FRAME_PATTERN.search(line)
        frame_val = int(frame_match.group(1)) if frame_match else 0

        fps_match = self.FPS_PATTERN.search(line)
        fps_val = float(fps_match.group(1)) if fps_match else 0.0

        speed_match = self.SPEED_PATTERN.search(line)
        speed_val = float(speed_match.group(1)) if speed_match else 0.0
        speed_str = f"{speed_val:.2f}x" if speed_val > 0 else "N/A"

        bitrate_match = self.BITRATE_PATTERN.search(line)
        bitrate_str = bitrate_match.group(1) if bitrate_match else "N/A"

        # Percentage calculation
        if expected_duration > 0:
            pct = min(100.0, max(0.0, (current_sec / expected_duration) * 100.0))
        else:
            pct = 0.0

        # ETA calculation
        eta: Optional[float] = None
        if expected_duration > 0 and current_sec < expected_duration:
            rem_sec = expected_duration - current_sec
            if speed_val > 0:
                eta = round(rem_sec / speed_val, 1)
            else:
                elapsed = time.monotonic() - start_time
                if current_sec > 0 and elapsed > 0:
                    rate = current_sec / elapsed
                    if rate > 0:
                        eta = round(rem_sec / rate, 1)
        elif pct >= 100.0:
            eta = 0.0

        stats: dict[str, Any] = {
            "percent": round(pct, 2),
            "time": time_raw,
            "time_seconds": round(max(0.0, current_sec), 3),
            "fps": fps_val,
            "speed": speed_val,
            "speed_str": speed_str,
            "bitrate": bitrate_str,
            "frame": frame_val,
            "eta": eta,
            "expected_duration": round(expected_duration, 3),
        }

        self._last_progress = stats

        if self.on_progress is not None:
            try:
                res = self.on_progress(stats)
                if inspect.isawaitable(res):
                    await res
            except Exception:
                # Callback failures must not interrupt the transcoder
                pass

    async def cancel(self) -> None:
        """Gracefully terminate or kill the running FFmpeg subprocess."""
        self._is_cancelled = True
        proc = self._process
        if proc is None or proc.returncode is not None:
            return

        # Attempt graceful quit via stdin
        try:
            if proc.stdin and not proc.stdin.is_closing():
                proc.stdin.write(b"q\n")
                await proc.stdin.drain()
                proc.stdin.close()
        except Exception:
            pass

        # Allow up to 500ms for graceful shutdown
        try:
            await asyncio.wait_for(proc.wait(), timeout=0.5)
            return
        except asyncio.TimeoutError:
            pass

        # Force terminate
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=0.5)
            return
        except (asyncio.TimeoutError, ProcessLookupError):
            pass

        # Force kill as last resort
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass

    async def run(
        self,
        cmd: list[str],
        expected_duration: float = 0.0,
    ) -> FFmpegResult:
        """Run an FFmpeg command asynchronously and monitor progress.

        Args:
            cmd: Command arguments list.
            expected_duration: Target duration in seconds for progress calculation.

        Returns:
            FFmpegResult containing returncode, success, stderr logs, and elapsed time.

        Raises:
            FFmpegCancelledError: If cancel() was called during execution.
            FFmpegExecutionError: If FFmpeg returns a non-zero exit code.
        """
        self._is_cancelled = False
        self._last_progress = None
        start_time = time.monotonic()
        stderr_chunks: list[str] = []

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            raise FFmpegExecutionError(
                message="ffmpeg executable not found on system PATH.",
                returncode=-1,
                stderr="",
            )

        assert self._process.stderr is not None
        buffer = ""

        try:
            while True:
                chunk = await self._process.stderr.read(512)
                if not chunk:
                    break

                text = chunk.decode("utf-8", errors="replace")
                stderr_chunks.append(text)
                buffer += text

                # Process all complete lines delimited by \r or \n
                while "\r" in buffer or "\n" in buffer:
                    idx_r = buffer.find("\r")
                    idx_n = buffer.find("\n")
                    if idx_r != -1 and idx_n != -1:
                        split_idx = min(idx_r, idx_n)
                    elif idx_r != -1:
                        split_idx = idx_r
                    else:
                        split_idx = idx_n

                    line = buffer[:split_idx].strip()
                    buffer = buffer[split_idx + 1:]

                    if line:
                        await self._emit_progress(line, expected_duration, start_time)

            # Finalize buffer if any line remained
            if buffer.strip():
                await self._emit_progress(buffer.strip(), expected_duration, start_time)

            returncode = await self._process.wait()

        except asyncio.CancelledError:
            await self.cancel()
            raise FFmpegCancelledError("FFmpeg task was cancelled by caller.")

        elapsed = time.monotonic() - start_time
        full_stderr = "".join(stderr_chunks)

        if self._is_cancelled:
            raise FFmpegCancelledError("FFmpeg execution was cancelled.")

        if returncode != 0:
            error_lines = [ln for ln in full_stderr.splitlines() if ln.strip()]
            error_summary = "\n".join(error_lines[-10:]) if error_lines else "Unknown error"
            raise FFmpegExecutionError(
                message=f"FFmpeg exited with status {returncode}: {error_summary}",
                returncode=returncode,
                stderr=full_stderr,
            )

        # Emit 100% completion if we had an expected duration
        if expected_duration > 0 and self.on_progress is not None:
            final_stats = {
                "percent": 100.0,
                "time": f"{int(expected_duration // 3600):02d}:{int((expected_duration % 3600) // 60):02d}:{expected_duration % 60:05.2f}",
                "time_seconds": round(expected_duration, 3),
                "fps": 0.0,
                "speed": 0.0,
                "speed_str": "completed",
                "bitrate": "N/A",
                "frame": (self._last_progress or {}).get("frame", 0),
                "eta": 0.0,
                "expected_duration": round(expected_duration, 3),
            }
            try:
                res = self.on_progress(final_stats)
                if inspect.isawaitable(res):
                    await res
            except Exception:
                pass

        return FFmpegResult(
            returncode=returncode,
            success=True,
            stderr=full_stderr,
            elapsed_seconds=round(elapsed, 3),
        )
