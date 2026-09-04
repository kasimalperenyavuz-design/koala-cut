"""
Integration tests for Dark / Light Theme Toggle feature (N-2).
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app


def test_theme_toggle_elements_in_html():
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        html = response.text

        # Verify button and icons exist
        assert 'id="btn-theme-toggle"' in html
        assert 'id="theme-icon-sun"' in html
        assert 'id="theme-icon-moon"' in html

        # Verify instant theme bootstrapper script in head
        assert "localStorage.getItem('koala_theme')" in html
        assert "data-theme" in html


def test_theme_styles_in_css():
    with TestClient(app) as client:
        response = client.get("/static/style.css")
        assert response.status_code == 200
        css = response.text

        # Verify light theme selector and variables exist
        assert '[data-theme="light"]' in css or 'html.light' in css
        assert "--bg-base: #f1f3f7" in css
        assert "--bg-surface: #ffffff" in css

        # Verify timeline and text overrides
        assert "html.light .track-lane-row" in css
        assert "html.light .timeline-clip-card" in css
        assert "html.light #timeline-context-menu" in css


def test_theme_controller_in_js():
    with TestClient(app) as client:
        response = client.get("/static/app.js")
        assert response.status_code == 200
        js = response.text

        # Verify theme functions
        assert "applyTheme" in js
        assert "toggleTheme" in js
        assert "initThemeController" in js
        assert "btnThemeToggle" in js
        assert "koala_theme" in js
