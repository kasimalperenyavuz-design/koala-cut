# -*- mode: python ; coding: utf-8 -*-
import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_all

block_cipher = None

# Collect faster-whisper and its core AI dependencies
fw_datas, fw_binaries, fw_hidden = collect_all("faster_whisper")
ct_datas, ct_binaries, ct_hidden = collect_all("ctranslate2")
tok_datas, tok_binaries, tok_hidden = collect_all("tokenizers")
hf_datas, hf_binaries, hf_hidden = collect_all("huggingface_hub")
ort_datas, ort_binaries, ort_hidden = collect_all("onnxruntime")

base_hidden_imports = [
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
    "numpy",
]

hidden_imports = list(set(base_hidden_imports + fw_hidden + ct_hidden + tok_hidden + hf_hidden + ort_hidden))

datas = [
    ("app/static", "app/static"),
    ("app/engine/models", "app/engine/models"),
] + fw_datas + ct_datas + tok_datas + hf_datas + ort_datas

binaries = fw_binaries + ct_binaries + tok_binaries + hf_binaries + ort_binaries

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter", "matplotlib", "torch", "torchvision", "torchaudio",
        "scipy", "scikit-learn", "transformers", "spacy",
        "PIL", "cv2", "librosa", "timm", "nltk", "tensorboard",
        "tensorflow", "keras", "jupyter", "IPython", "pandas", "sqlalchemy"
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
