"""Unit tests for AI Features: Silence Removal, Faster-Whisper Subtitles, and RNNoise Voice Isolation."""

import os
import pytest
from app.engine.builder import (
    FFmpegCommandBuilder,
    VideoFilterConfig,
    TimelineTrack,
    TimelineClip,
)
from app.services.silence_detector import SilenceDetector, SilenceDetectionResult
from app.services.subtitle_service import SubtitleSegment, SubtitleResult


def test_rnnoise_neural_voice_isolation_in_timeline():
    """Verify that enabling neural_voice_isolation adds arnndn filter in timeline multi-track."""
    builder = FFmpegCommandBuilder()
    clip = TimelineClip(
        id="c1",
        in_point=0.0,
        out_point=5.0,
        timeline_start=0.0,
        neural_voice_isolation=True,
        voice_isolation_mix=0.85,
    )
    track = TimelineTrack(id="v1", type="video", clips=[clip])
    config = VideoFilterConfig(timeline_tracks=[track])

    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=5.0)
    cmd_str = " ".join(cmd)

    assert "arnndn" in cmd_str
    assert "bd.rnnn" in cmd_str
    assert "mix=0.85" in cmd_str


def test_rnnoise_neural_voice_isolation_in_simple_mode():
    """Verify that simple mode applies arnndn to audio filters."""
    builder = FFmpegCommandBuilder()
    config = VideoFilterConfig(
        neural_voice_isolation=True,
        voice_isolation_mix=1.0,
    )

    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=5.0)
    cmd_str = " ".join(cmd)

    assert "-af" in cmd
    assert "arnndn" in cmd_str
    assert "bd.rnnn" in cmd_str
    assert "mix=1.00" in cmd_str


def test_burn_subtitles_filter():
    """Verify that burn_subtitles appends subtitles filter to video filters."""
    builder = FFmpegCommandBuilder()
    dummy_srt = os.path.abspath("tests/dummy.srt")
    with open(dummy_srt, "w", encoding="utf-8") as f:
        f.write("1\n00:00:00,000 --> 00:00:01,000\nHello\n")

    try:
        config = VideoFilterConfig(
            burn_subtitles=True,
            subtitle_file_path=dummy_srt,
        )
        cmd = builder.build("input.mp4", "output.mp4", config, source_duration=5.0)
        cmd_str = " ".join(cmd)

        assert "subtitles=filename=" in cmd_str
        assert "dummy.srt" in cmd_str
    finally:
        if os.path.exists(dummy_srt):
            os.remove(dummy_srt)


def test_subtitle_segment_timecode_formatting():
    """Verify that SubtitleSegment formats SRT (comma) and VTT (period) timecodes accurately."""
    seg = SubtitleSegment(
        id=1,
        start=65.432,  # 00:01:05.432
        end=72.100,    # 00:01:12.100
        text="Deneme altyazı metni",
    )

    assert seg.start_timecode_srt == "00:01:05,432"
    assert seg.end_timecode_srt == "00:01:12,100"
    assert seg.start_timecode_vtt == "00:01:05.432"
    assert seg.end_timecode_vtt == "00:01:12.100"


def test_api_silence_detection_endpoint(tmp_path):
    """Verify POST /api/ai/silence-detect endpoint returns structured intervals."""
    import subprocess
    from fastapi.testclient import TestClient
    from app.main import app
    from app.services.storage import storage_manager

    sample_video = str(tmp_path / "sample_silence.mp4")
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=25",
        "-f", "lavfi", "-i", "sine=frequency=0:duration=2",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        sample_video
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    file_id = "test_silence_file"
    storage_manager.register_file(file_id, sample_video)

    client = TestClient(app)
    res = client.post("/api/ai/silence-detect", json={
        "file_id": file_id,
        "noise_threshold_db": -30.0,
        "min_silence_sec": 0.3,
        "padding_sec": 0.05,
    })

    assert res.status_code == 200
    data = res.json()
    assert "silent_intervals" in data
    assert "speech_segments" in data
    assert data["total_duration"] >= 1.5
