"""
Integration tests for Project Save & Load (.koalaproject) (N-4).
"""
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app


def test_project_ui_elements():
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        html = response.text

        # Verify buttons and file input exist
        assert 'id="btn-save-project"' in html
        assert 'id="btn-load-project"' in html
        assert 'id="btn-home-load-project"' in html
        assert 'id="project-file-input"' in html
        assert 'accept=".koalaproject,.json"' in html


def test_project_js_functions():
    with TestClient(app) as client:
        response = client.get("/static/app.js")
        assert response.status_code == 200
        js = response.text

        assert "exportProject" in js
        assert "importProjectFile" in js
        assert "loadProjectIntoStudio" in js
        assert "syncExportUIFromState" in js
        assert ".koalaproject" in js


def test_project_schema_serialization():
    # Construct a sample .koalaproject JSON payload
    sample_project = {
        "format_version": "1.0",
        "app": "koala-cut",
        "created_at": "2026-09-04T18:00:00.000Z",
        "project_name": "test_edit",
        "source_media": {
            "file_id": "test_file_123",
            "filename": "test.mp4",
            "metadata": {"duration": 15.0, "size_bytes": 5000000},
            "duration": 15.0,
            "size_bytes": 5000000,
        },
        "timeline": {
            "tracks": [
                {
                    "id": "v1",
                    "type": "video",
                    "name": "V1",
                    "visible": True,
                    "locked": False,
                    "clips": [
                        {
                            "id": "clip-1",
                            "timeline_start": 0.0,
                            "duration": 7.5,
                            "in_point": 0.0,
                            "out_point": 7.5,
                            "speed": 1.0,
                            "volume": 1.0,
                            "scale": 1.0,
                            "pos_x": 0,
                            "pos_y": 0,
                            "rotation": 0,
                            "opacity": 1.0,
                        }
                    ],
                }
            ],
            "playhead_time": 3.2,
            "duration": 7.5,
        },
        "export_settings": {
            "aspect_ratio": "9:16",
            "fit_mode": "pad",
            "resolution": "1080p",
            "fps": "30",
            "compression_mode": "target_size",
            "target_size_mb": 15.0,
            "crf": 23,
            "codec": "libx264",
            "preset": "fast",
            "remove_audio": False,
            "audio_bitrate": 128,
        },
        "subtitles": {
            "segments": [
                {"id": 1, "start": 0.5, "end": 2.5, "text": "Merhaba dünya!"}
            ]
        },
    }

    raw_json = json.dumps(sample_project)
    parsed = json.loads(raw_json)

    assert parsed["app"] == "koala-cut"
    assert parsed["format_version"] == "1.0"
    assert len(parsed["timeline"]["tracks"]) == 1
    assert parsed["timeline"]["tracks"][0]["clips"][0]["id"] == "clip-1"
    assert parsed["export_settings"]["aspect_ratio"] == "9:16"
    assert parsed["subtitles"]["segments"][0]["text"] == "Merhaba dünya!"
