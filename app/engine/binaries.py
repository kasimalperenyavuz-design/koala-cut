import os
import shutil
import sys
from pathlib import Path

def get_binary_path(name: str) -> str:
    exe_name = f"{name}.exe" if sys.platform == "win32" and not name.endswith(".exe") else name
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        bundled = Path(sys._MEIPASS) / exe_name
        if bundled.is_file():
            return str(bundled)
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        local_bin = exe_dir / exe_name
        if local_bin.is_file():
            return str(local_bin)
    else:
        root_dir = Path(__file__).resolve().parent.parent.parent
        local_bin = root_dir / exe_name
        if local_bin.is_file():
            return str(local_bin)
    found = shutil.which(name)
    if found:
        return found
    if sys.platform == "win32":
        user_profile = os.environ.get("USERPROFILE", "")
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        fallbacks = [
            os.path.join(local_app_data, "Microsoft", "WinGet", "Links", exe_name),
            os.path.join(user_profile, "AppData", "Local", "Microsoft", "WinGet", "Links", exe_name),
            os.path.join(user_profile, "scoop", "shims", exe_name),
            os.path.join("C:\\ProgramData", "chocolatey", "bin", exe_name),
        ]
        for fb in fallbacks:
            if os.path.isfile(fb):
                return fb
    return name

def get_ffmpeg_path() -> str:
    return get_binary_path("ffmpeg")

def get_ffprobe_path() -> str:
    return get_binary_path("ffprobe")
