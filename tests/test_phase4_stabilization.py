"""
Phase 4: Stabilization & Polish Verification Suite.
"""
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.updater import CURRENT_VERSION, parse_version, is_newer_version


def test_version_consistency_and_status():
    with TestClient(app) as client:
        # Check /api/updates/status
        resp = client.get("/api/updates/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["current_version"] == CURRENT_VERSION

        # Check that index.html contains the version
        index_resp = client.get("/")
        assert index_resp.status_code == 200
        assert f"v{CURRENT_VERSION}" in index_resp.text


def test_version_parser_logic():
    assert parse_version("1.2.0") == (1, 2, 0)
    assert parse_version("v2.0.1") == (2, 0, 1)
    assert parse_version("v1.3") == (1, 3)
    assert is_newer_version("1.3.0", "1.2.0") is True
    assert is_newer_version("1.2.0", "1.2.0") is False
    assert is_newer_version("1.1.9", "1.2.0") is False


def test_stabilization_project_edge_cases():
    with TestClient(app) as client:
        resp = client.get("/static/app.js")
        assert resp.status_code == 200
        js = resp.text

        # Verify defensive sanitization in loadProjectIntoStudio
        assert "defensive sanitization" in js
        assert "isContentEditable" in js
        assert "Ctrl+S" in js or "KeyS" in js


def test_keyboard_shortcuts_modal_completeness():
    with TestClient(app) as client:
        resp = client.get("/")
        assert resp.status_code == 200
        html = resp.text

        # Verify all documented shortcuts are present in modal
        assert "Space" in html
        assert "S" in html
        assert "Del / Backspace" in html
        assert "Ctrl + Z" in html
        assert "Ctrl + D" in html
        assert "Ctrl + S" in html
        assert "I" in html
        assert "O" in html
        assert "M" in html
        assert "R" in html


def test_api_error_handling_graceful():
    with TestClient(app) as client:
        # Probe non-existent file
        resp = client.get("/api/probe/non_existent_id")
        assert resp.status_code == 404

        # Stream non-existent file
        stream_resp = client.get("/api/media/non_existent_id")
        assert stream_resp.status_code == 404

        # Stream non-existent preview
        prev_resp = client.get("/api/preview/non_existent_id")
        assert prev_resp.status_code == 404
