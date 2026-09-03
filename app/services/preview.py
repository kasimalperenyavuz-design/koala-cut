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
    """Check if the video can likely be played natively in browser HTML5 <video> tags."""
    if not metadata.video:
        return False

    codec = (metadata.video.codec or "").lower().strip()
    ext = file_path.suffix.lower()

    # Modern browsers natively play H.264/AVC, VP8, VP9, AV1, and often HEVC in standard containers
    supported_codecs = {"h264", "avc", "avc1", "vp8", "vp9", "av1", "av01", "hevc", "h265"}
    supported_extensions = {".mp4", ".m4v", ".webm", ".mov"}

    if codec in supported_codecs and ext in supported_extensions:
        return True

    return False


async def ensure_preview_file(
    file_id: str,
    source_path: Path,
    metadata: Optional[MediaMetadata] = None,
) -> tuple[str, Path]:
    """Ensure a browser-compatible preview video exists.

    Returns:
        (preview_file_id, preview_path)
    """
    if metadata and is_browser_compatible(metadata, source_path):
        return file_id, source_path

    preview_file_id = f"preview_{file_id}"
    preview_path = storage_manager.upload_dir / f"{preview_file_id}.mp4"

    if preview_path.is_file() and preview_path.stat().st_size > 0:
        storage_manager.register_file(preview_file_id, preview_path)
        return preview_file_id, preview_path

    logger.info("Generating browser-compatible preview for %s -> %s", source_path, preview_path)
    ffmpeg = get_ffmpeg_path()
    # Fast 480p preview proxy for lightning-fast playback and timeline scrubbing
    cmd = [
        ffmpeg,
        "-y",
        "-threads", "0",
        "-i", str(source_path),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "fastdecode",
        "-crf", "28",
        "-vf", "scale=min(854\\,iw):-2",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "96k",
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
