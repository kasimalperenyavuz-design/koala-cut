"""Tests for Live Audio Preview FX, Web Audio API DSP pipeline, and CORS streaming."""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.storage import create_range_streaming_response


@pytest.fixture
def client():
    return TestClient(app)


def test_cors_headers_in_range_streaming(tmp_path):
    """Verify create_range_streaming_response includes CORS headers for Web Audio API."""
    test_file = tmp_path / "sample_test_media.mp4"
    test_file.write_bytes(b"A" * 2048)

    # 1. Test 206 Partial Content
    response_206 = create_range_streaming_response(test_file, range_header="bytes=0-511")
    assert response_206.status_code == 206
    assert response_206.headers.get("access-control-allow-origin") == "*"
    expose_206 = response_206.headers.get("access-control-expose-headers", "")
    assert "Content-Range" in expose_206
    assert "Accept-Ranges" in expose_206

    # 2. Test 200 Full Content
    response_200 = create_range_streaming_response(test_file)
    assert response_200.status_code == 200
    assert response_200.headers.get("access-control-allow-origin") == "*"
    expose_200 = response_200.headers.get("access-control-expose-headers", "")
    assert "Content-Range" in expose_200
    assert "Accept-Ranges" in expose_200


def test_index_html_contains_audio_preview_ui():
    """Verify index.html contains video crossorigin, A/B toggle, VU meter, and FX badges."""
    index_path = Path(__file__).resolve().parent.parent / "app" / "static" / "index.html"
    assert index_path.is_file(), "index.html must exist"
    content = index_path.read_text(encoding="utf-8")

    # Video element crossorigin for Web Audio MediaElementSource
    assert 'crossorigin="anonymous"' in content or "crossorigin='anonymous'" in content

    # A/B Comparison and VU meter elements
    assert 'id="btn-audio-ab-toggle"' in content
    assert 'id="label-audio-ab"' in content
    assert 'id="preview-vu-meter"' in content
    assert 'id="vu-meter-bar"' in content
    assert 'id="badge-audio-fx"' in content

    # Clip Inspector Live DSP controls
    assert 'id="btn-inspector-audio-ab"' in content
    assert 'id="inspector-audio-fx-summary"' in content


def test_app_js_implements_web_audio_dsp():
    """Verify app.js includes the complete Web Audio DSP filtergraph and event bindings."""
    js_path = Path(__file__).resolve().parent.parent / "app" / "static" / "app.js"
    assert js_path.is_file(), "app.js must exist"
    content = js_path.read_text(encoding="utf-8")

    # DSP core functions & state
    assert "audioEngine" in content
    assert "initWebAudioEngine" in content
    assert "updateAudioPreviewFx" in content
    assert "toggleAudioAbBypass" in content
    assert "startVuMeterLoop" in content

    # Web Audio API Nodes
    assert "createMediaElementSource" in content
    assert "createBiquadFilter" in content
    assert "createDynamicsCompressor" in content
    assert "createAnalyser" in content
    assert "highpass" in content
    assert "lowpass" in content
    assert "notch" in content
    assert "peaking" in content

    # DOM Bindings for Live A/B and VU meter
    assert "btnAudioAbToggle" in content
    assert "previewVuMeter" in content
    assert "vuMeterBar" in content
