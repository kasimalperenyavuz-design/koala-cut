"""Universal browser-compatible preview generation service.

Browsers (Chrome, Edge, Firefox, Safari) natively play H.264 (AVC) with AAC audio
inside an MP4 container. Codecs like HEVC/H.265, ProRes, MPEG4, or containers
like MKV, AVI, WMV cannot be displayed by standard browser HTML5 <video> tags,
resulting in a black screen or decode error.

This service generates a lightweight, ultrafast 720p H.264 proxy for smooth
in-browser timeline scrubbing and preview, while preserving the original file
for high-fidelity final exports.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

from app.engine.binaries import get_ffmpeg_path
from app.engine.probe import MediaMetadata
from app.services.storage import storage_manager

logger = logging.getLogger(__name__)


def is_browser_compatible(metadata: MediaMetadata, file_path: Path) -> bool:
    """Check if the media can likely be played natively in browser HTML5 video/audio tags."""
    ext = file_path.suffix.lower()

    if not metadata.video:
        # Audio-only files (MP3, WAV, AAC, M4A, OGG, FLAC) play natively in browsers
        if metadata.audio:
            supported_audio_extensions = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
            return ext in supported_audio_extensions
        return False

    codec = (metadata.video.codec or "").lower().strip()

    # Modern browsers natively play H.264/AVC, VP8, VP9, AV1, and often HEVC in standard containers
    supported_codecs = {"h264", "avc", "avc1", "vp8", "vp9", "av1", "av01", "hevc", "h265"}
    supported_extensions = {".mp4", ".m4v", ".webm", ".mov"}

    if codec in supported_codecs and ext in supported_extensions:
        return True

    return False


# Quality profiles for preview proxy generation
QUALITY_PROFILES = {
    "1080p": {"max_w": 1920, "crf": 24, "audio_br": "128k"},
    "720p": {"max_w": 1280, "crf": 26, "audio_br": "96k"},
    "480p": {"max_w": 854, "crf": 28, "audio_br": "96k"},
    "360p": {"max_w": 640, "crf": 30, "audio_br": "64k"},
}


async def ensure_preview_file(
    file_id: str,
    source_path: Path,
    metadata: Optional[MediaMetadata] = None,
    quality: str = "720p",
) -> tuple[str, Path]:
    """Ensure a browser-compatible preview video exists at the requested quality.

    Supported qualities:
        - 'original': Native playback if browser-compatible, or 1080p proxy fallback.
        - '1080p': Full HD preview proxy (1920 max width, CRF 24).
        - '720p': HD preview proxy (1280 max width, CRF 26).
        - '480p': SD preview proxy (854 max width, CRF 28).
        - '360p': Lightweight low-bandwidth proxy (640 max width, CRF 30).

    Returns:
        (preview_file_id, preview_path)
    """
    is_audio_only = bool(metadata and not metadata.video and metadata.audio)

    # 1. If original requested:
    if quality == "original":
        if metadata and is_browser_compatible(metadata, source_path):
            return file_id, source_path
        # Non-browser-compatible file requested as original -> fall back to 1080p
        quality = "1080p"

    if is_audio_only:
        if metadata and is_browser_compatible(metadata, source_path):
            return file_id, source_path
        ext = ".m4a"
        preview_file_id = f"preview_audio_{file_id}"
    else:
        norm_quality = quality if quality in QUALITY_PROFILES else "720p"
        ext = ".mp4"
        preview_file_id = f"preview_{norm_quality}_{file_id}"

    preview_path = storage_manager.upload_dir / f"{preview_file_id}{ext}"

    if preview_path.is_file() and preview_path.stat().st_size > 0:
        storage_manager.register_file(preview_file_id, preview_path)
        return preview_file_id, preview_path

    logger.info("Generating %s preview proxy for %s -> %s", quality, source_path, preview_path)
    ffmpeg = get_ffmpeg_path()

    if is_audio_only:
        cmd = [
            ffmpeg,
            "-y",
            "-threads", "0",
            "-i", str(source_path),
            "-vn",
            "-c:a", "aac",
            "-b:a", "128k",
            str(preview_path),
        ]
    else:
        profile = QUALITY_PROFILES.get(norm_quality, QUALITY_PROFILES["720p"])
        max_w = profile["max_w"]
        cmd = [
            ffmpeg,
            "-y",
            "-threads", "0",
            "-i", str(source_path),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "fastdecode",
            "-crf", str(profile["crf"]),
            "-vf", f"scale=min({max_w}\\,iw):-2",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", profile["audio_br"],
            "-movflags", "+faststart",
            str(preview_path),
        ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_text = stderr.decode(errors="replace")
        logger.error("Failed to generate preview proxy: %s", err_text)
        return file_id, source_path

    storage_manager.register_file(preview_file_id, preview_path)
    return preview_file_id, preview_path

