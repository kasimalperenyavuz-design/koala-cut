"""Unit and integration tests for Audio Suite and Transform / PIP engine."""

import pytest
from app.engine.builder import (
    FFmpegCommandBuilder,
    VideoFilterConfig,
    TimelineTrack,
    TimelineClip,
)


def test_audio_suite_denoise_filter_generation():
    """Verify that enabling denoise generates highpass, afftdn, and lowpass filters."""
    builder = FFmpegCommandBuilder()
    clip = TimelineClip(
        id="c1",
        in_point=0.0,
        out_point=5.0,
        timeline_start=0.0,
        denoise=True,
        denoise_level="high",
    )
    track = TimelineTrack(id="v1", type="video", clips=[clip])
    config = VideoFilterConfig(timeline_tracks=[track])

    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=5.0)
    cmd_str = " ".join(cmd)

    assert "afftdn=nr=25:nf=-40:tn=1" in cmd_str
    assert "highpass=f=80" in cmd_str
    assert "lowpass=f=12000" in cmd_str


def test_audio_suite_loudnorm_filter_generation():
    """Verify that enabling normalize_audio generates EBU R128 loudnorm filter."""
    builder = FFmpegCommandBuilder()
    clip = TimelineClip(
        id="c1",
        in_point=0.0,
        out_point=5.0,
        timeline_start=0.0,
        normalize_audio=True,
        target_lufs=-14.0,
    )
    track = TimelineTrack(id="v1", type="video", clips=[clip])
    config = VideoFilterConfig(timeline_tracks=[track])

    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=5.0)
    cmd_str = " ".join(cmd)

    assert "loudnorm=I=-14.0:LRA=11:TP=-1.5" in cmd_str


def test_multi_layer_pip_transform_overlay():
    """Verify that V1 base + V2 PIP generates correct scale and overlay filtergraph."""
    builder = FFmpegCommandBuilder()
    base_clip = TimelineClip(
        id="base1",
        in_point=0.0,
        out_point=10.0,
        timeline_start=0.0,
    )
    pip_clip = TimelineClip(
        id="pip1",
        in_point=0.0,
        out_point=5.0,
        timeline_start=2.0,
        scale=0.35,
        pos_x=30.0,
        pos_y=30.0,
        rotation=0.0,
    )
    t1 = TimelineTrack(id="v1", type="video", clips=[base_clip])
    t2 = TimelineTrack(id="v2", type="video", clips=[pip_clip])
    config = VideoFilterConfig(timeline_tracks=[t1, t2])

    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=10.0)
    cmd_str = " ".join(cmd)

    assert "overlay=" in cmd_str
    assert "scale=iw*0.350:-1" in cmd_str
    assert "between(t,2.000,7.000)" in cmd_str
