import subprocess
import pytest
from pathlib import Path
from app.engine.binaries import get_ffmpeg_path
from app.engine.builder import TimelineClip, TimelineTrack, VideoFilterConfig, FFmpegCommandBuilder
from app.engine.runner import AsyncFFmpegRunner
from app.engine.probe import probe_media

@pytest.fixture(scope="module")
def sample_video(tmp_path_factory: pytest.TempPathFactory) -> str:
    path = str(tmp_path_factory.mktemp("timeline_fixtures") / "sample_6s.mp4")
    ffmpeg = get_ffmpeg_path()
    cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100",
        "-t", "6.0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        path,
    ]
    res = subprocess.run(cmd, capture_output=True)
    assert res.returncode == 0, f"Failed to create fixture: {res.stderr.decode()}"
    return path

def test_timeline_clip_validation():
    clip = TimelineClip(id="c1", in_point=1.0, out_point=4.5, speed=1.0)
    assert clip.duration == 3.5

    clip_fast = TimelineClip(id="c2", in_point=2.0, out_point=6.0, speed=2.0)
    assert clip_fast.duration == 2.0

    with pytest.raises(ValueError):
        TimelineClip(id="c3", in_point=5.0, out_point=3.0)

def test_timeline_track_builder_multi_clip():
    builder = FFmpegCommandBuilder()
    track = TimelineTrack(
        id="v1",
        type="video",
        clips=[
            TimelineClip(id="c1", in_point=1.0, out_point=3.0),
            TimelineClip(id="c2", in_point=5.0, out_point=8.0),
        ]
    )
    config = VideoFilterConfig(timeline_tracks=[track], mode="crf", crf=23)
    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=10.0)
    cmd_str = " ".join(cmd)
    assert "-filter_complex" in cmd_str
    assert "trim=start=1.000:end=3.000" in cmd_str
    assert "trim=start=5.000:end=8.000" in cmd_str
    assert "concat=n=2:v=1:a=1" in cmd_str

def test_timeline_track_speed_multiplier():
    builder = FFmpegCommandBuilder()
    track = TimelineTrack(
        id="v1",
        type="video",
        clips=[
            TimelineClip(id="c1", in_point=0.0, out_point=4.0, speed=2.0),
        ]
    )
    config = VideoFilterConfig(timeline_tracks=[track], mode="crf", crf=23)
    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=10.0)
    cmd_str = " ".join(cmd)
    assert "setpts=0.5000*(PTS-STARTPTS)" in cmd_str
    assert "atempo=2.0000" in cmd_str

@pytest.mark.asyncio
async def test_timeline_real_media_processing(tmp_path: Path, sample_video: str):
    output_file = str(tmp_path / "timeline_output.mp4")
    builder = FFmpegCommandBuilder()
    track = TimelineTrack(
        id="v1",
        type="video",
        clips=[
            TimelineClip(id="clip-1", in_point=0.5, out_point=2.0),  # 1.5s
            TimelineClip(id="clip-2", in_point=3.5, out_point=5.5),  # 2.0s
        ]
    )
    config = VideoFilterConfig(timeline_tracks=[track], mode="crf", crf=23)
    cmd = builder.build(sample_video, output_file, config, source_duration=6.0)

    runner = AsyncFFmpegRunner()
    result = await runner.run(cmd, expected_duration=3.5)
    assert result.success is True

    meta = probe_media(output_file)
    assert meta["duration"] == pytest.approx(3.5, abs=0.4)

def test_api_job_lifecycle_with_timeline_tracks(sample_video: str):
    import time
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        with open(sample_video, "rb") as f:
            up_res = client.post("/api/upload", files={"file": ("timeline_test.mp4", f, "video/mp4")})
        assert up_res.status_code in (200, 201)
        file_id = up_res.json()["file_id"]

        payload = {
            "file_id": file_id,
            "config": {
                "mode": "crf",
                "crf": 26,
                "preset": "ultrafast",
                "timeline_tracks": [
                    {
                        "id": "v1",
                        "type": "video",
                        "clips": [
                            {"id": "clip-1", "in_point": 1.0, "out_point": 2.5, "timeline_start": 0.0, "speed": 1.0, "volume": 1.0},
                            {"id": "clip-2", "in_point": 3.0, "out_point": 4.5, "timeline_start": 1.5, "speed": 1.0, "volume": 1.0},
                        ],
                    }
                ],
            },
        }

        job_res = client.post("/api/jobs", json=payload)
        assert job_res.status_code == 201
        job_id = job_res.json()["job_id"]

        max_wait = 20.0
        start = time.time()
        completed = False
        while time.time() - start < max_wait:
            status_res = client.get(f"/api/jobs/{job_id}")
            assert status_res.status_code == 200
            data = status_res.json()
            if data["status"] == "completed":
                completed = True
                assert data["progress"] == 100
                break
            elif data["status"] == "failed":
                pytest.fail(f"Job failed with error: {data.get('error')}")
            time.sleep(0.3)

        assert completed is True, "Job did not complete within timeout"
        dl_res = client.get(f"/api/download/{job_id}")
        assert dl_res.status_code == 200
        assert len(dl_res.content) > 0

