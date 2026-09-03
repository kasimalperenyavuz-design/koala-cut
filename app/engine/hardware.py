"""Hardware acceleration detection and configuration for koala-cut.

Detects available GPU encoders (NVIDIA NVENC, Intel QSV, AMD AMF)
and provides optimal hardware encoding parameters.
"""

from __future__ import annotations

import functools
import logging
import os
import shutil
import subprocess
from typing import Any, Optional

from app.engine.binaries import get_ffmpeg_path

logger = logging.getLogger(__name__)


def _query_windows_gpu_name() -> Optional[str]:
    """Query Windows Video Controller name using PowerShell or CIM."""
    try:
        cmd = [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$names = (Get-CimInstance Win32_VideoController).Name; if ($names -is [array]) { $names[0] } else { $names }",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=4, check=False)
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception as e:
        logger.debug(f"Failed to query GPU name via PowerShell: {e}")
    return None


def _test_encoder(ffmpeg_bin: str, encoder_name: str) -> bool:
    """Run a micro-test to verify if encoder can actually initialize hardware."""
    try:
        cmd = [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "nullsrc=s=256x256:d=0.05",
            "-c:v",
            encoder_name,
            "-f",
            "null",
            "-",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=4, check=False)
        return res.returncode == 0
    except Exception as e:
        logger.debug(f"Encoder test failed for {encoder_name}: {e}")
        return False


@functools.lru_cache(maxsize=1)
def detect_gpu_capabilities() -> dict[str, Any]:
    """Detect available GPU hardware encoders and return optimal capabilities."""
    ffmpeg_bin = get_ffmpeg_path()

    gpu_name = _query_windows_gpu_name() or "Bilinmeyen Grafik Kartı"
    available_encoders: list[str] = ["libx264", "libx265"]

    hardware_type = "none"
    recommended_h264 = "libx264"
    recommended_hevc = "libx265"
    is_hwaccel = False

    # Check NVIDIA NVENC
    if _test_encoder(ffmpeg_bin, "h264_nvenc"):
        available_encoders.insert(0, "h264_nvenc")
        recommended_h264 = "h264_nvenc"
        hardware_type = "nvidia"
        is_hwaccel = True
        if _test_encoder(ffmpeg_bin, "hevc_nvenc"):
            available_encoders.insert(1, "hevc_nvenc")
            recommended_hevc = "hevc_nvenc"

    # Check Intel QSV if not nvidia
    elif _test_encoder(ffmpeg_bin, "h264_qsv"):
        available_encoders.insert(0, "h264_qsv")
        recommended_h264 = "h264_qsv"
        hardware_type = "intel"
        is_hwaccel = True
        if _test_encoder(ffmpeg_bin, "hevc_qsv"):
            available_encoders.insert(1, "hevc_qsv")
            recommended_hevc = "hevc_qsv"

    # Check AMD AMF if not nvidia or intel
    elif _test_encoder(ffmpeg_bin, "h264_amf"):
        available_encoders.insert(0, "h264_amf")
        recommended_h264 = "h264_amf"
        hardware_type = "amd"
        is_hwaccel = True
        if _test_encoder(ffmpeg_bin, "hevc_amf"):
            available_encoders.insert(1, "hevc_amf")
            recommended_hevc = "hevc_amf"

    if is_hwaccel:
        if hardware_type == "nvidia":
            description = f"{gpu_name} (NVIDIA NVENC Aktif - 5-10x Hızlı)"
        elif hardware_type == "intel":
            description = f"{gpu_name} (Intel QuickSync Aktif)"
        else:
            description = f"{gpu_name} (AMD AMF Aktif)"
    else:
        description = "İşlemci (CPU x264/x265 - Yazılımsal Kodlama)"

    return {
        "gpu_name": gpu_name,
        "hardware_type": hardware_type,
        "is_hardware_accelerated": is_hwaccel,
        "recommended_h264": recommended_h264,
        "recommended_hevc": recommended_hevc,
        "available_encoders": available_encoders,
        "description": description,
    }
