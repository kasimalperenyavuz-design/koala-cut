"""FastAPI application entrypoint for the Video Processing Studio.

Provides endpoints for media upload, probing, job submission, real-time SSE progress,
HTTP Range media streaming, and processed video download.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.engine.binaries import get_ffmpeg_path
from app.engine.builder import VideoFilterConfig
from app.engine.hardware import detect_gpu_capabilities
from app.engine.probe import MediaMetadata, ProbeError, probe_media_async
from app.services.job_manager import Job, job_manager
from app.services.preview import QUALITY_PROFILES, ensure_preview_file, is_browser_compatible
from app.services.storage import (
    STATIC_DIR,
    create_range_streaming_response,
    storage_manager,
)
from app.services.updater import updater_service
from app.services.silence_detector import SilenceDetector, SilenceDetectionResult
from app.services.subtitle_service import SubtitleService, SubtitleResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lifespan context manager
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure directory structure and perform startup cleanup."""
    storage_manager.ensure_directories()
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    # Prune artifacts older than 24 hours on launch
    storage_manager.cleanup_old_files(max_age_seconds=86400)

    # Suppress benign Windows client disconnect noise (WinError 10054)
    loop = asyncio.get_running_loop()
    orig_handler = loop.get_exception_handler()

    def _ignore_client_disconnects(loop, context):
        exc = context.get("exception")
        if isinstance(exc, ConnectionResetError) or (
            isinstance(exc, OSError) and getattr(exc, "winerror", None) == 10054
        ):
            return
        if orig_handler:
            orig_handler(loop, context)
        else:
            loop.default_exception_handler(context)

    loop.set_exception_handler(_ignore_client_disconnects)
    yield


# ---------------------------------------------------------------------------
# FastAPI App Setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Video Processing Studio API",
    description="Asynchronous video transformation, transcoding, and filtering engine.",
    version="1.0.0",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception Handlers
@app.exception_handler(ProbeError)
async def probe_error_handler(request: Request, exc: ProbeError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"detail": f"Media Probe Error: {str(exc)}"},
    )


@app.exception_handler(FileNotFoundError)
async def file_not_found_handler(request: Request, exc: FileNotFoundError) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={"detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Pydantic Request / Response Schemas
# ---------------------------------------------------------------------------


class UploadResponse(BaseModel):
    """Payload returned upon successful media upload."""
    file_id: str = Field(description="Unique upload identifier")
    filename: str = Field(description="Original file name")
    metadata: MediaMetadata = Field(description="Extracted ffprobe metadata")
    preview_url: str = Field(default="", description="URL for browser preview playback")


class CreateJobRequest(BaseModel):
    """Job creation parameters."""
    file_id: str = Field(description="ID of previously uploaded or registered media file")
    config: VideoFilterConfig = Field(
        default_factory=VideoFilterConfig,
        description="Filter and encoding specifications",
    )


class CreateJobResponse(BaseModel):
    """Job submission acknowledgment."""
    job_id: str = Field(description="UUID of created processing job")
    status: str = Field(description="Initial job state (typically 'pending')")


class CancelJobResponse(BaseModel):
    """Response returned upon cancelling a job."""
    job_id: str
    status: str
    success: bool


class SaveToRequest(BaseModel):
    """Payload to copy processed output to a custom filesystem path."""
    destination: str = Field(description="Target directory or file path on the system")


class SaveToResponse(BaseModel):
    """Response returned upon saving output to a custom path."""
    success: bool
    saved_path: str
    message: str


class UpdateConfigRequest(BaseModel):
    """Payload to update target GitHub repository."""
    repo: str = Field(description="GitHub repository in 'owner/repo' format")


class InstallUpdateRequest(BaseModel):
    """Payload to trigger update download and installation."""
    download_url: str = Field(description="Direct download URL of the release asset")


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


@app.post("/api/upload", response_model=UploadResponse, status_code=201)
async def upload_media(file: UploadFile = File(...)) -> UploadResponse:
    """Upload a media file, store it safely, and extract metadata asynchronously.

    Returns:
        JSON with file_id, original filename, and probed media metadata.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    file_id, original_filename, saved_path = await storage_manager.save_upload(file)

    try:
        raw_metadata = await probe_media_async(str(saved_path))
        metadata = MediaMetadata(**raw_metadata)
    except ProbeError as exc:
        storage_manager.delete_file(saved_path)
        raise HTTPException(
            status_code=400,
            detail=f"Uploaded file cannot be decoded by ffprobe: {exc}",
        ) from exc
    except Exception as exc:
        storage_manager.delete_file(saved_path)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid media file: {exc}",
        ) from exc

    if is_browser_compatible(metadata, saved_path):
        preview_url = f"/api/media/{file_id}"
    else:
        preview_url = f"/api/preview/{file_id}"

    return UploadResponse(
        file_id=file_id,
        filename=original_filename,
        metadata=metadata,
        preview_url=preview_url,
    )


@app.api_route("/api/demo", methods=["GET", "POST"], response_model=UploadResponse)
async def load_demo_video() -> UploadResponse:
    """Generate or retrieve a sample video for instant UI testing."""
    demo_file = storage_manager.upload_dir / "demo_sample.mp4"
    if not demo_file.is_file() or demo_file.stat().st_size == 0:
        cmd = [
            get_ffmpeg_path(), "-y",
            "-f", "lavfi", "-i", "testsrc=duration=6:size=1280x720:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=500:duration=6",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
            "-c:a", "aac",
            str(demo_file),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    file_id = "demo_sample"
    storage_manager.register_file(file_id, demo_file)
    raw_metadata = await probe_media_async(str(demo_file))
    metadata = MediaMetadata(**raw_metadata)
    return UploadResponse(
        file_id=file_id,
        filename="demo_sample.mp4",
        metadata=metadata,
        preview_url=f"/api/media/{file_id}",
    )


@app.get("/api/probe/{file_id}")
async def probe_media_file(file_id: str) -> dict:
    """Extract metadata for an existing media file by file_id."""
    media_path = storage_manager.resolve_media_path(file_id)
    if not media_path or not media_path.is_file():
        raise HTTPException(status_code=404, detail=f"Media file '{file_id}' not found.")

    try:
        raw_metadata = await probe_media_async(str(media_path))
        metadata = MediaMetadata(**raw_metadata)
        return {
            "file_id": file_id,
            "filename": media_path.name,
            "metadata": metadata.model_dump(),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to probe media: {exc}") from exc


@app.post("/api/jobs", response_model=CreateJobResponse, status_code=201)
async def create_job(request: CreateJobRequest) -> CreateJobResponse:
    """Create and start an asynchronous video processing job."""
    input_path = storage_manager.resolve_media_path(request.file_id)
    if not input_path or not input_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Media file not found for file_id '{request.file_id}'.",
        )

    job_id = str(uuid.uuid4())
    output_path = storage_manager.get_output_path(job_id)

    job = job_manager.create_job(
        input_path=str(input_path),
        output_path=str(output_path),
        config=request.config,
        job_id=job_id,
    )

    job_manager.start_job(job_id)
    return CreateJobResponse(job_id=job.id, status=job.status)


@app.get("/api/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str) -> Job:
    """Get the current state, progress, and metadata for a job."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return job


@app.get("/api/jobs/{job_id}/stream")
async def stream_job_progress(job_id: str) -> StreamingResponse:
    """Server-Sent Events (SSE) stream yielding real-time JSON progress events."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    async def event_generator():
        try:
            async for event in job_manager.subscribe(job_id):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception:
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/jobs/{job_id}/cancel", response_model=CancelJobResponse)
async def cancel_job(job_id: str) -> CancelJobResponse:
    """Cancel an ongoing or pending job."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    success = await job_manager.cancel_job(job_id)
    return CancelJobResponse(
        job_id=job_id,
        status=job.status,
        success=success,
    )


@app.get("/api/download/{job_id}")
async def download_output(job_id: str) -> FileResponse:
    """Download the completed output video file."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    if job.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job '{job_id}' is {job.status}. Output is only downloadable when completed.",
        )

    if not os.path.isfile(job.output_path):
        raise HTTPException(status_code=404, detail="Output file is missing from disk.")

    return FileResponse(
        path=job.output_path,
        media_type="video/mp4",
        filename=f"processed_{job_id}.mp4",
        content_disposition_type="attachment",
    )


@app.post("/api/jobs/{job_id}/save-to", response_model=SaveToResponse)
async def save_job_output_to_path(job_id: str, payload: SaveToRequest) -> SaveToResponse:
    """Copy the finished job output video to a specified local directory or file path."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if job.status != "completed" or not job.output_path or not os.path.isfile(job.output_path):
        raise HTTPException(status_code=400, detail="Job is not yet completed or output file is missing.")

    destination_str = payload.destination.strip().strip('"').strip("'")
    if not destination_str or "\x00" in destination_str:
        raise HTTPException(status_code=400, detail="Geçersiz hedef dosya yolu.")

    try:
        dest = Path(destination_str).expanduser().resolve()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Hedef yol çözümlenemedi: {exc}")

    # Prevent writing directly into Windows or POSIX system root directories
    forbidden_prefixes = ["c:\\windows", "c:\\program files", "/bin", "/sbin", "/etc", "/boot", "/usr/bin"]
    resolved_lower = str(dest).lower()
    if any(resolved_lower.startswith(prefix) for prefix in forbidden_prefixes):
        raise HTTPException(status_code=403, detail="Sistem dizinlerine doğrudan kayıt yapılamaz.")

    if dest.is_dir() or destination_str.endswith(("\\", "/")):
        dest.mkdir(parents=True, exist_ok=True)
        dest = dest / Path(job.output_path).name
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Ensure safe video extension
        if not dest.suffix:
            dest = dest.with_suffix(".mp4")

    try:
        shutil.copy2(job.output_path, dest)
        return SaveToResponse(
            success=True,
            saved_path=str(dest),
            message=f"Video başarıyla kaydedildi: {dest}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Dosya kaydedilemedi: {exc}") from exc


@app.post("/api/jobs/{job_id}/open-folder")
async def open_job_output_folder(job_id: str):
    """Open File Explorer / Finder and highlight the output video file."""
    job = job_manager.get_job(job_id)
    if not job or not os.path.isfile(job.output_path):
        raise HTTPException(status_code=404, detail="İş çıktısı bulunamadı.")

    out_path = os.path.abspath(job.output_path)
    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer.exe", f"/select,{out_path}"])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", out_path])
        else:
            subprocess.Popen(["xdg-open", os.path.dirname(out_path)])
        return {"success": True, "path": out_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Klasör açılamadı: {exc}") from exc


@app.get("/api/media/{file_id}")
async def stream_media(file_id: str, request: Request):
    """Serve an uploaded source or processed video with HTTP Range seeking support."""
    # Check upload storage, output storage, or job output path
    media_path = storage_manager.resolve_media_path(file_id)

    # On-demand preview generation if requested as preview_{id} or preview_{quality}_{id}
    if (not media_path or not media_path.is_file()) and file_id.startswith("preview_"):
        parts = file_id.split("_", 2)
        if len(parts) == 3 and parts[1] in QUALITY_PROFILES:
            quality = parts[1]
            orig_id = parts[2]
        else:
            quality = "720p"
            orig_id = file_id[len("preview_"):]
        orig_path = storage_manager.resolve_upload_path(orig_id)
        if orig_path and orig_path.is_file():
            _, media_path = await ensure_preview_file(orig_id, orig_path, quality=quality)

    if not media_path or not media_path.is_file():
        job = job_manager.get_job(file_id)
        if job and os.path.isfile(job.output_path):
            media_path = Path(job.output_path)

    if not media_path or not media_path.is_file():
        raise HTTPException(status_code=404, detail=f"Media file '{file_id}' not found.")

    range_header = request.headers.get("Range")
    return create_range_streaming_response(media_path, range_header)


@app.get("/api/preview/{file_id}")
async def stream_preview(file_id: str, request: Request, quality: str = Query("720p")):
    """Stream a guaranteed browser-compatible preview proxy at the requested quality."""
    orig_path = storage_manager.resolve_upload_path(file_id)
    if not orig_path or not orig_path.is_file():
        raise HTTPException(status_code=404, detail=f"Source media '{file_id}' not found.")

    try:
        raw_meta = await probe_media_async(str(orig_path))
        metadata = MediaMetadata(**raw_meta)
    except Exception:
        metadata = None

    _, preview_path = await ensure_preview_file(file_id, orig_path, metadata=metadata, quality=quality)
    range_header = request.headers.get("Range")
    return create_range_streaming_response(preview_path, range_header)


@app.post("/api/preview/{file_id}/quality")
async def generate_preview_quality(file_id: str, quality: str = Query("720p")):
    """Pre-generate a proxy quality for a file and return its metadata/URL."""
    orig_path = storage_manager.resolve_upload_path(file_id)
    if not orig_path or not orig_path.is_file():
        raise HTTPException(status_code=404, detail=f"Source media '{file_id}' not found.")

    try:
        raw_meta = await probe_media_async(str(orig_path))
        metadata = MediaMetadata(**raw_meta)
    except Exception:
        metadata = None

    preview_id, preview_path = await ensure_preview_file(file_id, orig_path, metadata=metadata, quality=quality)
    return {
        "file_id": file_id,
        "quality": quality,
        "preview_id": preview_id,
        "preview_url": f"/api/preview/{file_id}?quality={quality}",
        "size_bytes": preview_path.stat().st_size if preview_path.is_file() else 0,
    }


# ---------------------------------------------------------------------------
# Auto-Update Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/hardware")
async def get_hardware_info():
    """Return system GPU hardware acceleration capabilities."""
    return detect_gpu_capabilities()


@app.get("/api/updates/status")
async def get_update_status():
    """Return current version and repository configuration."""
    return {
        "current_version": updater_service.current_version,
        "repo": updater_service.repo,
    }


@app.get("/api/updates/check")
async def check_updates():
    """Check GitHub Releases for an available update."""
    return await updater_service.check_for_updates()


@app.post("/api/updates/config")
async def set_update_config(payload: UpdateConfigRequest):
    """Update configured GitHub repository."""
    if not payload.repo or "/" not in payload.repo:
        raise HTTPException(status_code=400, detail="Repo format must be 'owner/repo'")
    updater_service.save_repo(payload.repo)
    return {"success": True, "repo": updater_service.repo}


@app.post("/api/updates/install")
async def install_update(payload: InstallUpdateRequest):
    """Download the new release asset and trigger self-update restart."""
    if not payload.download_url:
        raise HTTPException(status_code=400, detail="Download URL cannot be empty.")
    success = await updater_service.download_and_install_update(payload.download_url)
    return {"success": success, "message": "Güncelleme başlatıldı. Uygulama yeniden başlıyor..."}


# ---------------------------------------------------------------------------
# AI Suite: Silence Removal & Faster-Whisper Subtitles
# ---------------------------------------------------------------------------

class SilenceDetectRequest(BaseModel):
    file_id: str
    noise_threshold_db: float = Field(default=-35.0, description="Noise threshold in dB")
    min_silence_sec: float = Field(default=0.5, ge=0.1, description="Minimum silence duration in seconds")
    padding_sec: float = Field(default=0.1, ge=0.0, description="Safety padding around speech in seconds")


@app.post("/api/ai/silence-detect")
async def detect_silence_endpoint(payload: SilenceDetectRequest):
    """Analyze audio for silent pauses and return speech / silence segments."""
    media_path = storage_manager.resolve_media_path(payload.file_id)
    if not media_path or not media_path.is_file():
        raise HTTPException(status_code=404, detail="Input file not found.")

    result = await SilenceDetector.detect_silence(
        file_path=str(media_path),
        noise_threshold_db=payload.noise_threshold_db,
        min_silence_sec=payload.min_silence_sec,
        padding_sec=payload.padding_sec,
    )
    return result


class SubtitleGenerateRequest(BaseModel):
    file_id: str
    model_size: str = Field(default="base", description="Whisper model size ('tiny' or 'base')")
    language: str = Field(default="tr", description="Language code e.g. 'tr', 'en', 'auto'")


@app.post("/api/ai/subtitles/generate")
async def generate_subtitles_endpoint(payload: SubtitleGenerateRequest):
    """Transcribe video audio with Faster-Whisper and generate subtitles."""
    media_path = storage_manager.resolve_media_path(payload.file_id)
    if not media_path or not media_path.is_file():
        raise HTTPException(status_code=404, detail="Input file not found.")

    try:
        result = await SubtitleService.generate_subtitles(
            video_path=str(media_path),
            language=payload.language,
            model_size=payload.model_size,
        )
        return result
    except Exception as e:
        logger.exception("Subtitle generation error: %s", e)
        raise HTTPException(status_code=500, detail=f"Altyazı oluşturulamadı: {str(e)}")


@app.get("/api/ai/subtitles/{sub_id}/download")
async def download_subtitles_endpoint(sub_id: str, format: str = "srt"):
    """Download generated subtitle file (.srt or .vtt)."""
    sub_dir = os.path.join(os.getcwd(), "outputs", "subtitles")
    file_ext = "vtt" if format.lower() == "vtt" else "srt"
    sub_file = os.path.join(sub_dir, f"sub_{sub_id}.{file_ext}")

    if not os.path.exists(sub_file):
        srt_file = os.path.join(sub_dir, f"sub_{sub_id}.srt")
        if not os.path.exists(srt_file):
            raise HTTPException(status_code=404, detail="Subtitle file not found.")
        sub_file = srt_file
        file_ext = "srt"

    return FileResponse(
        sub_file,
        media_type="text/plain",
        filename=f"subtitles_{sub_id}.{file_ext}",
    )


# ---------------------------------------------------------------------------
# Static SPA Mount & Fallback Index
# ---------------------------------------------------------------------------

STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def serve_spa():
    """Serve the single-page application entry point."""
    index_file = STATIC_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(str(index_file))

    return HTMLResponse(
        """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Processing Studio</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 480px; }
        h1 { margin-bottom: 0.5rem; color: #38bdf8; }
        p { color: #94a3b8; }
        .badge { background: #0369a1; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; display: inline-block; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Video Processing Studio</h1>
        <p>High-performance asynchronous FFmpeg media processing service.</p>
        <span class="badge">Backend API Ready &bull; Port 8000</span>
    </div>
</body>
</html>"""
    )
