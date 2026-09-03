"""Job management system for asynchronous video processing jobs.

Coordinates in-memory state tracking, background FFmpeg execution,
real-time SSE event publishing, and graceful job cancellation.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Any, AsyncGenerator, Literal, Optional

from pydantic import BaseModel, Field

from app.engine.builder import FFmpegCommandBuilder, VideoFilterConfig
from app.engine.probe import probe_media_async
from app.engine.runner import (
    AsyncFFmpegRunner,
    FFmpegCancelledError,
    FFmpegExecutionError,
)

logger = logging.getLogger(__name__)

JobStatus = Literal["pending", "processing", "completed", "failed", "cancelled"]


class Job(BaseModel):
    """Pydantic model representing an asynchronous video processing job."""
    id: str = Field(description="Unique Job UUID")
    input_path: str = Field(description="Source video file path")
    output_path: str = Field(description="Target destination file path")
    config: VideoFilterConfig = Field(default_factory=VideoFilterConfig, description="Filter settings")
    status: JobStatus = Field(default="pending", description="Current execution state")
    progress: float = Field(default=0.0, ge=0.0, le=100.0, description="Transcoding progress percentage")
    progress_data: dict[str, Any] = Field(
        default_factory=lambda: {
            "speed": "0x",
            "fps": 0.0,
            "current_time": "00:00:00",
            "eta_seconds": None,
            "bitrate": "N/A",
        },
        description="Detailed real-time metrics",
    )
    error: Optional[str] = Field(default=None, description="Failure or error message if applicable")
    input_size: int = Field(default=0, description="Input file size in bytes")
    output_size: Optional[int] = Field(default=None, description="Output file size in bytes")
    created_at: float = Field(default_factory=time.time, description="Creation timestamp")
    completed_at: Optional[float] = Field(default=None, description="Completion timestamp")


class JobManager:
    """Thread-safe and asyncio-safe manager for video processing jobs."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._runners: dict[str, AsyncFFmpegRunner] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._subscribers: dict[str, set[asyncio.Queue[Optional[dict[str, Any]]]]] = {}
        self._lock = asyncio.Lock()

    def get_job(self, job_id: str) -> Optional[Job]:
        """Retrieve a job by its unique identifier."""
        return self._jobs.get(job_id)

    def list_jobs(self) -> list[Job]:
        """List all tracked jobs sorted by created_at descending."""
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def create_job(
        self,
        input_path: str,
        output_path: str,
        config: VideoFilterConfig,
        job_id: Optional[str] = None,
    ) -> Job:
        """Create and register a new pending job.

        Args:
            input_path: Path to the input media file.
            output_path: Destination path for the processed media.
            config: Video filter and encoding settings.
            job_id: Optional custom UUID; generated if omitted.

        Returns:
            The created Job instance.
        """
        jid = job_id or str(uuid.uuid4())
        input_size = 0
        if os.path.isfile(input_path):
            try:
                input_size = os.path.getsize(input_path)
            except OSError:
                input_size = 0

        job = Job(
            id=jid,
            input_path=input_path,
            output_path=output_path,
            config=config,
            status="pending",
            progress=0.0,
            input_size=input_size,
            created_at=time.time(),
        )

        self._jobs[jid] = job
        return job

    def start_job(self, job_id: str) -> asyncio.Task[None]:
        """Schedule background execution for a registered job.

        Args:
            job_id: Identifier of the job to start.

        Returns:
            The asyncio.Task executing the job.
        """
        task = asyncio.create_task(self._execute_job(job_id), name=f"job-{job_id}")
        self._tasks[job_id] = task
        return task

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel an active or pending job.

        Args:
            job_id: Job identifier.

        Returns:
            True if job was cancelled; False if job not found or already in terminal state.
        """
        job = self._jobs.get(job_id)
        if not job or job.status in ("completed", "failed", "cancelled"):
            return False

        job.status = "cancelled"
        job.completed_at = time.time()
        job.error = "Job was cancelled by user."

        runner = self._runners.get(job_id)
        if runner is not None:
            try:
                await runner.cancel()
            except Exception as exc:
                logger.warning("Error during runner cancellation for job %s: %s", job_id, exc)

        task = self._tasks.get(job_id)
        if task is not None and not task.done():
            task.cancel()

        await self._publish_event(job)
        return True

    def _job_to_event(self, job: Job) -> dict[str, Any]:
        """Convert a Job model into a serializable event dictionary."""
        return {
            "job_id": job.id,
            "status": job.status,
            "progress": round(job.progress, 2),
            "progress_data": job.progress_data,
            "error": job.error,
            "input_size": job.input_size,
            "output_size": job.output_size,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
        }

    async def _publish_event(self, job: Job) -> None:
        """Publish a status or progress update to all active subscribers."""
        event = self._job_to_event(job)
        subscribers = list(self._subscribers.get(job.id, set()))
        for q in subscribers:
            try:
                q.put_nowait(event)
            except Exception:
                pass

    async def subscribe(self, job_id: str) -> AsyncGenerator[dict[str, Any], None]:
        """Subscribe to real-time progress events for a job.

        Emits the initial state immediately, followed by updates until completion.

        Args:
            job_id: The job identifier.

        Yields:
            Progress/status event dictionaries.
        """
        job = self.get_job(job_id)
        if not job:
            raise ValueError(f"Job '{job_id}' not found.")

        queue: asyncio.Queue[Optional[dict[str, Any]]] = asyncio.Queue()

        async with self._lock:
            if job_id not in self._subscribers:
                self._subscribers[job_id] = set()
            self._subscribers[job_id].add(queue)

        try:
            # Emit current snapshot immediately
            yield self._job_to_event(job)

            if job.status in ("completed", "failed", "cancelled"):
                return

            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
                if event.get("status") in ("completed", "failed", "cancelled"):
                    break
        finally:
            async with self._lock:
                if job_id in self._subscribers:
                    self._subscribers[job_id].discard(queue)
                    if not self._subscribers[job_id]:
                        del self._subscribers[job_id]

    async def _execute_job(self, job_id: str) -> None:
        """Background coroutine that performs FFmpeg processing."""
        job = self._jobs.get(job_id)
        if not job:
            return

        # Ensure output directory exists
        out_dir = os.path.dirname(job.output_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        # Transition to processing state
        job.status = "processing"
        await self._publish_event(job)

        # 1. Probe source duration for accurate progress and bitrate
        source_duration = 0.0
        try:
            probe_data = await probe_media_async(job.input_path)
            source_duration = float(probe_data.get("duration", 0.0))
        except Exception as exc:
            logger.warning("ffprobe failed on %s: %s", job.input_path, exc)

        # 2. Determine target expected duration
        start = job.config.start_time or 0.0
        if job.config.end_time is not None:
            expected_duration = max(0.0, job.config.end_time - start)
        elif source_duration > 0.0:
            expected_duration = max(0.0, source_duration - start)
        else:
            expected_duration = 0.0

        # 3. Construct FFmpeg command
        try:
            builder = FFmpegCommandBuilder()
            cmd = builder.build(
                input_path=job.input_path,
                output_path=job.output_path,
                config=job.config,
                source_duration=source_duration,
            )
        except Exception as exc:
            job.status = "failed"
            job.error = f"Configuration error: {exc}"
            job.completed_at = time.time()
            await self._publish_event(job)
            return

        # 4. Define progress callback
        async def on_progress(stats: dict[str, Any]) -> None:
            if job.status == "cancelled":
                return
            job.progress = float(stats.get("percent", 0.0))
            job.progress_data = {
                "speed": stats.get("speed_str") or f"{stats.get('speed', 0.0)}x",
                "fps": float(stats.get("fps", 0.0)),
                "current_time": stats.get("time") or str(stats.get("time_seconds", 0.0)),
                "eta_seconds": stats.get("eta"),
                "bitrate": str(stats.get("bitrate", "N/A")),
            }
            await self._publish_event(job)

        # 5. Execute with AsyncFFmpegRunner
        runner = AsyncFFmpegRunner(on_progress=on_progress)
        async with self._lock:
            self._runners[job_id] = runner

        try:
            await runner.run(cmd, expected_duration=expected_duration)

            if job.status != "cancelled":
                job.status = "completed"
                job.progress = 100.0
                job.completed_at = time.time()
                if os.path.isfile(job.output_path):
                    job.output_size = os.path.getsize(job.output_path)
                await self._publish_event(job)

        except FFmpegCancelledError:
            job.status = "cancelled"
            job.completed_at = time.time()
            job.error = "Job was cancelled."
            await self._publish_event(job)

        except FFmpegExecutionError as exc:
            job.status = "failed"
            job.completed_at = time.time()
            job.error = exc.message
            await self._publish_event(job)

        except asyncio.CancelledError:
            job.status = "cancelled"
            job.completed_at = time.time()
            job.error = "Job was cancelled."
            await self._publish_event(job)

        except Exception as exc:
            job.status = "failed"
            job.completed_at = time.time()
            job.error = str(exc)
            await self._publish_event(job)

        finally:
            async with self._lock:
                self._runners.pop(job_id, None)
                self._tasks.pop(job_id, None)


# Shared default job manager instance
job_manager = JobManager()
