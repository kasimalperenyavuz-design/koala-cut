"""Core FFmpeg and media processing engine.

Provides metadata extraction, flexible command synthesis, and real-time
asynchronous process orchestration with detailed progress metrics.
"""

from app.engine.probe import (
    probe_media,
    probe_media_async,
    ProbeError,
    MediaMetadata,
    VideoMetadata,
    AudioMetadata,
)
from app.engine.builder import (
    CutSegment,
    VideoFilterConfig,
    FFmpegCommandBuilder,
    FitMode,
    EncodingMode,
    VideoCodec,
)
from app.engine.runner import (
    AsyncFFmpegRunner,
    FFmpegResult,
    FFmpegProgress,
    FFmpegExecutionError,
    FFmpegCancelledError,
)

__all__ = [
    "probe_media",
    "probe_media_async",
    "ProbeError",
    "MediaMetadata",
    "VideoMetadata",
    "AudioMetadata",
    "CutSegment",
    "VideoFilterConfig",
    "FFmpegCommandBuilder",
    "FitMode",
    "EncodingMode",
    "VideoCodec",
    "AsyncFFmpegRunner",
    "FFmpegResult",
    "FFmpegProgress",
    "FFmpegExecutionError",
    "FFmpegCancelledError",
]
