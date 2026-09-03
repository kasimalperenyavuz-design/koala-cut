"""Tests for GPU hardware acceleration detection and builder support."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.engine.hardware import detect_gpu_capabilities
from app.engine.builder import FFmpegCommandBuilder, VideoFilterConfig


@pytest.fixture
def client():
    """Create a FastAPI TestClient."""
    with TestClient(app) as test_client:
        yield test_client


def test_hardware_detection_function():
    """Test detect_gpu_capabilities returns expected schema."""
    caps = detect_gpu_capabilities()
    assert isinstance(caps, dict)
    assert "gpu_name" in caps
    assert "hardware_type" in caps
    assert "is_hardware_accelerated" in caps
    assert "available_encoders" in caps
    assert "recommended_h264" in caps
    assert "recommended_hevc" in caps
    assert "description" in caps
    assert "libx264" in caps["available_encoders"]
    assert "libx265" in caps["available_encoders"]


def test_hardware_api_endpoint(client):
    """Test GET /api/hardware endpoint."""
    res = client.get("/api/hardware")
    assert res.status_code == 200
    data = res.json()
    assert "gpu_name" in data
    assert "is_hardware_accelerated" in data
    assert "recommended_h264" in data


def test_builder_with_nvenc_crf():
    """Verify builder produces correct flags for NVENC CRF mode."""
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        video_codec="h264_nvenc",
        mode="crf",
        crf=22,
        preset="medium",
    )
    cmd = builder.build("input.mp4", "output.mp4", cfg, 10.0)
    cmd_str = " ".join(cmd)
    assert "-c:v h264_nvenc" in cmd_str
    assert "-rc:v vbr" in cmd_str
    assert "-cq:v 22" in cmd_str
    assert "-preset p4" in cmd_str


def test_builder_with_nvenc_target_size():
    """Verify builder produces correct flags for NVENC target size mode."""
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        video_codec="h264_nvenc",
        mode="target_size",
        target_size_mb=10.0,
        preset="fast",
    )
    cmd = builder.build("input.mp4", "output.mp4", cfg, 20.0)
    cmd_str = " ".join(cmd)
    assert "-c:v h264_nvenc" in cmd_str
    assert "-b:v" in cmd_str
    assert "-preset p2" in cmd_str
