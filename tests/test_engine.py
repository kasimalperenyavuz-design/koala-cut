"""Unit and integration tests for app.engine."""

import asyncio
import os
import tempfile
import pytest
import subprocess

from app.engine.probe import (
    probe_media,
    probe_media_async,
    ProbeError,
    _calculate_aspect_ratio,
)
from app.engine.builder import (
    VideoFilterConfig,
    FFmpegCommandBuilder,
)
from app.engine.runner import (
    AsyncFFmpegRunner,
    FFmpegExecutionError,
    FFmpegCancelledError,
)


@pytest.fixture(scope="session")
def sample_media(tmp_path_factory):
    """Generate sample test video with audio using ffmpeg."""
    tmp_dir = tmp_path_factory.mktemp("media")
    video_path = str(tmp_dir / "sample_video.mp4")
    audio_path = str(tmp_dir / "sample_audio.mp3")

    # Generate 3-second 640x360 30fps video with sine audio
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=3:size=640x360:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=3",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            video_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Generate 2-second audio-only file
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
            "-c:a", "libmp3lame",
            audio_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return {"video": video_path, "audio": audio_path, "dir": str(tmp_dir)}


# ---------------------------------------------------------------------------
# Probe Tests
# ---------------------------------------------------------------------------

def test_probe_media_video(sample_media):
    data = probe_media(sample_media["video"])
    assert data["duration"] >= 2.9
    assert data["size_bytes"] > 0
    assert data["bitrate"] > 0
    assert data["video"] is not None
    assert data["video"]["width"] == 640
    assert data["video"]["height"] == 360
    assert data["video"]["aspect_ratio"] == "16:9"
    assert abs(data["video"]["fps"] - 30.0) < 0.1
    assert data["video"]["codec"] == "h264"
    assert data["audio"] is not None
    assert data["audio"]["codec"] == "aac"
    assert data["audio"]["channels"] >= 1
    assert data["audio"]["sample_rate"] > 0


@pytest.mark.asyncio
async def test_probe_media_async(sample_media):
    data = await probe_media_async(sample_media["video"])
    assert data["video"]["width"] == 640
    assert data["video"]["height"] == 360
    assert data["video"]["aspect_ratio"] == "16:9"


def test_probe_media_audio_only(sample_media):
    data = probe_media(sample_media["audio"])
    assert data["duration"] >= 1.9
    assert data["video"] is None
    assert data["audio"] is not None
    assert data["audio"]["codec"] == "mp3"


def test_probe_media_not_found():
    with pytest.raises(FileNotFoundError):
        probe_media("non_existent_file_path_12345.mp4")


def test_probe_media_corrupted(tmp_path):
    corrupt_file = tmp_path / "corrupt.mp4"
    corrupt_file.write_bytes(b"This is not a media file.")
    with pytest.raises(ProbeError):
        probe_media(str(corrupt_file))


def test_calculate_aspect_ratio():
    assert _calculate_aspect_ratio(1920, 1080) == "16:9"
    assert _calculate_aspect_ratio(1080, 1920) == "9:16"
    assert _calculate_aspect_ratio(1080, 1080) == "1:1"
    assert _calculate_aspect_ratio(1080, 1350) == "4:5"
    assert _calculate_aspect_ratio(1280, 720) == "16:9"
    assert _calculate_aspect_ratio(640, 480) == "4:3"


# ---------------------------------------------------------------------------
# Builder Tests
# ---------------------------------------------------------------------------

def test_builder_pad_filter():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        width=1280,
        height=720,
        fit_mode="pad",
    )
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    cmd_str = " ".join(cmd)
    assert "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" in cmd_str
    assert "-c:v libx264" in cmd_str
    assert "-crf 23" in cmd_str
    assert "-c:a aac -b:a 128k" in cmd_str


def test_builder_crop_filter():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        width=1080,
        height=1920,
        fit_mode="crop",
    )
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    cmd_str = " ".join(cmd)
    assert "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2" in cmd_str


def test_builder_scale_filter_aspect_ratio():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        aspect_ratio="1:1",
        fit_mode="scale",
    )
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    cmd_str = " ".join(cmd)
    assert "scale=1080:1080" in cmd_str


def test_builder_trim_fast_seek():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        start_time=1.5,
        end_time=4.0,
        fast_seek=True,
    )
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    # Fast seek flags must be before -i
    ss_idx = cmd.index("-ss")
    i_idx = cmd.index("-i")
    assert ss_idx < i_idx
    assert cmd[ss_idx + 1] == "1.500"
    to_idx = cmd.index("-to")
    assert to_idx < i_idx
    assert cmd[to_idx + 1] == "4.000"


def test_builder_trim_accurate_seek():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        start_time=2.0,
        end_time=5.0,
        fast_seek=False,
    )
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    ss_idx = cmd.index("-ss")
    i_idx = cmd.index("-i")
    assert ss_idx > i_idx


def test_builder_fps_filter():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(fps=60.0)
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    cmd_str = " ".join(cmd)
    assert "fps=fps=60.0" in cmd_str


def test_builder_target_size_mode():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        mode="target_size",
        target_size_mb=10.0,
        audio_bitrate_kbps=128,
        video_codec="libx264",
    )
    # 60 second duration with 10MB target
    cmd = builder.build("in.mp4", "out.mp4", cfg, source_duration=60.0)
    cmd_str = " ".join(cmd)
    assert "-b:v" in cmd_str
    assert "-maxrate" in cmd_str
    assert "-bufsize" in cmd_str

    # Validate math:
    # 10 MB = 10 * 8 * 1024 * 1024 = 83,886,080 bits
    # Audio = 128 * 1000 * 60 = 7,680,000 bits
    # Video = 83,886,080 - 7,680,000 = 76,206,080 bits
    # Video kbps = 76,206,080 / 60 / 1000 = 1270 kbps
    expected_kbps = FFmpegCommandBuilder.calculate_target_bitrate_kbps(10.0, 60.0, 128, False)
    assert expected_kbps == 1270
    assert f"-b:v {expected_kbps}k" in cmd_str


def test_builder_remove_audio():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(remove_audio=True)
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    assert "-an" in cmd
    assert "-c:a" not in cmd


def test_builder_copy_mode():
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(mode="copy")
    cmd = builder.build("in.mp4", "out.mp4", cfg)
    assert "-c:v copy" in " ".join(cmd)
    assert "-c:a copy" in " ".join(cmd)


def test_builder_validation_errors():
    with pytest.raises(ValueError, match="start_time"):
        VideoFilterConfig(start_time=10.0, end_time=5.0)

    with pytest.raises(ValueError, match="target_size_mb"):
        VideoFilterConfig(mode="target_size")

    builder = FFmpegCommandBuilder()
    # Copy mode with filters should raise error
    with pytest.raises(ValueError, match="Cannot use 'copy' mode"):
        builder.build("in.mp4", "out.mp4", VideoFilterConfig(mode="copy", width=1280, height=720))


# ---------------------------------------------------------------------------
# Runner Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_runner_execution_and_progress(sample_media, tmp_path):
    output_path = str(tmp_path / "transcoded.mp4")
    builder = FFmpegCommandBuilder()
    cfg = VideoFilterConfig(
        fps=24.0,
        crf=28,
        preset="ultrafast",
        width=320,
        height=180,
    )
    cmd = builder.build(sample_media["video"], output_path, cfg, source_duration=3.0)

    progress_events = []

    def on_progress(stats):
        progress_events.append(stats)

    runner = AsyncFFmpegRunner(on_progress=on_progress)
    result = await runner.run(cmd, expected_duration=3.0)

    assert result.success is True
    assert result.returncode == 0
    assert os.path.isfile(output_path)
    assert os.path.getsize(output_path) > 0

    # Ensure progress events were captured
    assert len(progress_events) > 0
    last_event = progress_events[-1]
    assert last_event["percent"] == 100.0
    assert "fps" in last_event
    assert "speed" in last_event
    assert "time" in last_event


@pytest.mark.asyncio
async def test_runner_failure():
    runner = AsyncFFmpegRunner()
    # Invalid ffmpeg command
    cmd = ["ffmpeg", "-y", "-i", "non_existent_input.mp4", "output.mp4"]
    with pytest.raises(FFmpegExecutionError) as exc_info:
        await runner.run(cmd)
    assert exc_info.value.returncode != 0


@pytest.mark.asyncio
async def test_runner_cancellation(sample_media, tmp_path):
    output_path = str(tmp_path / "cancelled.mp4")
    builder = FFmpegCommandBuilder()
    # Run a slow encode to give time for cancel
    cfg = VideoFilterConfig(
        crf=23,
        preset="veryslow",
        fps=60.0,
    )
    cmd = builder.build(sample_media["video"], output_path, cfg, source_duration=3.0)

    runner = AsyncFFmpegRunner()

    async def cancel_later():
        await asyncio.sleep(0.3)
        await runner.cancel()

    cancel_task = asyncio.create_task(cancel_later())

    with pytest.raises(FFmpegCancelledError):
        await runner.run(cmd, expected_duration=3.0)

    await cancel_task
    assert runner.is_cancelled is True
