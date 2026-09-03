"""Tests for GitHub Releases auto-update functionality."""

import json
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.updater import is_newer_version, parse_version, updater_service


@pytest.fixture
def client():
    """Create a FastAPI TestClient."""
    with TestClient(app) as test_client:
        yield test_client


def test_version_parsing_and_comparison():
    """Verify semantic version parsing and comparison logic."""
    assert parse_version("1.0.0") == (1, 0, 0)
    assert parse_version("v1.2.3") == (1, 2, 3)
    assert parse_version("2.1") == (2, 1)

    assert is_newer_version("1.1.0", "1.0.0") is True
    assert is_newer_version("1.0.1", "1.0.0") is True
    assert is_newer_version("2.0.0", "1.9.9") is True
    assert is_newer_version("1.0.0", "1.0.0") is False
    assert is_newer_version("0.9.9", "1.0.0") is False


def test_update_status_endpoint(client):
    """Verify update status endpoint returns version and repo."""
    res = client.get("/api/updates/status")
    assert res.status_code == 200
    data = res.json()
    assert "current_version" in data
    assert "repo" in data
    assert data["current_version"] == "1.2.0"


def test_update_config_endpoint(client):
    """Verify updating the GitHub repository configuration."""
    res = client.post("/api/updates/config", json={"repo": "myuser/custom-koala"})
    assert res.status_code == 200
    assert res.json()["repo"] == "myuser/custom-koala"

    # Test invalid format
    res_bad = client.post("/api/updates/config", json={"repo": "invalidrepo"})
    assert res_bad.status_code == 400


@pytest.mark.asyncio
async def test_check_updates_with_mock_api(client):
    """Verify check_for_updates parses a newer release payload correctly."""
    mock_release = {
        "tag_name": "v2.0.0",
        "name": "koala-cut v2.0.0 - Büyük Güncelleme",
        "body": "- Daha hızlı video kesme\n- Yeni sıkıştırma filtreleri",
        "published_at": "2026-09-04T00:00:00Z",
        "assets": [
            {
                "name": "koala-cut.exe",
                "browser_download_url": "https://github.com/myuser/koala/releases/download/v2.0.0/koala-cut.exe",
                "size": 43500000,
            }
        ],
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(mock_release).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = client.get("/api/updates/check")
        assert res.status_code == 200
        data = res.json()
        assert data["update_available"] is True
        assert data["latest_version"] == "2.0.0"
        assert "koala-cut.exe" in data["download_url"]
        assert data["asset_size"] == 43500000


def test_install_update_validation(client):
    """Verify install endpoint handles empty payload."""
    res = client.post("/api/updates/install", json={"download_url": ""})
    assert res.status_code == 400
