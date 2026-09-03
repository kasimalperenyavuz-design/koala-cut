"""End-to-End integration test suite for real-world media processing workflows.

Tests media transformations against actual FFmpeg commands and probes the resulting
media with ffprobe (via app.engine.probe.probe_media).
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient

from app.engine.builder import CutSegment, FFmpegCommandBuilder, VideoFilterConfig
from app.engine.probe import probe_media
from app.engine.runner import AsyncFFmpegRunner
from app.main import app


# ---------------------------------------------------------------------------
# Session-level Fixtures: Generating Media Fixtures with FFmpeg
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def media_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Create session-level directory for test media."""
    return tmp_path_factory.mktemp("e2e_fixtures")


@pytest.fixture(scope="session")
def video_6s(media_dir: Path) -> str:
    """Fixture: 6-second 1280x720 @ 30fps test video with audio.

    Used for trimming / cut scenario.
    """
    path = str(media_dir / "test_6s_input.mp4")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=6:size=1280x720:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=6",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return path


@pytest.fixture(scope="session")
def video_1280x720_30fps(media_dir: Path) -> str:
    """Fixture: Standard 3-second 1280x720 @ 30fps test video with audio.

    Used for pad, crop, downscale, and audio stripping scenarios.
    """
    path = str(media_dir / "test_1280x720_30fps.mp4")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=3:size=1280x720:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return path


@pytest.fixture(scope="session")
def high_bitrate_video(media_dir: Path) -> str:
    """Fixture: High-bitrate test video (~3.8MB, 3.0s) using testsrc2.

    Used for target file size compression scenario.
    """
    path = str(media_dir / "test_high_bitrate.mp4")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc2=duration=3:size=1280x720:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=880:duration=3",
            "-c:v", "libx264", "-crf", "16", "-preset", "ultrafast",
            "-c:a", "aac", "-b:a", "128k",
            path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return path


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """TestClient fixture for backend API integration tests."""
    with TestClient(app) as test_client:
        yield test_client


# ---------------------------------------------------------------------------
# Core E2E Scenarios
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scenario_1_trimming(video_6s: str, tmp_path: Path) -> None:
    """Scenario 1: Trimming (Cut).

    Input: 6-second test video.
    Config: start_time=1.0, end_time=3.5.
    Verification: Probe output video with probe_media, verify duration is ~2.5s (within ±0.3s tolerance).
    """
    out_file = str(tmp_path / "scenario_1_trimmed.mp4")
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        start_time=1.0,
        end_time=3.5,
        preset="ultrafast",
    )
    cmd = builder.build(video_6s, out_file, cfg, source_duration=6.0)

    runner = AsyncFFmpegRunner()
    res = await runner.run(cmd, expected_duration=2.5)
    assert res.success is True
    assert os.path.isfile(out_file)

    info = probe_media(out_file)
    expected_duration = 2.5
    actual_duration = info["duration"]

    assert abs(actual_duration - expected_duration) <= 0.3, (
        f"Expected duration {expected_duration}s ±0.3s, got {actual_duration}s"
    )
    assert info["video"] is not None
    assert info["video"]["width"] == 1280
    assert info["video"]["height"] == 720


@pytest.mark.asyncio
async def test_scenario_2_aspect_ratio_pad(video_1280x720_30fps: str, tmp_path: Path) -> None:
    """Scenario 2: Aspect Ratio & Pad (16:9 to 9:16 Vertical).

    Input: 1280x720 video.
    Config: aspect_ratio="9:16", fit_mode="pad".
    Verification: Probe output, verify height > width and aspect ratio is 9:16 (e.g. 720x1280 or 1080x1920).
    """
    out_file = str(tmp_path / "scenario_2_padded.mp4")
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        aspect_ratio="9:16",
        fit_mode="pad",
        preset="ultrafast",
    )
    cmd = builder.build(video_1280x720_30fps, out_file, cfg, source_duration=3.0)

    runner = AsyncFFmpegRunner()
    res = await runner.run(cmd, expected_duration=3.0)
    assert res.success is True
    assert os.path.isfile(out_file)

    info = probe_media(out_file)
    assert info["video"] is not None
    v = info["video"]

    # Verify height > width (vertical orientation)
    assert v["height"] > v["width"], f"Height ({v['height']}) must be > width ({v['width']})"
    # Verify aspect ratio matches 9:16
    assert v["aspect_ratio"] == "9:16", f"Expected aspect ratio '9:16', got '{v['aspect_ratio']}'"


@pytest.mark.asyncio
async def test_scenario_3_aspect_ratio_crop(video_1280x720_30fps: str, tmp_path: Path) -> None:
    """Scenario 3: Aspect Ratio & Crop (16:9 to 1:1 Square).

    Input: 1280x720 video.
    Config: aspect_ratio="1:1", fit_mode="crop".
    Verification: Probe output, verify width == height (e.g. 720x720 or 1080x1080) and aspect ratio 1:1.
    """
    out_file = str(tmp_path / "scenario_3_cropped.mp4")
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        aspect_ratio="1:1",
        fit_mode="crop",
        preset="ultrafast",
    )
    cmd = builder.build(video_1280x720_30fps, out_file, cfg, source_duration=3.0)

    runner = AsyncFFmpegRunner()
    res = await runner.run(cmd, expected_duration=3.0)
    assert res.success is True
    assert os.path.isfile(out_file)

    info = probe_media(out_file)
    assert info["video"] is not None
    v = info["video"]

    # Verify width == height (square geometry)
    assert v["width"] == v["height"], f"Width ({v['width']}) must equal height ({v['height']})"
    assert v["aspect_ratio"] == "1:1", f"Expected aspect ratio '1:1', got '{v['aspect_ratio']}'"


@pytest.mark.asyncio
async def test_scenario_4_resolution_downscale_and_fps(video_1280x720_30fps: str, tmp_path: Path) -> None:
    """Scenario 4: Resolution Downscale & FPS Change.

    Input: 1280x720 @ 30fps.
    Config: width=854, height=480, fps=24.0.
    Verification: Probe output, verify width=854, height=480, fps is ~24.0.
    """
    out_file = str(tmp_path / "scenario_4_scaled_fps.mp4")
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        width=854,
        height=480,
        fps=24.0,
        preset="ultrafast",
    )
    cmd = builder.build(video_1280x720_30fps, out_file, cfg, source_duration=3.0)

    runner = AsyncFFmpegRunner()
    res = await runner.run(cmd, expected_duration=3.0)
    assert res.success is True
    assert os.path.isfile(out_file)

    info = probe_media(out_file)
    assert info["video"] is not None
    v = info["video"]

    assert v["width"] == 854, f"Expected width 854, got {v['width']}"
    assert v["height"] == 480, f"Expected height 480, got {v['height']}"
    assert abs(v["fps"] - 24.0) < 0.2, f"Expected fps ~24.0, got {v['fps']}"


@pytest.mark.asyncio
async def test_scenario_5_target_file_size_compression(high_bitrate_video: str, tmp_path: Path) -> None:
    """Scenario 5: Target File Size Compression.

    Input: High bitrate test video (~3.8MB).
    Config: mode="target_size", target_size_mb=0.8.
    Verification: Check output file size on disk, verify it is close to 0.8MB (within reasonable ±25% encoding tolerance).
    """
    out_file = str(tmp_path / "scenario_5_compressed.mp4")
    builder = FFmpegCommandBuilder()
    target_mb = 0.8
    cfg = VideoFilterConfig(
        mode="target_size",
        target_size_mb=target_mb,
        preset="fast",
    )
    cmd = builder.build(high_bitrate_video, out_file, cfg, source_duration=3.0)

    runner = AsyncFFmpegRunner()
    res = await runner.run(cmd, expected_duration=3.0)
    assert res.success is True
    assert os.path.isfile(out_file)

    file_size_bytes = os.path.getsize(out_file)
    file_size_mb = file_size_bytes / (1024.0 * 1024.0)

    lower_bound = target_mb * 0.75  # 0.60 MB (-25%)
    upper_bound = target_mb * 1.25  # 1.00 MB (+25%)

    assert lower_bound <= file_size_mb <= upper_bound, (
        f"File size {file_size_mb:.3f}MB not within ±25% of target {target_mb}MB "
        f"[{lower_bound:.2f}MB - {upper_bound:.2f}MB]"
    )


@pytest.mark.asyncio
async def test_scenario_6_audio_stripping(video_1280x720_30fps: str, tmp_path: Path) -> None:
    """Scenario 6: Audio Stripping.

    Input: Test video with audio.
    Config: remove_audio=True.
    Verification: Probe output, verify audio stream is None.
    """
    # Verify input has audio first
    input_info = probe_media(video_1280x720_30fps)
    assert input_info["audio"] is not None, "Input fixture must contain an audio stream"

    out_file = str(tmp_path / "scenario_6_silent.mp4")
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        remove_audio=True,
        preset="ultrafast",
    )
    cmd = builder.build(video_1280x720_30fps, out_file, cfg, source_duration=3.0)

    runner = AsyncFFmpegRunner()
    res = await runner.run(cmd, expected_duration=3.0)
    assert res.success is True
    assert os.path.isfile(out_file)

    output_info = probe_media(out_file)
    assert output_info["audio"] is None, (
        f"Expected audio stream to be None, but found: {output_info['audio']}"
    )
    assert output_info["video"] is not None


@pytest.mark.asyncio
async def test_crf_compression_efficiency(video_1280x720_30fps: str, tmp_path: Path) -> None:
    """Exercise CRF compression: compare CRF 18 (high quality) vs CRF 35 (high compression).

    Verifies that increasing CRF significantly reduces output file size.
    """
    out_crf_18 = str(tmp_path / "crf_18.mp4")
    out_crf_35 = str(tmp_path / "crf_35.mp4")
    builder = FFmpegCommandBuilder()
    runner = AsyncFFmpegRunner()

    cmd_18 = builder.build(
        video_1280x720_30fps,
        out_crf_18,
        VideoFilterConfig(mode="crf", crf=18, preset="ultrafast"),
        source_duration=3.0,
    )
    await runner.run(cmd_18, expected_duration=3.0)

    cmd_35 = builder.build(
        video_1280x720_30fps,
        out_crf_35,
        VideoFilterConfig(mode="crf", crf=35, preset="ultrafast"),
        source_duration=3.0,
    )
    await runner.run(cmd_35, expected_duration=3.0)

    size_18 = os.path.getsize(out_crf_18)
    size_35 = os.path.getsize(out_crf_35)

    assert size_35 < size_18 * 0.5, (
        f"CRF 35 size ({size_35} bytes) should be significantly smaller than CRF 18 ({size_18} bytes)"
    )


def test_e2e_full_job_lifecycle_via_api(client: TestClient, video_1280x720_30fps: str) -> None:
    """End-to-end test verifying upload -> job submission -> polling -> download -> ffprobe check."""
    # 1. Upload media
    with open(video_1280x720_30fps, "rb") as f:
        up_res = client.post(
            "/api/upload",
            files={"file": ("e2e_input.mp4", f, "video/mp4")},
        )
    assert up_res.status_code == 201
    file_id = up_res.json()["file_id"]

    # 2. Submit processing job with trim + crop + fps change
    job_payload = {
        "file_id": file_id,
        "config": {
            "start_time": 0.5,
            "end_time": 2.5,
            "aspect_ratio": "1:1",
            "fit_mode": "crop",
            "fps": 25.0,
            "preset": "ultrafast",
        },
    }
    job_res = client.post("/api/jobs", json=job_payload)
    assert job_res.status_code == 201
    job_id = job_res.json()["job_id"]

    # 3. Poll until job completes
    max_wait = 15.0
    start = time.time()
    final_status = None
    while time.time() - start < max_wait:
        st_res = client.get(f"/api/jobs/{job_id}")
        assert st_res.status_code == 200
        cur = st_res.json()
        if cur["status"] in ("completed", "failed"):
            final_status = cur
            break
        time.sleep(0.2)

    assert final_status is not None, "Job timed out"
    assert final_status["status"] == "completed", f"Job failed with {final_status.get('error')}"

    # 4. Download processed output and save to disk
    dl_res = client.get(f"/api/download/{job_id}")
    assert dl_res.status_code == 200
    tmp_download = Path(video_1280x720_30fps).parent / "downloaded_e2e.mp4"
    tmp_download.write_bytes(dl_res.content)

    try:
        # 5. Probe downloaded output
        info = probe_media(str(tmp_download))
        assert info["video"] is not None
        v = info["video"]
        assert v["aspect_ratio"] == "1:1"
        assert v["width"] == v["height"]
        assert abs(v["fps"] - 25.0) < 0.2
        assert abs(info["duration"] - 2.0) <= 0.3
    finally:
        if tmp_download.exists():
            tmp_download.unlink()


@pytest.mark.asyncio
async def test_scenario_7_multi_segment_cut(video_1280x720_30fps: str, tmp_path: Path) -> None:
    """Scenario 7: Multi-segment cut out (remove parts from video).

    Input: 3.0s video.
    Cut segments to remove: [0.5, 1.2] and [2.0, 2.5] (total 1.2s removed).
    Expected duration: ~1.8s.
    """
    out_file = str(tmp_path / "scenario_7_multicut.mp4")
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        cut_out_segments=[
            CutSegment(start=0.5, end=1.2),
            CutSegment(start=2.0, end=2.5),
        ],
        preset="ultrafast",
    )
    cmd = builder.build(video_1280x720_30fps, out_file, cfg, source_duration=3.0)

    runner = AsyncFFmpegRunner()
    res = await runner.run(cmd, expected_duration=1.8)
    assert res.success is True
    assert os.path.isfile(out_file)

    info = probe_media(out_file)
    assert abs(info["duration"] - 1.8) <= 0.3, f"Expected ~1.8s, got {info['duration']}s"
    assert info["video"] is not None
    assert info["audio"] is not None
