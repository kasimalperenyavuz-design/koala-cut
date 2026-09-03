"""File storage and media file management service.

Handles safe upload persistence, media path resolution, range-capable
streaming for HTML5 video preview, and periodic cleanup of stale artifacts.
"""

from __future__ import annotations

import asyncio
import mimetypes
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional, Union

import aiofiles
from fastapi import HTTPException, Response, UploadFile
from starlette.responses import StreamingResponse

def get_storage_dirs() -> tuple[Path, Path]:
    """Resolve uploads and outputs directories with safe permission fallbacks."""
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        try:
            test_path = exe_dir / ".perm_check"
            test_path.touch()
            test_path.unlink()
            up_dir = exe_dir / "uploads"
            out_dir = exe_dir / "outputs"
            up_dir.mkdir(parents=True, exist_ok=True)
            out_dir.mkdir(parents=True, exist_ok=True)
            return up_dir, out_dir
        except (PermissionError, OSError):
            local_appdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
            app_root = Path(local_appdata) / "koala-cut"
            up_dir = app_root / "uploads"
            out_dir = app_root / "outputs"
            up_dir.mkdir(parents=True, exist_ok=True)
            out_dir.mkdir(parents=True, exist_ok=True)
            return up_dir, out_dir
    else:
        project_root = Path(__file__).resolve().parent.parent.parent
        up_dir = project_root / "uploads"
        out_dir = project_root / "outputs"
        up_dir.mkdir(parents=True, exist_ok=True)
        out_dir.mkdir(parents=True, exist_ok=True)
        return up_dir, out_dir

UPLOAD_DIR, OUTPUT_DIR = get_storage_dirs()

if getattr(sys, "frozen", False):
    EXE_DIR = Path(sys.executable).resolve().parent
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", EXE_DIR))
    PROJECT_ROOT = EXE_DIR
    STATIC_DIR = BUNDLE_DIR / "app" / "static"
else:
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    STATIC_DIR = PROJECT_ROOT / "app" / "static"

# Standard chunk size for asynchronous file streaming (64 KB)
STREAM_CHUNK_SIZE = 64 * 1024


class StorageManager:
    """Manages file storage, path resolution, and range streaming."""

    def __init__(
        self,
        upload_dir: Union[str, Path] = UPLOAD_DIR,
        output_dir: Union[str, Path] = OUTPUT_DIR,
    ) -> None:
        self.upload_dir = Path(upload_dir)
        self.output_dir = Path(output_dir)
        self._file_registry: dict[str, Path] = {}
        self.ensure_directories()

    def ensure_directories(self) -> None:
        """Ensure upload and output storage directories exist."""
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def save_upload(self, file: UploadFile) -> tuple[str, str, Path]:
        """Save an uploaded file safely with a unique identifier.

        Args:
            file: The multipart UploadFile from FastAPI.

        Returns:
            Tuple of (file_id, original_filename, saved_file_path).
        """
        self.ensure_directories()
        file_id = uuid.uuid4().hex
        original_filename = file.filename or "media.mp4"

        # Extract and sanitize extension
        _, ext = os.path.splitext(original_filename)
        ext = ext.lower() if ext else ".mp4"

        # Unique file on disk
        target_filename = f"{file_id}{ext}"
        target_path = self.upload_dir / target_filename

        # Write uploaded file asynchronously in chunks
        async with aiofiles.open(target_path, "wb") as f_out:
            while chunk := await file.read(STREAM_CHUNK_SIZE):
                await f_out.write(chunk)

        self._file_registry[file_id] = target_path
        return file_id, original_filename, target_path

    def register_file(self, file_id: str, path: Union[str, Path]) -> None:
        """Register a known file path with an identifier."""
        self._file_registry[file_id] = Path(path)

    def get_output_path(self, job_id: str, ext: str = ".mp4") -> Path:
        """Generate destination path for a processed job output."""
        self.ensure_directories()
        if not ext.startswith("."):
            ext = f".{ext}"
        return self.output_dir / f"{job_id}{ext}"

    def resolve_upload_path(self, file_id: str) -> Optional[Path]:
        """Locate an uploaded file by identifier or filename."""
        # 1. Check in-memory registry
        if file_id in self._file_registry:
            path = self._file_registry[file_id]
            if path.is_file():
                return path

        # 2. Check if file_id is a direct filename in uploads
        direct_path = self.upload_dir / file_id
        if direct_path.is_file():
            return direct_path

        # 3. Check for matching prefix in upload dir (e.g. {file_id}.mp4)
        for entry in self.upload_dir.iterdir():
            if entry.is_file() and (entry.name.startswith(file_id) or entry.stem == file_id):
                self._file_registry[file_id] = entry
                return entry

        return None

    def resolve_output_path(self, identifier: str) -> Optional[Path]:
        """Locate an output file by job_id or filename."""
        direct_path = self.output_dir / identifier
        if direct_path.is_file():
            return direct_path

        for entry in self.output_dir.iterdir():
            if entry.is_file() and (entry.name.startswith(identifier) or entry.stem == identifier):
                return entry

        return None

    def resolve_media_path(self, identifier: str) -> Optional[Path]:
        """Resolve a media path from either uploads or outputs."""
        upload_path = self.resolve_upload_path(identifier)
        if upload_path is not None:
            return upload_path
        return self.resolve_output_path(identifier)

    def cleanup_old_files(self, max_age_seconds: int = 86400) -> int:
        """Remove uploaded and output files older than max_age_seconds.

        Args:
            max_age_seconds: Maximum allowed age in seconds (default: 24 hours).

        Returns:
            Count of deleted files.
        """
        now = time.time()
        deleted_count = 0

        for directory in (self.upload_dir, self.output_dir):
            if not directory.is_dir():
                continue
            for entry in directory.iterdir():
                if not entry.is_file():
                    continue
                try:
                    mtime = entry.stat().st_mtime
                    if now - mtime > max_age_seconds:
                        entry.unlink(missing_ok=True)
                        deleted_count += 1
                except OSError:
                    pass

        # Prune dead registry entries
        self._file_registry = {
            k: v for k, v in self._file_registry.items() if v.is_file()
        }
        return deleted_count

    def delete_file(self, path: Union[str, Path]) -> bool:
        """Safely delete a file if it exists."""
        p = Path(path)
        try:
            if p.is_file():
                p.unlink(missing_ok=True)
                return True
        except OSError:
            pass
        return False


# Shared default storage manager instance
storage_manager = StorageManager()


def parse_range_header(range_header: str, file_size: int) -> tuple[int, int]:
    """Parse HTTP Range header value (e.g. 'bytes=0-1023', 'bytes=1024-', 'bytes=-500').

    Args:
        range_header: Value of the 'Range' HTTP request header.
        file_size: Total file size in bytes.

    Returns:
        Tuple of (start_byte, end_byte).

    Raises:
        HTTPException(416): If the requested range is invalid or unsatisfiable.
    """
    range_match = re.match(r"^bytes=(\d*)-(\d*)$", range_header.strip())
    if not range_match:
        raise HTTPException(
            status_code=416,
            detail="Invalid Range header format.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    start_str, end_str = range_match.groups()

    if start_str and end_str:
        start = int(start_str)
        end = int(end_str)
    elif start_str:
        start = int(start_str)
        end = file_size - 1
    elif end_str:
        # Suffix byte range: last N bytes
        suffix = int(end_str)
        start = max(0, file_size - suffix)
        end = file_size - 1
    else:
        raise HTTPException(
            status_code=416,
            detail="Invalid Range header bounds.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    if start < 0 or start >= file_size or end < start:
        raise HTTPException(
            status_code=416,
            detail="Requested range not satisfiable.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    # Clamp end byte to file_size - 1
    end = min(end, file_size - 1)
    return start, end


async def file_chunk_generator(
    file_path: Union[str, Path],
    start: int,
    end: int,
    chunk_size: int = STREAM_CHUNK_SIZE,
) -> AsyncGenerator[bytes, None]:
    """Asynchronously yield byte chunks from a file within [start, end] range."""
    try:
        async with aiofiles.open(file_path, mode="rb") as f:
            await f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                read_len = min(chunk_size, remaining)
                chunk = await f.read(read_len)
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
    except (asyncio.CancelledError, ConnectionResetError, OSError):
        # Client gracefully closed connection (e.g. paused, seeked, or finished chunk)
        return


def create_range_streaming_response(
    file_path: Union[str, Path],
    range_header: Optional[str] = None,
) -> Response:
    """Construct an HTTP 206 (Partial Content) or 200 (OK) response supporting HTML5 range seeking.

    Args:
        file_path: Path to the media file on disk.
        range_header: Raw 'Range' header string from request, if present.

    Returns:
        StreamingResponse configured with range or full-content headers.
    """
    path = Path(file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Requested media file not found.")

    file_size = path.stat().st_size
    content_type, _ = mimetypes.guess_type(str(path))
    if not content_type:
        content_type = "video/mp4"

    if range_header:
        start, end = parse_range_header(range_header, file_size)
        content_length = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": content_type,
        }
        return StreamingResponse(
            file_chunk_generator(path, start, end),
            status_code=206,
            headers=headers,
            media_type=content_type,
        )

    # Full content response with byte-range capability advertised
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": content_type,
    }
    return StreamingResponse(
        file_chunk_generator(path, 0, max(0, file_size - 1)),
        status_code=200,
        headers=headers,
        media_type=content_type,
    )
