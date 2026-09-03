"""Automated build script for Keen Video Studio Setup Installer."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"
INSTALLER_DIR = ROOT_DIR / "installer"
ASSETS_DIR = ROOT_DIR / "assets"

def find_iscc() -> str:
    """Find Inno Setup Compiler executable."""
    # 1. Check PATH
    which_iscc = shutil.which("iscc")
    if which_iscc:
        return which_iscc

    # 2. Check standard installation paths
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        Path(local_app_data) / "Programs" / "Inno Setup 6" / "ISCC.exe",
        Path("C:/Program Files (x86)/Inno Setup 6/ISCC.exe"),
        Path("C:/Program Files/Inno Setup 6/ISCC.exe"),
    ]
    for cand in candidates:
        if cand.is_file():
            return str(cand)

    raise FileNotFoundError(
        "Inno Setup Compiler (ISCC.exe) not found. "
        "Please install Inno Setup 6 via: winget install --id JRSoftware.InnoSetup"
    )

def main() -> int:
    print("=" * 60)
    print("KOALA-CUT - SETUP INSTALLER BUILDER")
    print("=" * 60)

    # 1. Verify app.ico exists
    app_ico = ASSETS_DIR / "app.ico"
    if not app_ico.is_file():
        print("[*] Generating app.ico...")
        subprocess.run([sys.executable, str(ROOT_DIR / "scripts" / "generate_icon.py")], check=True)

    # 2. Verify dist prerequisites
    koala_exe = DIST_DIR / "koala-cut.exe"
    ffmpeg_exe = DIST_DIR / "ffmpeg.exe"
    ffprobe_exe = DIST_DIR / "ffprobe.exe"

    missing = []
    if not koala_exe.is_file():
        missing.append("koala-cut.exe")
    if not ffmpeg_exe.is_file():
        missing.append("ffmpeg.exe")
    if not ffprobe_exe.is_file():
        missing.append("ffprobe.exe")

    if missing:
        print(f"[!] Error: Missing required binaries in dist/: {', '.join(missing)}")
        return 1

    # 3. Locate ISCC.exe
    iscc_path = find_iscc()
    print(f"[*] Found Inno Setup compiler: {iscc_path}")

    # 4. Compile Setup Installer
    iss_file = INSTALLER_DIR / "setup.iss"
    print(f"[*] Compiling installer using: {iss_file}...")
    cmd = [iscc_path, str(iss_file)]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("[!] ISCC Compilation Failed:")
        print(result.stdout)
        print(result.stderr)
        return result.returncode

    setup_exe = DIST_DIR / "koala-cut-setup.exe"
    if setup_exe.is_file():
        size_mb = setup_exe.stat().st_size / (1024 * 1024)
        print("=" * 60)
        print("SUCCESS! Setup installer built successfully:")
        print(f"Path: {setup_exe.resolve()}")
        print(f"Size: {size_mb:.1f} MB (Solid LZMA2 compressed)")
        print("=" * 60)
        return 0
    else:
        print("[!] Setup executable was not generated.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
