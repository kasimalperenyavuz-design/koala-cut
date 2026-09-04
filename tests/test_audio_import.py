"""Integration and functional test suite for Audio Import (Harici Müzik/Ses Ekleme)."""

import os
import subprocess
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.engine.probe import probe_media
from app.services.preview import is_browser_compatible
from app.engine.builder import (
    FFmpegCommandBuilder,
    VideoFilterConfig,
    TimelineTrack,
    TimelineClip,
)


@pytest.fixture(scope="module")
def audio_fixtures(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    tmp = tmp_path_factory.mktemp("audio_import_fixtures")
    video_path = tmp / "test_base_video.mp4"
    audio_path = tmp / "test_music.mp3"

    # 1. Base video 3 seconds
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=3:size=480x270:rate=25",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            str(video_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # 2. Standalone MP3 music file 2 seconds
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=880:duration=2",
            "-c:a", "libmp3lame",
            "-b:a", "128k",
            str(audio_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return {"video": video_path, "audio": audio_path}


def test_audio_upload_and_preview_compatibility(audio_fixtures):
    """Verify that uploading an audio file decodes metadata and is browser-compatible."""
    audio_path = audio_fixtures["audio"]
    with TestClient(app) as client:
        with open(audio_path, "rb") as f:
            res = client.post("/api/upload", files={"file": ("bg_music.mp3", f, "audio/mpeg")})

        assert res.status_code == 201
        data = res.json()
        assert "file_id" in data
        assert data["filename"] == "bg_music.mp3"
        assert data["metadata"]["video"] is None
        assert data["metadata"]["audio"] is not None
        assert data["metadata"]["duration"] >= 1.8
        assert data["preview_url"] == f"/api/media/{data['file_id']}"


def test_video_and_imported_audio_mixing(audio_fixtures, tmp_path):
    """Verify that a video track (V1) and an external audio track (A1) mix together cleanly."""
    video_path = audio_fixtures["video"]
    audio_path = audio_fixtures["audio"]

    with TestClient(app) as client:
        # Register both files in storage manager
        with open(video_path, "rb") as f:
            res_v = client.post("/api/upload", files={"file": ("base.mp4", f, "video/mp4")})
        with open(audio_path, "rb") as f:
            res_a = client.post("/api/upload", files={"file": ("music.mp3", f, "audio/mpeg")})

        video_file_id = res_v.json()["file_id"]
        audio_file_id = res_a.json()["file_id"]

        # Construct timeline with V1 (video) and A1 (music with volume=0.8)
        v1_clip = TimelineClip(
            id="c_v1",
            in_point=0.0,
            out_point=3.0,
            timeline_start=0.0,
            file_id=video_file_id,
        )
        a1_clip = TimelineClip(
            id="c_a1",
            in_point=0.0,
            out_point=2.0,
            timeline_start=0.5,
            volume=0.8,
            file_id=audio_file_id,
        )

        track_v1 = TimelineTrack(id="v1", type="video", clips=[v1_clip])
        track_a1 = TimelineTrack(id="a1", type="audio", clips=[a1_clip])

        config = VideoFilterConfig(
            timeline_tracks=[track_v1, track_a1],
            mode="crf",
            crf=26,
            preset="ultrafast",
        )

        job_res = client.post(
            "/api/jobs",
            json={"file_id": video_file_id, "config": config.model_dump()},
        )
        assert job_res.status_code == 201
        job_id = job_res.json()["job_id"]

        # Wait for completion
        job_data = {}
        for _ in range(30):
            status_res = client.get(f"/api/jobs/{job_id}")
            assert status_res.status_code == 200
            job_data = status_res.json()
            if job_data["status"] in ("completed", "failed"):
                break
            time.sleep(0.5)

        assert job_data["status"] == "completed", f"Job failed with error: {job_data.get('error')}"

        # Verify download and probe resulting video
        download_res = client.get(f"/api/download/{job_id}")
        assert download_res.status_code == 200
        out_file = tmp_path / "mixed_output.mp4"
        out_file.write_bytes(download_res.content)

        meta = probe_media(str(out_file))
        assert meta["video"] is not None
        assert meta["audio"] is not None
        assert meta["duration"] >= 2.8
