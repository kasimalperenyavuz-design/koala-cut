from __future__ import annotations

import argparse
import ctypes
import logging
import multiprocessing
import os
import socket
import sys
import threading
import traceback
import webbrowser
from pathlib import Path

# ---------------------------------------------------------------------------
# Dynamic Delta Patch Loader (Loads ~350 KB patches from %LOCALAPPDATA%)
# ---------------------------------------------------------------------------
def _apply_patch_path() -> None:
    try:
        local_appdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        patch_dir = Path(local_appdata) / "koala-cut" / "app_patch"
        if (patch_dir / "app").is_dir():
            patch_dir_str = str(patch_dir.resolve())
            if patch_dir_str not in sys.path:
                sys.path.insert(0, patch_dir_str)
    except Exception:
        pass

_apply_patch_path()

import uvicorn
from app.main import app
from app.services.storage import OUTPUT_DIR, UPLOAD_DIR

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("koala-cut")


def find_available_port(preferred_port: int = 8000, max_attempts: int = 20) -> int:
    """Find a free TCP port starting from preferred_port."""
    for port in range(preferred_port, preferred_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    return preferred_port


def ensure_directories() -> None:
    """Ensure uploads/ and outputs/ storage directories exist."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Storage directories ready at: %s and %s", UPLOAD_DIR, OUTPUT_DIR)


def open_desktop_window(url: str, delay: float = 0.8) -> None:
    """Launch as a standalone native desktop application window (no browser tabs or URL bar)."""
    def _open():
        import subprocess

        # Priority candidates for App Mode (dedicated desktop window)
        candidates = [
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        ]

        local_appdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        user_profile_dir = Path(local_appdata) / "koala-cut" / "desktop_profile"
        user_profile_dir.mkdir(parents=True, exist_ok=True)

        for browser_exe in candidates:
            if os.path.isfile(browser_exe):
                try:
                    logger.info("Launching native desktop app window via %s", browser_exe)
                    subprocess.Popen([
                        browser_exe,
                        f"--app={url}",
                        "--window-size=1420,900",
                        "--window-position=center",
                        f"--user-data-dir={user_profile_dir}",
                        "--app-id=koala-cut",
                    ])
                    return
                except Exception as exc:
                    logger.warning("Could not launch desktop app mode via %s: %s", browser_exe, exc)

        # Fallback to standard web browser if neither Edge nor Chrome is found
        logger.info("Falling back to default web browser at %s", url)
        webbrowser.open(url)

    timer = threading.Timer(delay, _open)
    timer.daemon = True
    timer.start()


def show_fatal_error(msg: str, tb: str) -> None:
    """Log fatal error to disk and display native Windows message box."""
    logger.critical("Fatal application error:\n%s\n%s", msg, tb)
    
    # Write to crash log
    try:
        local_appdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        crash_log_dir = Path(local_appdata) / "koala-cut"
        crash_log_dir.mkdir(parents=True, exist_ok=True)
        crash_file = crash_log_dir / "crash.log"
        crash_file.write_text(f"{msg}\n\n{tb}", encoding="utf-8")
    except Exception:
        pass

    if sys.platform == "win32":
        try:
            ctypes.windll.user32.MessageBoxW(
                0,
                f"koala-cut başlatılırken bir hata oluştu:\n\n{msg}\n\nDetaylar kaydedildi.",
                "koala-cut Hata",
                0x10,  # MB_ICONERROR
            )
        except Exception:
            pass


def main() -> None:
    """Parse CLI arguments and run the Uvicorn server."""
    if sys.platform == "win32":
        try:
            ctypes.windll.kernel32.SetConsoleTitleW("koala-cut - Video Studio")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Run koala-cut server.")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
    parser.add_argument("--reload", action="store_true", default=False, help="Enable auto-reload")
    parser.add_argument("--browser", action="store_true", default=False, help="Open in regular browser instead of desktop window")
    parser.add_argument("--no-browser", action="store_true", default=False, help="Do not open any window")
    args = parser.parse_args()

    try:
        ensure_directories()

        # Find available port if default 8000 is occupied
        actual_port = find_available_port(args.port)
        target_url = f"http://{args.host}:{actual_port}"
        logger.info("Starting koala-cut Studio on %s", target_url)

        if not args.no_browser:
            if args.browser:
                logger.info("Opening browser at %s", target_url)
                threading.Timer(0.8, lambda: webbrowser.open(target_url)).start()
            else:
                open_desktop_window(target_url, delay=0.8)

        # In frozen mode, reload must be False and app is passed as an object
        reload_mode = False if getattr(sys, "frozen", False) else args.reload
        app_target = "app.main:app" if (reload_mode and not getattr(sys, "frozen", False)) else app
        uvicorn.run(
            app_target,
            host=args.host,
            port=actual_port,
            reload=reload_mode,
            log_level="info",
        )
    except Exception as exc:
        tb = traceback.format_exc()
        show_fatal_error(str(exc), tb)
        if sys.stdout and not getattr(sys, "frozen", False):
            input("\nPress Enter to exit...")
        sys.exit(1)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
