"""Tests for v1.4.0 Transitions Studio & Advanced Subtitles Suite."""

import os
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.engine.builder import FFmpegCommandBuilder, VideoFilterConfig, TimelineTrack, TimelineClip
from app.engine.transitions import TransitionManager, BUILTIN_TRANSITIONS, CLOUD_PACKS
from app.services.subtitle_service import wrap_balanced_lines, WordTiming, SubtitleSegment


def test_builtin_transitions_catalog():
    """Verify built-in transitions count and catalog integrity."""
    catalog = TransitionManager.get_catalog()
    assert "builtin" in catalog
    assert len(catalog["builtin"]) >= 24
    
    categories = {t["category"] for t in catalog["builtin"]}
    assert "basic" in categories
    assert "camera" in categories
    assert "slide" in categories
    assert "mask" in categories
    assert "glitch" in categories

    # Verify lookup by ID and xfade_type
    t_fade = TransitionManager.get_transition_by_id("crossfade")
    assert t_fade is not None
    assert t_fade["xfade_type"] == "fade"

    t_whip = TransitionManager.get_transition_by_id("whip_left")
    assert t_whip is not None
    assert t_whip["xfade_type"] == "smoothleft"


def test_cloud_packs_catalog():
    """Verify downloadable transition packs definitions."""
    catalog = TransitionManager.get_catalog()
    assert "packs" in catalog
    assert len(catalog["packs"]) == 3
    pack_ids = [p["id"] for p in catalog["packs"]]
    assert "pack_light_leaks" in pack_ids
    assert "pack_vhs_glitch" in pack_ids
    assert "pack_paper_mattes" in pack_ids


def test_wrap_balanced_lines():
    """Verify smart subtitle line wrapping splits long sentences cleanly at word boundaries."""
    short_text = "Merhaba dünya"
    assert wrap_balanced_lines(short_text, max_chars=32) == short_text

    long_text = "telegama, gelebilirler, görüşmek üzere herkese selamlar ve sevgiler"
    wrapped = wrap_balanced_lines(long_text, max_chars=30)
    assert "\n" in wrapped
    lines = wrapped.split("\n")
    assert len(lines) == 2
    # Ensure no words were chopped in half
    assert "".join(lines) == long_text.replace("\n", "") or " ".join(lines) == long_text


def test_subtitle_ass_style_margins_and_wrap():
    """Verify MarginL, MarginR, MarginV and WrapStyle=0 in ASS subtitle filter."""
    builder = FFmpegCommandBuilder()
    config = VideoFilterConfig(
        burn_subtitles=True,
        subtitle_file_path="dummy_sub.srt",
        subtitle_max_width_pct=70,
        subtitle_y_pos_pct=80,
        width=1920,
        height=1080,
    )

    cmd = builder.build("dummy_in.mp4", "dummy_out.mp4", config, source_duration=10.0)
    cmd_str = " ".join(cmd)

    # Must contain MarginL, MarginR, MarginV, and WrapStyle=0
    assert "MarginL=" in cmd_str
    assert "MarginR=" in cmd_str
    assert "MarginV=" in cmd_str
    assert "WrapStyle=0" in cmd_str


def test_timeline_transition_xfade_command_generation():
    """Verify that FFmpegCommandBuilder generates xfade and acrossfade filters when transitions are configured."""
    builder = FFmpegCommandBuilder()
    clip1 = TimelineClip(
        id="c1",
        in_point=0.0,
        out_point=4.0,
        timeline_start=0.0,
        transition_out="whip_left",
        transition_duration=0.5,
    )
    clip2 = TimelineClip(
        id="c2",
        in_point=1.0,
        out_point=5.0,
        timeline_start=3.5,
    )

    config = VideoFilterConfig(
        timeline_tracks=[
            TimelineTrack(id="v1", type="video", clips=[clip1, clip2]),
        ]
    )

    cmd = builder.build("dummy_in.mp4", "dummy_out.mp4", config, source_duration=10.0)
    cmd_str = " ".join(cmd)

    # Should contain xfade with transition=smoothleft, duration=0.5, offset=3.5
    assert "xfade=" in cmd_str
    assert "transition=smoothleft" in cmd_str
    assert "duration=0.500" in cmd_str
    assert "offset=3.500" in cmd_str
    assert "acrossfade=" in cmd_str


def test_transitions_api_endpoints():
    """Test transitions FastAPI endpoints."""
    client = TestClient(app)

    # 1. Catalog
    res = client.get("/api/transitions/catalog")
    assert res.status_code == 200
    data = res.json()
    assert "builtin" in data
    assert len(data["builtin"]) >= 24

    # 2. Download trigger
    res_dl = client.post("/api/transitions/download/pack_light_leaks")
    assert res_dl.status_code == 200
    assert res_dl.json()["status"] == "started"

    # 3. Progress check
    res_prog = client.get("/api/transitions/download/progress/pack_light_leaks")
    assert res_prog.status_code == 200
    pdata = res_prog.json()
    assert "status" in pdata
