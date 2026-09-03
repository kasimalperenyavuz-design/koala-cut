"""ffprobe metadata extraction engine.

Extracts duration, dimensions, aspect ratio, frame rate, codecs, and bitrates
from multimedia files with robust error handling.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import asyncio
from typing import Any, Optional
from pydantic import BaseModel, Field

from app.engine.binaries import get_ffprobe_path


class ProbeError(Exception):
    """Raised when ffprobe fails or media is corrupted/unreadable."""
    pass


class VideoMetadata(BaseModel):
    """Metadata for a video stream."""
    width: int
    height: int
    aspect_ratio: str
    fps: float
    codec: str


class AudioMetadata(BaseModel):
    """Metadata for an audio stream."""
    codec: str
    channels: int
    sample_rate: int
    bitrate: int


class MediaMetadata(BaseModel):
    """Normalized metadata for a media file."""
    duration: float = Field(description="Duration in seconds")
    size_bytes: int = Field(description="File size in bytes")
    bitrate: int = Field(description="Total container bitrate in bps")
    video: Optional[VideoMetadata] = None
    audio: Optional[AudioMetadata] = None


def _calculate_aspect_ratio(width: int, height: int, dar: Optional[str] = None) -> str:
    """Calculate or normalize the aspect ratio string (e.g. '16:9', '9:16', '1:1')."""
    standard_ratios = [
        (16, 9),
        (9, 16),
        (4, 3),
        (3, 4),
        (1, 1),
        (4, 5),
        (5, 4),
        (21, 9),
        (9, 21),
        (3, 2),
        (2, 3),
        (16, 10),
        (10, 16),
    ]

    if dar and ":" in dar and dar != "0:1" and dar != "0:0":
        parts = dar.split(":")
        try:
            w_val = int(parts[0])
            h_val = int(parts[1])
            if w_val > 0 and h_val > 0:
                dar_ratio = w_val / h_val
                for rw, rh in standard_ratios:
                    if abs(dar_ratio - (rw / rh)) < 0.02:
                        return f"{rw}:{rh}"
                return f"{w_val}:{h_val}"
        except ValueError:
            pass

    if width <= 0 or height <= 0:
        return "unknown"

    actual = width / height
    for rw, rh in standard_ratios:
        if abs(actual - (rw / rh)) < 0.02:
            return f"{rw}:{rh}"

    gcd = math.gcd(width, height)
    if gcd > 1:
        rw = width // gcd
        rh = height // gcd
        if rw < 100 and rh < 100:
            return f"{rw}:{rh}"

    return f"{round(actual, 2)}:1"


def _parse_fps(stream: dict[str, Any]) -> float:
    """Parse FPS from avg_frame_rate or r_frame_rate safely."""
    for key in ("avg_frame_rate", "r_frame_rate"):
        val = stream.get(key)
        if val and val != "0/0":
            if "/" in val:
                num, den = val.split("/", 1)
                try:
                    num_f, den_f = float(num), float(den)
                    if den_f > 0:
                        fps = num_f / den_f
                        if fps > 0:
                            return round(fps, 3)
                except (ValueError, ZeroDivisionError):
                    pass
            else:
                try:
                    fps = float(val)
                    if fps > 0:
                        return round(fps, 3)
                except ValueError:
                    pass
    return 0.0


def _parse_float(value: Any, default: float = 0.0) -> float:
    """Safely parse float value."""
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def _parse_int(value: Any, default: int = 0) -> int:
    """Safely parse integer value."""
    if value is None:
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def _process_ffprobe_json(data: dict[str, Any], file_path: str) -> dict[str, Any]:
    """Parse ffprobe JSON output into the standardized dictionary."""
    format_info = data.get("format", {})
    streams = data.get("streams", [])

    # Find video and audio streams
    video_stream: Optional[dict[str, Any]] = None
    audio_stream: Optional[dict[str, Any]] = None

    for s in streams:
        codec_type = s.get("codec_type")
        disposition = s.get("disposition", {})
        is_attached_pic = disposition.get("attached_pic", 0) == 1

        if codec_type == "video" and not is_attached_pic and video_stream is None:
            video_stream = s
        elif codec_type == "audio" and audio_stream is None:
            audio_stream = s

    # Duration parsing: format.duration > video.duration > audio.duration
    duration = _parse_float(format_info.get("duration"))
    if duration <= 0.0 and video_stream:
        duration = _parse_float(video_stream.get("duration"))
    if duration <= 0.0 and audio_stream:
        duration = _parse_float(audio_stream.get("duration"))

    # Size parsing: format.size > file stat
    size_bytes = _parse_int(format_info.get("size"))
    if size_bytes <= 0 and os.path.isfile(file_path):
        try:
            size_bytes = os.path.getsize(file_path)
        except OSError:
            size_bytes = 0

    # Bitrate parsing: format.bit_rate > calculated
    bitrate = _parse_int(format_info.get("bit_rate"))
    if bitrate <= 0 and size_bytes > 0 and duration > 0:
        bitrate = int((size_bytes * 8) / duration)

    video_dict: Optional[dict[str, Any]] = None
    if video_stream is not None:
        v_width = _parse_int(video_stream.get("width"))
        v_height = _parse_int(video_stream.get("height"))
        dar = video_stream.get("display_aspect_ratio")
        aspect_ratio = _calculate_aspect_ratio(v_width, v_height, dar)
        fps = _parse_fps(video_stream)
        v_codec = video_stream.get("codec_name", "") or ""

        video_dict = {
            "width": v_width,
            "height": v_height,
            "aspect_ratio": aspect_ratio,
            "fps": fps,
            "codec": v_codec,
        }

    audio_dict: Optional[dict[str, Any]] = None
    if audio_stream is not None:
        a_codec = audio_stream.get("codec_name", "") or ""
        a_channels = _parse_int(audio_stream.get("channels"))
        a_sample_rate = _parse_int(audio_stream.get("sample_rate"))
        a_bitrate = _parse_int(audio_stream.get("bit_rate"))
        if a_bitrate <= 0:
            # Check tags for BPS or bps
            tags = audio_stream.get("tags", {})
            bps = tags.get("BPS") or tags.get("bps")
            if bps:
                a_bitrate = _parse_int(bps)

        audio_dict = {
            "codec": a_codec,
            "channels": a_channels,
            "sample_rate": a_sample_rate,
            "bitrate": a_bitrate,
        }

    return {
        "duration": round(duration, 3),
        "size_bytes": size_bytes,
        "bitrate": bitrate,
        "video": video_dict,
        "audio": audio_dict,
    }


def probe_media(file_path: str) -> dict[str, Any]:
    """Execute ffprobe to extract media metadata synchronously.

    Args:
        file_path: Absolute or relative path to the media file.

    Returns:
        Dictionary containing duration, size_bytes, bitrate, video, and audio metadata.

    Raises:
        FileNotFoundError: If the file does not exist.
        ProbeError: If ffprobe encounters an error or output cannot be parsed.
    """
    resolved_path = os.path.abspath(file_path)
    if not os.path.isfile(resolved_path):
        raise FileNotFoundError(f"Media file does not exist: {file_path}")

    cmd = [
        get_ffprobe_path(),
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        resolved_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        raise ProbeError("ffprobe executable not found on system PATH.")
    except Exception as exc:
        raise ProbeError(f"Failed to execute ffprobe: {exc}") from exc

    if result.returncode != 0:
        stderr_msg = result.stderr.strip() if result.stderr else "Unknown error"
        raise ProbeError(f"ffprobe failed (exit code {result.returncode}): {stderr_msg}")

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ProbeError(f"Failed to parse ffprobe JSON output: {exc}") from exc

    return _process_ffprobe_json(data, resolved_path)


async def probe_media_async(file_path: str) -> dict[str, Any]:
    """Execute ffprobe asynchronously to extract media metadata.

    Args:
        file_path: Path to the media file.

    Returns:
        Dictionary containing metadata.

    Raises:
        FileNotFoundError: If the file does not exist.
        ProbeError: If ffprobe encounters an error.
    """
    resolved_path = os.path.abspath(file_path)
    if not os.path.isfile(resolved_path):
        raise FileNotFoundError(f"Media file does not exist: {file_path}")

    cmd = [
        get_ffprobe_path(),
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        resolved_path,
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_data, stderr_data = await proc.communicate()
    except FileNotFoundError:
        raise ProbeError("ffprobe executable not found on system PATH.")
    except Exception as exc:
        raise ProbeError(f"Failed to execute ffprobe: {exc}") from exc

    if proc.returncode != 0:
        stderr_msg = stderr_data.decode("utf-8", errors="replace").strip()
        raise ProbeError(f"ffprobe failed (exit code {proc.returncode}): {stderr_msg}")

    try:
        raw_json = stdout_data.decode("utf-8", errors="replace")
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ProbeError(f"Failed to parse ffprobe JSON output: {exc}") from exc

    return _process_ffprobe_json(data, resolved_path)
