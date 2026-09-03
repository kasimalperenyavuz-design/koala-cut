"""Automated GitHub Releases updater service for koala-cut.

Checks for newer releases on GitHub, downloads updated binary assets,
and performs safe self-replacement and restart on Windows.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Optional
import urllib.request
import urllib.error

from app.services.storage import get_storage_dirs

logger = logging.getLogger(__name__)

CURRENT_VERSION = "1.0.0"
DEFAULT_GITHUB_REPO = "kasimalperenyavuz-design/koala-cut"


def parse_version(ver_str: str) -> tuple[int, ...]:
    """Parse version string like 'v1.2.3' or '1.0.0' into numeric tuple for comparison."""
    clean = re.sub(r"[^\d.]", "", ver_str.strip())
    parts = []
    for p in clean.split("."):
        if p.isdigit():
            parts.append(int(p))
    return tuple(parts) or (0,)


def is_newer_version(latest_str: str, current_str: str = CURRENT_VERSION) -> bool:
    """Compare two semantic version strings."""
    return parse_version(latest_str) > parse_version(current_str)


class UpdateManager:
    """Manages update discovery, configuration, and self-update execution."""

    def __init__(self) -> None:
        self.current_version = CURRENT_VERSION
        self.config_file = self._resolve_config_path()
        self.repo = self._load_repo()

    def _resolve_config_path(self) -> Path:
        """Resolve path to user updater configuration."""
        upload_dir, _ = get_storage_dirs()
        config_dir = upload_dir.parent
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / "updater_config.json"

    def _load_repo(self) -> str:
        """Load configured GitHub repository (e.g. 'username/koala-cut')."""
        if self.config_file.is_file():
            try:
                data = json.loads(self.config_file.read_text(encoding="utf-8"))
                return data.get("repo", DEFAULT_GITHUB_REPO)
            except Exception:
                pass
        return DEFAULT_GITHUB_REPO

    def save_repo(self, repo_name: str) -> None:
        """Persist user-configured GitHub repository."""
        self.repo = repo_name.strip()
        data = {"repo": self.repo}
        self.config_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    async def check_for_updates(self) -> dict[str, Any]:
        """Query GitHub Releases API for the latest release."""
        api_url = f"https://api.github.com/repos/{self.repo}/releases/latest"
        req = urllib.request.Request(
            api_url,
            headers={
                "User-Agent": f"koala-cut-updater/{self.current_version}",
                "Accept": "application/vnd.github.v3+json",
            },
        )

        def _fetch():
            try:
                with urllib.request.urlopen(req, timeout=8) as res:
                    return json.loads(res.read().decode("utf-8")), None
            except urllib.error.HTTPError as e:
                return None, f"GitHub API Hatası ({e.code}): {e.reason}"
            except urllib.error.URLError as e:
                return None, f"Bağlantı Hatası: {e.reason}"
            except Exception as e:
                return None, str(e)

        loop = asyncio.get_running_loop()
        release_data, err = await loop.run_in_executor(None, _fetch)

        if err:
            return {
                "update_available": False,
                "current_version": self.current_version,
                "error": err,
                "repo": self.repo,
            }

        latest_tag = release_data.get("tag_name", "").lstrip("v")
        has_update = is_newer_version(latest_tag, self.current_version)

        # Find suitable binary asset (koala-cut.exe or koala-cut-setup.exe)
        download_url = None
        asset_name = None
        asset_size = 0

        for asset in release_data.get("assets", []):
            name = asset.get("name", "").lower()
            if name == "koala-cut.exe":
                download_url = asset.get("browser_download_url")
                asset_name = asset.get("name")
                asset_size = asset.get("size", 0)
                break
            elif "setup" in name and name.endswith(".exe"):
                download_url = asset.get("browser_download_url")
                asset_name = asset.get("name")
                asset_size = asset.get("size", 0)

        return {
            "update_available": has_update,
            "current_version": self.current_version,
            "latest_version": latest_tag,
            "release_name": release_data.get("name", f"Sürüm {latest_tag}"),
            "changelog": release_data.get("body", "Yeni özellikler ve hata düzeltmeleri."),
            "download_url": download_url,
            "asset_name": asset_name,
            "asset_size": asset_size,
            "published_at": release_data.get("published_at"),
            "repo": self.repo,
        }

    async def download_and_install_update(
        self,
        download_url: str,
        progress_callback: Optional[Callable[[int], None]] = None,
    ) -> bool:
        """Download new binary and schedule Windows self-replacement restart."""
        if not getattr(sys, "frozen", False):
            # Running from source, simulate success
            logger.info("Running from source, update simulation completed.")
            return True

        current_exe = Path(sys.executable).resolve()
        exe_dir = current_exe.parent
        new_exe = exe_dir / "koala-cut.new.exe"
        script_path = exe_dir / "update_and_restart.bat"

        # 1. Download updated binary
        def _download():
            req = urllib.request.Request(
                download_url,
                headers={"User-Agent": f"koala-cut-updater/{self.current_version}"},
            )
            with urllib.request.urlopen(req, timeout=60) as response, open(new_exe, "wb") as out_file:
                total_size = int(response.headers.get("content-length", 0))
                downloaded = 0
                chunk_size = 128 * 1024
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and progress_callback:
                        pct = int((downloaded / total_size) * 100)
                        progress_callback(pct)

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _download)

        # 2. Generate a Windows batch helper to swap binaries and restart
        bat_content = f"""@echo off
timeout /t 2 /nobreak >nul
del "{current_exe}"
move /y "{new_exe}" "{current_exe}"
start "" "{current_exe}"
del "%~f0"
"""
        script_path.write_text(bat_content, encoding="utf-8")

        # 3. Launch the batch script detached and exit current process
        subprocess.Popen(
            ["cmd.exe", "/c", str(script_path)],
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            close_fds=True,
        )
        
        # Give a moment for response to return before killing app
        asyncio.create_task(self._delayed_exit())
        return True

    async def _delayed_exit(self) -> None:
        await asyncio.sleep(1.0)
        os._exit(0)


# Global singleton instance
updater_service = UpdateManager()
