# -*- mode: python ; coding: utf-8 -*-
import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

hidden_imports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespans",
    "uvicorn.lifespans.on",
    "uvicorn.lifespans.off",
    "multipart",
    "python_multipart",
    "pydantic",
    "starlette",
    "fastapi",
    "aiofiles",
]

datas = [
    ("app/static", "app/static"),
    ("app/engine/models", "app/engine/models"),
]

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter", "matplotlib", "torch", "torchvision", "torchaudio",
        "scipy", "scikit-learn", "numpy", "transformers", "spacy",
        "PIL", "cv2", "librosa", "timm", "faster_whisper", "ctranslate2",
        "tokenizers", "huggingface_hub", "nltk", "numba", "tensorboard",
        "tensorflow", "keras"
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="koala-cut",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="assets/app.ico",
    version="version_info.txt",
)
