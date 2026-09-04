"""
Integration tests for Preview Proxy Quality Selection (N-3).
"""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.services.preview import QUALITY_PROFILES, ensure_preview_file
from app.engine.probe import probe_media


def test_preview_quality_ui_elements():
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        html = response.text

        # Verify selector and options
        assert 'id="select-preview-quality"' in html
        assert 'value="original"' in html
        assert 'value="1080p"' in html
        assert 'value="720p"' in html
        assert 'value="480p"' in html
        assert 'value="360p"' in html
        assert 'id="proxy-loading-indicator"' in html


def test_preview_quality_profiles_config():
    assert "1080p" in QUALITY_PROFILES
    assert "720p" in QUALITY_PROFILES
    assert "480p" in QUALITY_PROFILES
    assert "360p" in QUALITY_PROFILES
    assert QUALITY_PROFILES["360p"]["max_w"] == 640
    assert QUALITY_PROFILES["480p"]["max_w"] == 854
    assert QUALITY_PROFILES["720p"]["max_w"] == 1280
    assert QUALITY_PROFILES["1080p"]["max_w"] == 1920


@pytest.mark.asyncio
async def test_preview_quality_generation_and_streaming():
    with TestClient(app) as client:
        # Load demo video
        demo_resp = client.post("/api/demo")
        assert demo_resp.status_code == 200
        data = demo_resp.json()
        file_id = data["file_id"]

        # Test pre-generation endpoint for 360p
        gen_resp = client.post(f"/api/preview/{file_id}/quality?quality=360p")
        assert gen_resp.status_code == 200
        gen_data = gen_resp.json()
        assert gen_data["quality"] == "360p"
        assert "preview_360p_" in gen_data["preview_id"]

        # Stream 360p proxy
        stream_resp = client.get(f"/api/preview/{file_id}?quality=360p")
        assert stream_resp.status_code in (200, 206)
        assert len(stream_resp.content) > 0

        # Stream original proxy
        orig_stream = client.get(f"/api/preview/{file_id}?quality=original")
        assert orig_stream.status_code in (200, 206)
        assert len(orig_stream.content) > 0


def test_preview_quality_js_logic():
    with TestClient(app) as client:
        response = client.get("/static/app.js")
        assert response.status_code == 200
        js = response.text
        assert "getPreviewStreamUrl" in js
        assert "setPreviewQuality" in js
        assert "initPreviewQualityControls" in js
        assert "koala_preview_quality" in js
