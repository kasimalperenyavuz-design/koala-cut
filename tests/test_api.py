"""Integration tests for FastAPI backend API and JobManager service."""

import asyncio
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.job_manager import job_manager
from app.services.storage import storage_manager


@pytest.fixture(scope="session")
def test_video(tmp_path_factory):
    """Generate a minimal 1-second sample video for testing."""
    tmp_dir = tmp_path_factory.mktemp("api_media")
    video_path = str(tmp_dir / "test_sample.mp4")

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=25",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            video_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return video_path


@pytest.fixture
def client():
    """Create a FastAPI TestClient."""
    with TestClient(app) as test_client:
        yield test_client


# ---------------------------------------------------------------------------
# SPA and Static Route Tests
# ---------------------------------------------------------------------------


def test_serve_spa(client):
    """Verify that root URL returns the SPA landing page."""
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "koala-cut" in response.text


def test_static_files(client):
    """Verify static file mounting."""
    response = client.get("/static/index.html")
    assert response.status_code == 200
    assert "koala-cut" in response.text


# ---------------------------------------------------------------------------
# Upload and Probe Tests
# ---------------------------------------------------------------------------


def test_upload_success(client, test_video):
    """Upload a valid video and verify metadata response."""
    with open(test_video, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("test_sample.mp4", f, "video/mp4")},
        )

    assert response.status_code == 201
    data = response.json()
    assert "file_id" in data
    assert data["filename"] == "test_sample.mp4"
    assert "metadata" in data
    metadata = data["metadata"]
    assert metadata["duration"] > 0
    assert metadata["video"] is not None
    assert metadata["video"]["width"] == 320
    assert metadata["video"]["height"] == 240
    assert metadata["video"]["fps"] == 25.0


def test_demo_endpoint(client):
    """Test demo video generation / retrieval endpoint."""
    response = client.get("/api/demo")
    assert response.status_code == 200
    data = response.json()
    assert data["file_id"] == "demo_sample"
    assert data["metadata"]["duration"] > 0
    assert data["metadata"]["video"]["width"] == 1280



def test_upload_invalid_file(client):
    """Upload an invalid non-media file and expect 400 error."""
    fake_content = b"This is a text file not a video"
    response = client.post(
        "/api/upload",
        files={"file": ("corrupt.mp4", fake_content, "video/mp4")},
    )
    assert response.status_code == 400
    assert "Uploaded file cannot be decoded" in response.json()["detail"]


def test_probe_endpoint(client, test_video):
    """Test GET /api/probe/{file_id} on an uploaded file."""
    with open(test_video, "rb") as f:
        up_res = client.post(
            "/api/upload",
            files={"file": ("sample.mp4", f, "video/mp4")},
        )
    file_id = up_res.json()["file_id"]

    probe_res = client.get(f"/api/probe/{file_id}")
    assert probe_res.status_code == 200
    probe_data = probe_res.json()
    assert probe_data["file_id"] == file_id
    assert probe_data["metadata"]["video"]["width"] == 320

    # Nonexistent probe
    err_res = client.get("/api/probe/nonexistent-id")
    assert err_res.status_code == 404


# ---------------------------------------------------------------------------
# Range Streaming Tests
# ---------------------------------------------------------------------------


def test_media_streaming_full_and_range(client, test_video):
    """Test GET /api/media/{file_id} with and without Range headers."""
    with open(test_video, "rb") as f:
        up_res = client.post(
            "/api/upload",
            files={"file": ("stream_test.mp4", f, "video/mp4")},
        )
    file_id = up_res.json()["file_id"]

    # 1. Full content request (200 OK)
    res_full = client.get(f"/api/media/{file_id}")
    assert res_full.status_code == 200
    assert "Accept-Ranges" in res_full.headers
    total_size = int(res_full.headers["Content-Length"])
    assert total_size > 0
    assert len(res_full.content) == total_size

    # 2. Partial content byte range: 0-99 (100 bytes)
    res_part = client.get(
        f"/api/media/{file_id}",
        headers={"Range": "bytes=0-99"},
    )
    assert res_part.status_code == 206
    assert res_part.headers["Content-Range"] == f"bytes 0-99/{total_size}"
    assert int(res_part.headers["Content-Length"]) == 100
    assert len(res_part.content) == 100
    assert res_part.content == res_full.content[:100]

    # 3. Suffix byte range: last 50 bytes
    res_suffix = client.get(
        f"/api/media/{file_id}",
        headers={"Range": "bytes=-50"},
    )
    assert res_suffix.status_code == 206
    assert int(res_suffix.headers["Content-Length"]) == 50
    assert len(res_suffix.content) == 50
    assert res_suffix.content == res_full.content[-50:]

    # 4. Unsatisfiable range (416)
    res_invalid = client.get(
        f"/api/media/{file_id}",
        headers={"Range": f"bytes={total_size + 1000}-{total_size + 2000}"},
    )
    assert res_invalid.status_code == 416

    # 5. Nonexistent media (404)
    res_404 = client.get("/api/media/nonexistent-id")
    assert res_404.status_code == 404


# ---------------------------------------------------------------------------
# Job Lifecycle Tests
# ---------------------------------------------------------------------------


def test_job_lifecycle_and_download(client, test_video):
    """Test full workflow: upload -> submit job -> wait completion -> check status -> download."""
    # 1. Upload
    with open(test_video, "rb") as f:
        up_res = client.post(
            "/api/upload",
            files={"file": ("job_test.mp4", f, "video/mp4")},
        )
    file_id = up_res.json()["file_id"]

    # 2. Submit job
    payload = {
        "file_id": file_id,
        "config": {
            "mode": "crf",
            "crf": 26,
            "preset": "ultrafast",
            "width": 160,
            "height": 120,
            "fit_mode": "scale",
        },
    }
    job_res = client.post("/api/jobs", json=payload)
    assert job_res.status_code == 201
    job_data = job_res.json()
    job_id = job_data["job_id"]
    assert job_data["status"] in ("pending", "processing")

    # 3. Poll until job completion (up to 15 seconds)
    max_wait = 15.0
    start = time.time()
    final_job = None

    while time.time() - start < max_wait:
        status_res = client.get(f"/api/jobs/{job_id}")
        assert status_res.status_code == 200
        cur_job = status_res.json()
        if cur_job["status"] in ("completed", "failed"):
            final_job = cur_job
            break
        time.sleep(0.2)

    assert final_job is not None, "Job timed out"
    assert final_job["status"] == "completed", f"Job failed with: {final_job.get('error')}"
    assert final_job["progress"] == 100.0
    assert final_job["output_size"] is not None and final_job["output_size"] > 0

    # 4. Download processed output video
    dl_res = client.get(f"/api/download/{job_id}")
    assert dl_res.status_code == 200
    assert "attachment" in dl_res.headers["content-disposition"]
    assert dl_res.headers["content-type"] == "video/mp4"
    assert len(dl_res.content) == final_job["output_size"]


def test_job_cancellation(client, test_video):
    """Test job cancellation endpoint."""
    with open(test_video, "rb") as f:
        up_res = client.post(
            "/api/upload",
            files={"file": ("cancel_test.mp4", f, "video/mp4")},
        )
    file_id = up_res.json()["file_id"]

    # Submit job
    payload = {
        "file_id": file_id,
        "config": {
            "mode": "crf",
            "crf": 23,
            "preset": "medium",
        },
    }
    job_res = client.post("/api/jobs", json=payload)
    job_id = job_res.json()["job_id"]

    # Cancel immediately
    cancel_res = client.post(f"/api/jobs/{job_id}/cancel")
    assert cancel_res.status_code == 200
    cancel_data = cancel_res.json()
    assert cancel_data["job_id"] == job_id
    assert cancel_data["status"] == "cancelled"

    # Status check confirms cancelled
    status_res = client.get(f"/api/jobs/{job_id}")
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "cancelled"


def test_sse_stream(client, test_video):
    """Verify Server-Sent Events stream yields valid JSON data events."""
    with open(test_video, "rb") as f:
        up_res = client.post(
            "/api/upload",
            files={"file": ("stream_events.mp4", f, "video/mp4")},
        )
    file_id = up_res.json()["file_id"]

    job_res = client.post(
        "/api/jobs",
        json={"file_id": file_id, "config": {"mode": "crf", "crf": 30, "preset": "ultrafast"}},
    )
    job_id = job_res.json()["job_id"]

    # Connect to SSE stream
    with client.stream("GET", f"/api/jobs/{job_id}/stream") as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        events_received = 0
        for line in response.iter_lines():
            if line and line.startswith("data: "):
                event_data = json.loads(line[6:])
                assert event_data["job_id"] == job_id
                assert "status" in event_data
                assert "progress" in event_data
                events_received += 1
                if event_data["status"] in ("completed", "failed", "cancelled"):
                    break

        assert events_received >= 1


def test_preview_generation_and_streaming(client, test_video):
    """Verify preview endpoint automatically generates browser-compatible stream."""
    with open(test_video, "rb") as f:
        up_res = client.post(
            "/api/upload",
            files={"file": ("preview_test.mp4", f, "video/mp4")},
        )
    assert up_res.status_code == 201
    data = up_res.json()
    assert "preview_url" in data
    assert data["preview_url"].startswith("/api/media/")

    file_id = data["file_id"]

    # Test GET /api/preview/{file_id}
    prev_res = client.get(f"/api/preview/{file_id}")
    assert prev_res.status_code == 200
    assert "video/mp4" in prev_res.headers["content-type"]
    assert len(prev_res.content) > 0

    # Test Range request on preview
    range_res = client.get(f"/api/preview/{file_id}", headers={"Range": "bytes=0-1023"})
    assert range_res.status_code == 206
    assert len(range_res.content) == 1024


def test_save_job_output_to_custom_path(client, test_video, tmp_path):
    """Verify copying output video to a custom path on the system."""
    # 1. Upload & submit job
    with open(test_video, "rb") as f:
        up_res = client.post("/api/upload", files={"file": ("save_test.mp4", f, "video/mp4")})
    file_id = up_res.json()["file_id"]

    job_res = client.post("/api/jobs", json={
        "file_id": file_id,
        "config": {"mode": "crf", "crf": 28, "preset": "ultrafast"},
    })
    job_id = job_res.json()["job_id"]

    # Wait for completion
    for _ in range(40):
        res = client.get(f"/api/jobs/{job_id}")
        if res.json()["status"] == "completed":
            break
        time.sleep(0.2)

    # Test saving to a custom directory
    target_dir = tmp_path / "custom_output_folder"
    save_res = client.post(f"/api/jobs/{job_id}/save-to", json={"destination": str(target_dir)})
    assert save_res.status_code == 200
    save_data = save_res.json()
    assert save_data["success"] is True
    saved_file = Path(save_data["saved_path"])
    assert saved_file.is_file()
    assert saved_file.stat().st_size > 0

    # Test saving to a specific file path
    target_file = tmp_path / "my_explicit_name.mp4"
    save_res2 = client.post(f"/api/jobs/{job_id}/save-to", json={"destination": str(target_file)})
    assert save_res2.status_code == 200
    assert target_file.is_file()
    assert target_file.stat().st_size > 0


def test_open_folder_endpoint(client, monkeypatch, tmp_path):
    """Test POST /api/jobs/{job_id}/open-folder with nonexistent and valid jobs."""
    # 1. Nonexistent job should 404
    res = client.post("/api/jobs/nonexistent-job-id/open-folder")
    assert res.status_code == 404

    # 2. Mock subprocess.Popen for a completed job
    mock_called = []
    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: mock_called.append(args))

    from app.main import job_manager
    from app.engine.builder import VideoFilterConfig
    out_file = tmp_path / "dummy_out.mp4"
    out_file.write_bytes(b"dummy")

    job = job_manager.create_job(
        input_path="dummy.mp4",
        output_path=str(out_file),
        config=VideoFilterConfig(),
    )
    job.status = "completed"

    res_valid = client.post(f"/api/jobs/{job.id}/open-folder")
    assert res_valid.status_code == 200
    data = res_valid.json()
    assert data["success"] is True
    assert len(mock_called) == 1
