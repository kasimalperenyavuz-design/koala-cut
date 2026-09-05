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
import tempfile
from pathlib import Path
from typing import Any, Callable, Optional
import urllib.request
import urllib.error
import zipfile

from app.services.storage import get_storage_dirs

logger = logging.getLogger(__name__)

CURRENT_VERSION = "1.4.0"
DEFAULT_GITHUB_REPO = "kasimalperenyavuz-design/koala-cut"


def get_effective_version() -> str:
    """Return effective application version, taking dynamic patch into account."""
    try:
        local_appdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        patch_ver_file = Path(local_appdata) / "koala-cut" / "app_patch" / "version.json"
        if patch_ver_file.is_file():
            data = json.loads(patch_ver_file.read_text(encoding="utf-8"))
            patch_ver = data.get("version")
            if patch_ver and parse_version(patch_ver) >= parse_version(CURRENT_VERSION):
                return patch_ver
    except Exception:
        pass
    return CURRENT_VERSION


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


def is_installed_via_setup() -> bool:
    """Check if the current app was installed using the Inno Setup installer."""
    if not getattr(sys, "frozen", False):
        return False
    exe_dir = Path(sys.executable).resolve().parent
    return (exe_dir / "unins000.exe").is_file()


class UpdateManager:
    """Manages update discovery, configuration, progress tracking, and self-update execution."""

    def __init__(self) -> None:
        self.current_version = CURRENT_VERSION
        self.config_file = self._resolve_config_path()
        self.repo = self._load_repo()
        self.progress: dict[str, Any] = {
            "status": "idle",  # "idle" | "downloading" | "installing" | "completed" | "error"
            "percent": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "error": None,
        }

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

    def get_progress(self) -> dict[str, Any]:
        """Return the current download and installation progress."""
        return dict(self.progress)

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
        self.current_version = get_effective_version()
        has_update = is_newer_version(latest_tag, self.current_version)

        patch_asset = None
        setup_asset = None
        portable_asset = None
        for asset in release_data.get("assets", []):
            name = asset.get("name", "").lower()
            if "patch" in name and name.endswith(".zip"):
                patch_asset = asset
            elif "setup" in name and name.endswith(".exe"):
                setup_asset = asset
            elif name == "koala-cut.exe":
                portable_asset = asset

        prefer_setup = is_installed_via_setup()

        # Priority 1: Ultra-fast delta patch (~350 KB) - instant download without redownloading 470 MB binaries
        # Priority 2: Inno Setup installer if previously installed via setup
        # Priority 3: Portable standalone binary
        if patch_asset:
            chosen = patch_asset
            update_type = "patch"
        elif prefer_setup and setup_asset:
            chosen = setup_asset
            update_type = "setup"
        else:
            chosen = portable_asset or setup_asset
            update_type = "binary"

        download_url = chosen.get("browser_download_url") if chosen else None
        asset_name = chosen.get("name") if chosen else None
        asset_size = chosen.get("size", 0) if chosen else 0

        return {
            "update_available": has_update,
            "current_version": self.current_version,
            "latest_version": latest_tag,
            "release_name": release_data.get("name", f"Sürüm {latest_tag}"),
            "changelog": release_data.get("body", "Yeni özellikler ve hata düzeltmeleri."),
            "download_url": download_url,
            "asset_name": asset_name,
            "asset_size": asset_size,
            "update_type": update_type,
            "is_setup": update_type == "setup",
            "published_at": release_data.get("published_at"),
            "repo": self.repo,
        }

    async def download_and_install_update(
        self,
        download_url: str,
        progress_callback: Optional[Callable[[int], None]] = None,
    ) -> bool:
        """Download update package and execute safe restart."""
        self.progress = {
            "status": "downloading",
            "percent": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "error": None,
        }

        if not getattr(sys, "frozen", False):
            # Running from source (development mode), simulate download & success
            logger.info("Running from source, update simulation completed.")
            for p in [25, 50, 75, 100]:
                await asyncio.sleep(0.3)
                self.progress["percent"] = p
                if progress_callback:
                    progress_callback(p)
            self.progress["status"] = "completed"
            return True

        current_exe = Path(sys.executable).resolve()
        exe_dir = current_exe.parent
        is_patch = "patch" in download_url.lower() and download_url.lower().endswith(".zip")
        is_setup = "setup" in download_url.lower() and download_url.lower().endswith(".exe")

        if is_patch:
            target_path = Path(tempfile.gettempdir()) / "koala-cut-patch.zip"
        elif is_setup:
            target_path = Path(tempfile.gettempdir()) / "koala-cut-setup.exe"
        else:
            target_path = exe_dir / "koala-cut.new.exe"

        def _download():
            try:
                req = urllib.request.Request(
                    download_url,
                    headers={"User-Agent": f"koala-cut-updater/{self.current_version}"},
                )
                with urllib.request.urlopen(req, timeout=120) as response, open(target_path, "wb") as out_file:
                    total_size = int(response.headers.get("content-length", 0))
                    self.progress["total_bytes"] = total_size
                    downloaded = 0
                    chunk_size = 256 * 1024  # 256 KB chunks

                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        out_file.write(chunk)
                        downloaded += len(chunk)
                        self.progress["downloaded_bytes"] = downloaded

                        if total_size > 0:
                            pct = min(int((downloaded / total_size) * 100), 100)
                            self.progress["percent"] = pct
                            if progress_callback:
                                progress_callback(pct)
            except Exception as e:
                self.progress["status"] = "error"
                self.progress["error"] = str(e)
                raise

        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, _download)
        except Exception as err:
            logger.error(f"Download failed: {err}")
            return False

        self.progress["status"] = "installing"
        self.progress["percent"] = 100

        # Execute installer or patch extractor
        if is_patch:
            # 1. Unpack patch to %LOCALAPPDATA%\koala-cut\app_patch
            local_appdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
            patch_dir = Path(local_appdata) / "koala-cut" / "app_patch"
            patch_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(target_path, "r") as zf:
                zf.extractall(patch_dir)
            logger.info("Extracted delta patch to %s", patch_dir)

            # 2. Launch restart supervisor batch
            script_path = Path(tempfile.gettempdir()) / "koala_patch_restart.bat"
            bat_content = f"""@echo off
timeout /t 1 /nobreak >nul
start "" "{current_exe}"
del "%~f0"
"""
            script_path.write_text(bat_content, encoding="utf-8")
            subprocess.Popen(
                ["cmd.exe", "/c", str(script_path)],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
                close_fds=True,
            )
        elif is_setup:
            # Launch Inno Setup and supervisor to ensure koala-cut.exe relaunches
            script_path = Path(tempfile.gettempdir()) / "koala_setup_supervisor.bat"
            bat_content = f"""@echo off
start /wait "" "{target_path}" /SILENT /SP-
timeout /t 2 /nobreak >nul
tasklist | findstr /i "koala-cut.exe" >nul
if errorlevel 1 (
    start "" "{current_exe}"
)
del "%~f0"
"""
            script_path.write_text(bat_content, encoding="utf-8")
            subprocess.Popen(
                ["cmd.exe", "/c", str(script_path)],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
                close_fds=True,
            )
        else:
            # Generate a Windows batch helper with retry logic to swap portable binaries safely
            script_path = exe_dir / "update_and_restart.bat"
            bat_content = f"""@echo off
setlocal enabledelayedexpansion
set RETRY=0
:loop
timeout /t 1 /nobreak >nul
del "{current_exe}" 2>nul
if exist "{current_exe}" (
    set /a RETRY+=1
    if !RETRY! leq 15 goto loop
)
move /y "{target_path}" "{current_exe}"
start "" "{current_exe}"
del "%~f0"
"""
            script_path.write_text(bat_content, encoding="utf-8")
            subprocess.Popen(
                ["cmd.exe", "/c", str(script_path)],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
                close_fds=True,
            )

        self.progress["status"] = "completed"
        asyncio.create_task(self._delayed_exit())
        return True

    async def _delayed_exit(self) -> None:
        await asyncio.sleep(1.5)
        os._exit(0)


# Global singleton instance
updater_service = UpdateManager()
