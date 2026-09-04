import pytest
from pathlib import Path
from app.engine.builder import (
    FFmpegCommandBuilder,
    VideoFilterConfig,
    TextOverlay,
    hex_to_ass_color,
)


def test_hex_to_ass_color():
    # White #FFFFFF -> &H00FFFFFF
    assert hex_to_ass_color("#FFFFFF") == "&H00FFFFFF"
    assert hex_to_ass_color("#ffffff") == "&H00FFFFFF"
    # Pure Red #FF0000 -> ASS format is BGR: &H000000FF
    assert hex_to_ass_color("#FF0000") == "&H000000FF"
    # Pure Blue #0000FF -> ASS format is BGR: &H00FF0000
    assert hex_to_ass_color("#0000FF") == "&H00FF0000"
    # Yellow #FFFF00 -> Blue=00, Green=FF, Red=FF -> &H0000FFFF
    assert hex_to_ass_color("#FFFF00") == "&H0000FFFF"
    # Invalid defaults to white
    assert hex_to_ass_color("invalid") == "&H00FFFFFF"


def test_subtitle_styling_builder():
    builder = FFmpegCommandBuilder()

    # Test subtitle with TikTok Yellow Pop preset, middle position
    config = VideoFilterConfig(
        burn_subtitles=True,
        subtitle_file_path="tests/fixtures/sample.srt",
        subtitle_font="Montserrat",
        subtitle_font_size=26,
        subtitle_color="#FFFF00",
        subtitle_style_preset="yellow_pop",
        subtitle_position="middle",
    )

    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=10.0)
    cmd_str = " ".join(cmd)

    assert "subtitles=" in cmd_str
    assert "FontName=Montserrat" in cmd_str
    assert "FontSize=26" in cmd_str
    assert "Alignment=5" in cmd_str  # Alignment 5 is center-center
    assert "PrimaryColour=&H0000E6FF" in cmd_str  # Yellow in yellow_pop preset
    assert "BorderStyle=1" in cmd_str
    assert "Outline=3" in cmd_str


def test_subtitle_preset_variations():
    builder = FFmpegCommandBuilder()

    # Test Box Preset (Opaque box)
    cfg_box = VideoFilterConfig(
        burn_subtitles=True,
        subtitle_file_path="dummy.srt",
        subtitle_style_preset="box",
        subtitle_position="bottom",
    )
    cmd_box = " ".join(builder.build("in.mp4", "out.mp4", cfg_box, 10.0))
    assert "BorderStyle=3" in cmd_box
    assert "Alignment=2" in cmd_box  # Bottom center

    # Test Outline Preset
    cfg_outline = VideoFilterConfig(
        burn_subtitles=True,
        subtitle_file_path="dummy.srt",
        subtitle_style_preset="outline",
        subtitle_position="top",
    )
    cmd_outline = " ".join(builder.build("in.mp4", "out.mp4", cfg_outline, 10.0))
    assert "BorderStyle=1" in cmd_outline
    assert "Alignment=6" in cmd_outline  # Top center
    assert "Outline=2.2" in cmd_outline


def test_text_overlays_builder():
    builder = FFmpegCommandBuilder()

    overlays = [
        TextOverlay(
            id="t1",
            text="Giris Basligi",
            start_time=0.5,
            end_time=3.5,
            pos_x=50.0,
            pos_y=20.0,
            font_family="Montserrat",
            font_size=32,
            color="#FFFFFF",
            box_enabled=True,
            bg_color="#000000",
            shadow=True,
        ),
        TextOverlay(
            id="t2",
            text="Abone Olmayin: https://example.com",
            start_time=4.0,
            end_time=8.0,
            pos_x=50.0,
            pos_y=85.0,
            font_family="Arial",
            font_size=24,
            color="#FFDD00",
            box_enabled=False,
            shadow=False,
        ),
    ]

    config = VideoFilterConfig(
        text_overlays=overlays,
    )

    cmd = builder.build("input.mp4", "output.mp4", config, source_duration=10.0)
    cmd_str = " ".join(cmd)

    assert "drawtext=" in cmd_str
    # t1 checks
    assert "text='Giris Basligi'" in cmd_str
    assert "between(t,0.500,3.500)" in cmd_str
    assert "box=1:boxcolor=#000000" in cmd_str
    assert "shadowcolor=black@0.6:shadowx=2:shadowy=2" in cmd_str
    assert "fontsize=32" in cmd_str
    # t2 checks (escaped colon in text)
    assert r"text='Abone Olmayin\: https\://example.com'" in cmd_str
    assert "between(t,4.000,8.000)" in cmd_str
    assert "fontcolor=#FFDD00" in cmd_str


def test_html_ui_elements():
    html_path = Path("app/static/index.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")

    # Check player preview text overlay container
    assert 'id="player-text-overlays-container"' in content

    # Check Inspector tab buttons
    assert 'id="tab-nav-subtitle"' in content
    assert 'id="tab-nav-text"' in content

    # Check Subtitle Typography controls
    assert 'id="subtitle-presets-grid"' in content
    assert 'id="subtitle-font-family"' in content
    assert 'id="subtitle-font-size"' in content
    assert 'id="subtitle-color-picker"' in content
    assert 'id="subtitle-position-group"' in content

    # Check Custom Text Overlay panel controls
    assert 'id="tab-panel-text"' in content
    assert 'id="btn-add-text-overlay"' in content
    assert 'id="text-overlays-list"' in content

    # Check Text Track toolbar button
    assert 'id="btn-add-text-track"' in content


def test_text_timeline_track_integration():
    # Verify CSS styling for text timeline clip cards
    css_path = Path("app/static/style.css")
    assert css_path.exists()
    css = css_path.read_text(encoding="utf-8")
    assert ".timeline-text-clip-card" in css
    assert "html.light .timeline-text-clip-card" in css

    # Verify JS timeline functions
    js_path = Path("app/static/app.js")
    assert js_path.exists()
    js = js_path.read_text(encoding="utf-8")
    assert "getTextTrack" in js
    assert "syncTextOverlaysToTrack" in js
    assert "updateTextOverlayInputsFromState" in js
    assert "btnAddTextTrack" in js
    assert "timeline-text-clip-card" in js

