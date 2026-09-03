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


def open_browser(url: str, delay: float = 0.8) -> None:
    """Open default web browser after a short delay."""
    def _open():
        logger.info("Opening browser at %s", url)
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
    parser.add_argument("--no-browser", action="store_true", default=False, help="Do not open browser")
    args = parser.parse_args()

    try:
        ensure_directories()

        # Find available port if default 8000 is occupied
        actual_port = find_available_port(args.port)
        target_url = f"http://{args.host}:{actual_port}"
        logger.info("Starting koala-cut Studio on %s", target_url)

        if not args.no_browser:
            open_browser(target_url, delay=0.8)

        # In frozen mode, reload must be False and app is passed as an object
        reload_mode = False if getattr(sys, "frozen", False) else args.reload
        uvicorn.run(
            app,
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
