/**
 * Video Processing Studio - Frontend Controller
 * High-performance UI/UX for video transformation and compression.
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Application State
  // ---------------------------------------------------------------------------
  const state = {
    view: 'upload', // 'upload' | 'editor' | 'progress' | 'complete'
    fileId: null,
    filename: 'video.mp4',
    metadata: null, // MediaMetadata from API
    duration: 0, // Video duration in seconds
    originalSize: 0, // In bytes

    // Timeline Trim
    startTime: 0,
    endTime: 0,
    isPlayingTrim: false,
    cutOutSegments: [], // [{ start: float, end: float }]

    // NLE Multi-Clip Timeline
    clips: [], // [{ id: string, start: number, end: number, selected: boolean }]
    selectedClipId: null,
    clipHistory: [], // undo stack
    lastPlayrate: 1.0,

    // Transformation Settings
    aspectRatio: 'original',
    fitMode: 'pad',
    resolution: 'original',
    customWidth: null,
    customHeight: null,
    fps: 'original',
    customFps: null,

    // Compression & Hardware Settings
    compressionMode: 'target_size', // 'target_size' | 'crf'
    targetSizeMb: 8.0,
    crf: 23,
    codec: 'libx264',
    preset: 'medium',
    removeAudio: false,
    audioBitrate: 128,
    gpuCapabilities: null,
    hwaccelMode: 'auto',

    // Active Processing Job
    activeJobId: null,
    activeEventSource: null,
    jobOutputSize: null,
  };

  // ---------------------------------------------------------------------------
  // DOM Elements
  // ---------------------------------------------------------------------------
  const dom = {
    // Views
    viewUpload: document.getElementById('view-upload'),
    viewEditor: document.getElementById('view-editor'),
    viewProgress: document.getElementById('view-progress'),
    viewComplete: document.getElementById('view-complete'),

    // Top Bar
    headerStatusBadge: document.getElementById('header-status-badge'),
    headerFileName: document.getElementById('header-file-name'),
    btnHeaderNew: document.getElementById('btn-header-new'),

    // Upload Elements
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    btnLoadDemo: document.getElementById('btn-load-demo'),
    uploadProgressCard: document.getElementById('upload-progress-card'),
    uploadProgressBar: document.getElementById('upload-progress-bar'),
    uploadPercentage: document.getElementById('upload-percentage'),
    uploadStatusText: document.getElementById('upload-status-text'),

    // Metadata Bar
    metaFilename: document.getElementById('meta-filename'),
    metaCodec: document.getElementById('meta-codec'),
    metaRes: document.getElementById('meta-res'),
    metaFps: document.getElementById('meta-fps'),
    metaDuration: document.getElementById('meta-duration'),
    metaSize: document.getElementById('meta-size'),
    btnChangeVideo: document.getElementById('btn-change-video'),

    // Video Player
    videoPlayer: document.getElementById('video-player'),
    videoCenterBtn: document.getElementById('video-center-btn'),
    centerPlayIcon: document.getElementById('center-play-icon'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    transportPlayIcon: document.getElementById('transport-play-icon'),
    playerCurrentTime: document.getElementById('player-current-time'),
    playerTotalDuration: document.getElementById('player-total-duration'),
    btnPlayerMute: document.getElementById('btn-player-mute'),
    playerVolumeIcon: document.getElementById('player-volume-icon'),
    btnPlayerFs: document.getElementById('btn-player-fs'),
    aspectGuideOverlay: document.getElementById('aspect-guide-overlay'),

    // Timeline & NLE Elements
    trimDurationBadge: document.getElementById('trim-duration-badge'),
    clipsCountBadge: document.getElementById('clips-count-badge'),
    timelineTrack: document.getElementById('timeline-track'),
    timelineActiveRegion: document.getElementById('timeline-active-region'),
    timelinePlayhead: document.getElementById('timeline-playhead'),
    handleStart: document.getElementById('handle-start'),
    handleEnd: document.getElementById('handle-end'),
    inputStartSeconds: document.getElementById('input-start-seconds'),
    inputEndSeconds: document.getElementById('input-end-seconds'),
    btnSetStartPlayhead: document.getElementById('btn-set-start-playhead'),
    btnSetEndPlayhead: document.getElementById('btn-set-end-playhead'),
    btnPreviewTrim: document.getElementById('btn-preview-trim'),
    btnResetTrim: document.getElementById('btn-reset-trim'),
    trimSavingsPill: document.getElementById('trim-savings-pill'),
    inputCutStart: document.getElementById('input-cut-start'),
    inputCutEnd: document.getElementById('input-cut-end'),
    btnCutStartPlayhead: document.getElementById('btn-cut-start-playhead'),
    btnCutEndPlayhead: document.getElementById('btn-cut-end-playhead'),
    btnAddCutSegment: document.getElementById('btn-add-cut-segment'),
    cutSegmentsList: document.getElementById('cut-segments-list'),
    cutSegmentsCount: document.getElementById('cut-segments-count'),
    timelineCutMarkers: document.getElementById('timeline-cut-markers'),

    // NLE Clips Track & Action Toolbar
    timelineClipsTrack: document.getElementById('timeline-clips-track'),
    timelineSelectionHint: document.getElementById('timeline-selection-hint'),
    btnSplitClip: document.getElementById('btn-split-clip'),
    btnDeleteClip: document.getElementById('btn-delete-clip'),
    btnUndoTimeline: document.getElementById('btn-undo-timeline'),
    btnResetTimeline: document.getElementById('btn-reset-timeline'),
    btnOpenShortcuts: document.getElementById('btn-open-shortcuts'),

    // Shortcuts Modal
    shortcutsModal: document.getElementById('shortcuts-modal'),
    btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),
    btnDismissShortcuts: document.getElementById('btn-dismiss-shortcuts'),

    // GPU Hardware Acceleration
    gpuStatusBadge: document.getElementById('gpu-status-badge'),
    gpuDescText: document.getElementById('gpu-desc-text'),
    selectHwaccel: document.getElementById('select-hwaccel'),
    summaryGpuChip: document.getElementById('summary-gpu-chip'),

    // Stüdyo Inspector Tabs
    tabNavFormat: document.getElementById('tab-nav-format'),
    tabNavCompress: document.getElementById('tab-nav-compress'),
    tabNavCut: document.getElementById('tab-nav-cut'),
    tabNavAudio: document.getElementById('tab-nav-audio'),
    tabPanelFormat: document.getElementById('tab-panel-format'),
    tabPanelCompress: document.getElementById('tab-panel-compress'),
    tabPanelCut: document.getElementById('tab-panel-cut'),
    tabPanelAudio: document.getElementById('tab-panel-audio'),

    // Aspect & Fit
    aspectRatioSelector: document.getElementById('aspect-ratio-selector'),
    aspectCurrentBadge: document.getElementById('aspect-current-badge'),
    fitModeContainer: document.getElementById('fit-mode-container'),

    // Resolution & FPS
    selectResolution: document.getElementById('select-resolution'),
    selectFps: document.getElementById('select-fps'),
    customResRow: document.getElementById('custom-res-row'),
    customWidth: document.getElementById('custom-width'),
    customHeight: document.getElementById('custom-height'),
    customFpsRow: document.getElementById('custom-fps-row'),
    customFpsInput: document.getElementById('custom-fps-input'),

    // Compression Mode
    tabModeTarget: document.getElementById('tab-mode-target'),
    tabModeCrf: document.getElementById('tab-mode-crf'),
    panelTargetSize: document.getElementById('panel-target-size'),
    panelCrf: document.getElementById('panel-crf'),
    inputTargetMb: document.getElementById('input-target-mb'),
    sliderTargetMb: document.getElementById('slider-target-mb'),
    targetSavingsPercentage: document.getElementById('target-savings-percentage'),
    sliderCrf: document.getElementById('slider-crf'),
    crfValueBadge: document.getElementById('crf-value-badge'),
    selectCodec: document.getElementById('select-codec'),
    selectPreset: document.getElementById('select-preset'),

    // Audio Controls
    checkRemoveAudio: document.getElementById('check-remove-audio'),
    selectAudioBitrate: document.getElementById('select-audio-bitrate'),
    audioBitrateRow: document.getElementById('audio-bitrate-row'),

    // Process CTA
    exportSummaryText: document.getElementById('export-summary-text'),
    btnStartProcess: document.getElementById('btn-start-process'),

    // Progress Screen
    progressJobId: document.getElementById('progress-job-id'),
    progressPercentLarge: document.getElementById('progress-percent-large'),
    jobProgressBar: document.getElementById('job-progress-bar'),
    metricSpeed: document.getElementById('metric-speed'),
    metricFps: document.getElementById('metric-fps'),
    metricCurrentTime: document.getElementById('metric-current-time'),
    metricEta: document.getElementById('metric-eta'),
    progressLogTicker: document.getElementById('progress-log-ticker'),
    btnCancelJob: document.getElementById('btn-cancel-job'),

    // Completion Screen
    completeOriginalSize: document.getElementById('complete-original-size'),
    completeFinalSize: document.getElementById('complete-final-size'),
    completeSavingsBadge: document.getElementById('complete-savings-badge'),
    outputVideoPlayer: document.getElementById('output-video-player'),
    btnSaveAs: document.getElementById('btn-save-as'),
    btnDownloadOutput: document.getElementById('btn-download-output'),
    btnCopyLink: document.getElementById('btn-copy-link'),
    copyLinkText: document.getElementById('copy-link-text'),
    inputDirectSavePath: document.getElementById('input-direct-save-path'),
    btnDirectSaveSubmit: document.getElementById('btn-direct-save-submit'),
    btnReEdit: document.getElementById('btn-re-edit'),
    btnStartFresh: document.getElementById('btn-start-fresh'),

    // Save Location Modal
    saveLocationModal: document.getElementById('save-location-modal'),
    modalBtnSaveAs: document.getElementById('modal-btn-save-as'),
    modalInputSavePath: document.getElementById('modal-input-save-path'),
    modalBtnSavePath: document.getElementById('modal-btn-save-path'),
    modalBtnClose: document.getElementById('modal-btn-close'),

    // Auto-Update Modal and Controls
    btnCheckUpdates: document.getElementById('btn-check-updates'),
    iconUpdateRefresh: document.getElementById('icon-update-refresh'),
    headerVersionText: document.getElementById('header-version-text'),
    updateModal: document.getElementById('update-modal'),
    updateModalTitle: document.getElementById('update-modal-title'),
    updateCurrentVer: document.getElementById('update-current-ver'),
    updateLatestVer: document.getElementById('update-latest-ver'),
    updateChangelog: document.getElementById('update-changelog'),
    updateProgressContainer: document.getElementById('update-progress-container'),
    updateProgressStatus: document.getElementById('update-progress-status'),
    updateProgressPct: document.getElementById('update-progress-pct'),
    updateProgressBar: document.getElementById('update-progress-bar'),
    updateActionButtons: document.getElementById('update-action-buttons'),
    btnStartUpdate: document.getElementById('btn-start-update'),
    btnDismissUpdate: document.getElementById('btn-dismiss-update'),
    updateRepoLabel: document.getElementById('update-repo-label'),
    btnToggleRepoEdit: document.getElementById('btn-toggle-repo-edit'),
    repoEditBox: document.getElementById('repo-edit-box'),
    inputCustomRepo: document.getElementById('input-custom-repo'),
    btnSaveCustomRepo: document.getElementById('btn-save-custom-repo'),

    // Toast
    toastContainer: document.getElementById('toast-container'),
  };

  // ---------------------------------------------------------------------------
  // Helper Utilities
  // ---------------------------------------------------------------------------
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return '00:00.0';
    const s = Math.max(0, seconds);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const tenths = Math.floor((s % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const borderColors = {
      info: 'border-indigo-500/40 text-indigo-300',
      success: 'border-emerald-500/40 text-emerald-300',
      error: 'border-rose-500/40 text-rose-300',
    };
    const icons = {
      info: 'info',
      success: 'check-circle',
      error: 'alert-triangle',
    };

    toast.className = `glass-panel rounded-xl px-4 py-3 border ${borderColors[type] || borderColors.info} shadow-xl flex items-center gap-3 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto`;
    toast.innerHTML = `
      <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
      <span class="flex-1 text-slate-100">${message}</span>
    `;

    dom.toastContainer.appendChild(toast);
    refreshIcons();

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2', 'transition-all', 'duration-300');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // ---------------------------------------------------------------------------
  // View Router
  // ---------------------------------------------------------------------------
  function switchView(targetView) {
    state.view = targetView;

    dom.viewUpload.classList.add('hidden');
    dom.viewEditor.classList.add('hidden');
    dom.viewProgress.classList.add('hidden');
    dom.viewComplete.classList.add('hidden');

    if (targetView === 'upload') {
      dom.viewUpload.classList.remove('hidden');
      dom.headerStatusBadge.classList.add('hidden');
      dom.btnHeaderNew.classList.add('hidden');
      dom.uploadProgressCard.classList.add('hidden');
      dom.uploadProgressBar.style.width = '0%';
      dom.videoPlayer.pause();
      dom.outputVideoPlayer.pause();
    } else if (targetView === 'editor') {
      dom.viewEditor.classList.remove('hidden');
      dom.headerStatusBadge.classList.remove('hidden');
      dom.headerFileName.textContent = state.filename;
      dom.btnHeaderNew.classList.remove('hidden');
      updateExportSummary();
      updateSavingsEstimate();
    } else if (targetView === 'progress') {
      dom.viewProgress.classList.remove('hidden');
      dom.headerStatusBadge.classList.remove('hidden');
      dom.headerFileName.textContent = `İşleniyor: ${state.filename}`;
      dom.btnHeaderNew.classList.add('hidden');
      dom.videoPlayer.pause();
    } else if (targetView === 'complete') {
      dom.viewComplete.classList.remove('hidden');
      dom.headerStatusBadge.classList.remove('hidden');
      dom.headerFileName.textContent = `Hazır: ${state.filename}`;
      dom.btnHeaderNew.classList.remove('hidden');
    }

    refreshIcons();
  }

  // ---------------------------------------------------------------------------
  // Upload and Demo Video Loading
  // ---------------------------------------------------------------------------
  function initUploadHandlers() {
    dom.dropZone.addEventListener('click', () => dom.fileInput.click());

    dom.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadFile(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      dom.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropZone.classList.add('dropzone-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dom.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropZone.classList.remove('dropzone-active');
      });
    });

    dom.dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        uploadFile(e.dataTransfer.files[0]);
      }
    });

    // Load Demo Video Button
    dom.btnLoadDemo.addEventListener('click', async () => {
      dom.btnLoadDemo.disabled = true;
      dom.uploadProgressCard.classList.remove('hidden');
      dom.uploadStatusText.textContent = 'FFmpeg ile örnek demo video oluşturuluyor...';
      dom.uploadProgressBar.style.width = '60%';
      dom.uploadPercentage.textContent = '60%';

      try {
        const res = await fetch('/api/demo', { method: 'POST' });
        if (!res.ok) {
          throw new Error(`Örnek video yüklenemedi (${res.status})`);
        }
        const data = await res.json();
        dom.uploadProgressBar.style.width = '100%';
        dom.uploadPercentage.textContent = '100%';
        dom.uploadStatusText.textContent = 'Demo video hazır!';
        setTimeout(() => loadMediaIntoEditor(data), 350);
      } catch (err) {
        showToast(err.message, 'error');
        dom.uploadProgressCard.classList.add('hidden');
      } finally {
        dom.btnLoadDemo.disabled = false;
      }
    });

    dom.btnHeaderNew.addEventListener('click', () => switchView('upload'));
    dom.btnChangeVideo.addEventListener('click', () => switchView('upload'));
    dom.btnStartFresh.addEventListener('click', () => switchView('upload'));
    dom.btnReEdit.addEventListener('click', () => switchView('editor'));
  }

  function uploadFile(file) {
    const validExtensions = ['.mp4', '.mov', '.mkv', '.avi', '.webm'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
      showToast(`Desteklenmeyen dosya formatı. Lütfen yükleyin: ${validExtensions.join(', ')}`, 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    dom.uploadProgressCard.classList.remove('hidden');
    dom.uploadProgressBar.style.width = '0%';
    dom.uploadPercentage.textContent = '0%';
    dom.uploadStatusText.textContent = `${file.name} yükleniyor...`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 95);
        dom.uploadProgressBar.style.width = `${percent}%`;
        dom.uploadPercentage.textContent = `${percent}%`;
        if (percent >= 95) {
          dom.uploadStatusText.textContent = 'Medya bilgileri ve video akışı taranıyor...';
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        dom.uploadProgressBar.style.width = '100%';
        dom.uploadPercentage.textContent = '100%';
        dom.uploadStatusText.textContent = 'Video başarıyla analiz edildi!';

        try {
          const data = JSON.parse(xhr.responseText);
          setTimeout(() => loadMediaIntoEditor(data), 300);
        } catch (err) {
          showToast('Yükleme yanıtı ayrıştırılamadı.', 'error');
          dom.uploadProgressCard.classList.add('hidden');
        }
      } else {
        let errDetail = 'Video yükleme başarısız';
        try {
          const errRes = JSON.parse(xhr.responseText);
          errDetail = errRes.detail || errDetail;
        } catch (_) {}
        showToast(errDetail, 'error');
        dom.uploadProgressCard.classList.add('hidden');
      }
    };

    xhr.onerror = () => {
      showToast('Video yüklenirken ağ hatası oluştu.', 'error');
      dom.uploadProgressCard.classList.add('hidden');
    };

    xhr.send(formData);
  }

  // ---------------------------------------------------------------------------
  // Editor Initialization with Probed Media
  // ---------------------------------------------------------------------------
  function loadMediaIntoEditor(payload) {
    state.fileId = payload.file_id;
    state.filename = payload.filename || 'video.mp4';
    state.metadata = payload.metadata;
    state.duration = payload.metadata.duration || 0;
    state.originalSize = payload.metadata.size_bytes || 0;

    // Reset trim to full range
    state.startTime = 0;
    state.endTime = state.duration;

    // Display metadata bar
    dom.metaFilename.textContent = state.filename;
    dom.metaFilename.title = state.filename;
    const vMeta = payload.metadata.video;
    if (vMeta) {
      dom.metaCodec.textContent = (vMeta.codec || 'H.264').toUpperCase();
      dom.metaRes.textContent = `${vMeta.width}x${vMeta.height}`;
      dom.metaFps.textContent = `${Math.round(vMeta.fps)} fps`;
    } else {
      dom.metaCodec.textContent = 'N/A';
      dom.metaRes.textContent = 'Unknown';
      dom.metaFps.textContent = 'Unknown';
    }
    dom.metaDuration.textContent = formatTime(state.duration);
    dom.metaSize.textContent = formatBytes(state.originalSize);

    // Setup Video Player Stream with automatic browser-compatible preview
    const streamUrl = payload.preview_url || `/api/preview/${state.fileId}`;
    dom.videoPlayer.src = streamUrl;
    dom.videoPlayer.load();

    // Automatic fallback if browser hardware decoder struggles with format
    dom.videoPlayer.onerror = () => {
      console.warn('Video element reported playback error, falling back to guaranteed H.264 preview proxy...');
      const fallbackUrl = `/api/preview/${state.fileId}`;
      if (!dom.videoPlayer.src.includes(fallbackUrl)) {
        dom.videoPlayer.src = fallbackUrl;
        dom.videoPlayer.load();
      }
    };

    // Default target MB preset based on original size
    const origMb = state.originalSize / (1024 * 1024);
    if (origMb > 10) {
      state.targetSizeMb = Math.min(25, Math.max(2, Math.round(origMb * 0.4 * 10) / 10));
    } else {
      state.targetSizeMb = Math.min(8, Math.max(1, Math.round(origMb * 0.6 * 10) / 10));
    }
    dom.inputTargetMb.value = state.targetSizeMb;
    dom.sliderTargetMb.value = state.targetSizeMb;
    dom.sliderTargetMb.max = Math.max(50, Math.ceil(origMb * 1.2));

    // Reset Trimmer Controls
    dom.inputStartSeconds.value = '0.0';
    dom.inputEndSeconds.value = state.duration.toFixed(1);
    dom.inputStartSeconds.max = state.duration.toString();
    dom.inputEndSeconds.max = state.duration.toString();

    // Reset Cut-Out Segments & Initialize NLE Clips
    state.cutOutSegments = [];
    if (dom.inputCutStart) dom.inputCutStart.value = '0.0';
    if (dom.inputCutEnd) dom.inputCutEnd.value = Math.min(state.duration, 3.0).toFixed(1);
    renderCutSegments();

    clipCounter = 1;
    state.clips = [{
      id: 'clip-1',
      start: 0.0,
      end: Math.round(state.duration * 100) / 100,
      selected: false,
    }];
    state.selectedClipId = null;
    state.clipHistory = [];
    if (dom.btnDeleteClip) {
      dom.btnDeleteClip.classList.add('opacity-50', 'pointer-events-none');
    }
    renderClipsTrack();

    updateTimelineHandles();
    updateTrimBadge();
    switchView('editor');
    showToast(`Video yüklendi: ${state.filename}`, 'success');
  }

  // ---------------------------------------------------------------------------
  // Video Player Transport Controls
  // ---------------------------------------------------------------------------
  function initPlayerControls() {
    // Play / Pause Toggle
    const togglePlay = () => {
      if (dom.videoPlayer.paused) {
        // If current playhead is past end trim, seek to start trim
        if (dom.videoPlayer.currentTime >= state.endTime || dom.videoPlayer.currentTime < state.startTime) {
          dom.videoPlayer.currentTime = state.startTime;
        }
        dom.videoPlayer.play();
      } else {
        dom.videoPlayer.pause();
      }
    };

    dom.videoCenterBtn.addEventListener('click', togglePlay);
    dom.btnPlayPause.addEventListener('click', togglePlay);

    dom.videoPlayer.addEventListener('play', () => {
      dom.videoCenterBtn.classList.add('opacity-0', 'pointer-events-none');
      dom.transportPlayIcon.setAttribute('data-lucide', 'pause');
      refreshIcons();
    });

    dom.videoPlayer.addEventListener('pause', () => {
      dom.videoCenterBtn.classList.remove('opacity-0', 'pointer-events-none');
      dom.transportPlayIcon.setAttribute('data-lucide', 'play');
      state.isPlayingTrim = false;
      refreshIcons();
    });

    // Time Update & Playhead Scrubber
    dom.videoPlayer.addEventListener('timeupdate', () => {
      const cur = dom.videoPlayer.currentTime;
      dom.playerCurrentTime.textContent = formatTime(cur);

      if (state.duration > 0) {
        const percent = (cur / state.duration) * 100;
        dom.timelinePlayhead.style.left = `${Math.min(100, Math.max(0, percent))}%`;
      }

      // Real-time NLE gap skipping across deleted regions
      if (!dom.videoPlayer.paused && state.clips && state.clips.length > 0) {
        const lastClip = state.clips[state.clips.length - 1];
        if (cur >= lastClip.end) {
          dom.videoPlayer.pause();
          state.isPlayingTrim = false;
          return;
        }

        for (let i = 0; i < state.clips.length - 1; i++) {
          const currentClip = state.clips[i];
          const nextClip = state.clips[i + 1];
          if (cur >= currentClip.end && cur < nextClip.start) {
            dom.videoPlayer.currentTime = nextClip.start;
            break;
          }
        }
      }

      // If in trim preview mode and we reached end trim, pause
      if (state.isPlayingTrim && cur >= state.endTime) {
        dom.videoPlayer.pause();
        state.isPlayingTrim = false;
      }
    });

    dom.videoPlayer.addEventListener('loadedmetadata', () => {
      dom.playerTotalDuration.textContent = formatTime(dom.videoPlayer.duration);
    });

    // Mute / Unmute
    dom.btnPlayerMute.addEventListener('click', () => {
      dom.videoPlayer.muted = !dom.videoPlayer.muted;
      dom.playerVolumeIcon.setAttribute(
        'data-lucide',
        dom.videoPlayer.muted ? 'volume-x' : 'volume-2'
      );
      refreshIcons();
    });

    // Fullscreen
    dom.btnPlayerFs.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        dom.videoPlayer.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // ---------------------------------------------------------------------------
  // NLE Multi-Clip Timeline & Ripple Delete
  // ---------------------------------------------------------------------------
  let clipCounter = 1;

  function pushClipHistory() {
    if (!state.clips) return;
    state.clipHistory.push({
      clips: state.clips.map((c) => ({ ...c })),
      selectedClipId: state.selectedClipId,
    });
    if (state.clipHistory.length > 25) {
      state.clipHistory.shift();
    }
  }

  function undoTimeline() {
    if (!state.clipHistory || state.clipHistory.length === 0) {
      showToast('Geri alınacak bir kurgu işlemi bulunmuyor.', 'info');
      return;
    }
    const previous = state.clipHistory.pop();
    state.clips = previous.clips;
    state.selectedClipId = previous.selectedClipId;
    syncClipsToEngine();
    renderClipsTrack();
    showToast('Son kurgu işlemi geri alındı (Undo) ↩️', 'info');
  }

  function splitClipAtPlayhead() {
    if (state.duration <= 0 || !state.clips || state.clips.length === 0) return;
    const cur = dom.videoPlayer.currentTime;

    // Find the clip containing current playhead
    const targetIdx = state.clips.findIndex(
      (c) => cur > c.start + 0.15 && cur < c.end - 0.15
    );

    if (targetIdx === -1) {
      showToast('İmleç bir klibin sınırında veya silinmiş bir aralıkta. Bölme yapılamaz.', 'info');
      return;
    }

    pushClipHistory();
    const targetClip = state.clips[targetIdx];
    const curRounded = Math.round(cur * 100) / 100;

    const clipA = {
      id: targetClip.id,
      start: targetClip.start,
      end: curRounded,
      selected: false,
    };
    const clipB = {
      id: `clip-${++clipCounter}`,
      start: curRounded,
      end: targetClip.end,
      selected: true,
    };

    state.clips.splice(targetIdx, 1, clipA, clipB);
    state.selectedClipId = clipB.id;

    syncClipsToEngine();
    renderClipsTrack();
    showToast(`Klip ${formatTime(curRounded)} noktasından bölündü (Split) ✂️`, 'success');
  }

  function selectClip(clipId) {
    state.selectedClipId = clipId;
    state.clips.forEach((c) => {
      c.selected = c.id === clipId;
    });

    if (dom.btnDeleteClip) {
      if (clipId && state.clips.length > 1) {
        dom.btnDeleteClip.classList.remove('opacity-50', 'pointer-events-none');
      } else {
        dom.btnDeleteClip.classList.add('opacity-50', 'pointer-events-none');
      }
    }

    const sel = state.clips.find((c) => c.id === clipId);
    if (dom.timelineSelectionHint) {
      if (sel) {
        const dur = (sel.end - sel.start).toFixed(1);
        dom.timelineSelectionHint.textContent = `Seçili: Klip (${formatTime(sel.start)} - ${formatTime(sel.end)} • ${dur}s)`;
      } else {
        dom.timelineSelectionHint.textContent = 'Seçili klip: Yok';
      }
    }

    renderClipsTrack();
  }

  function deleteSelectedClip() {
    if (!state.selectedClipId) {
      showToast('Lütfen önce zaman çizgisinden silmek istediğiniz klibe tıklayın.', 'info');
      return;
    }

    if (state.clips.length <= 1) {
      showToast('Videonun tamamını silemezsiniz! Kurguyu sıfırlamak için Sıfırla butonunu kullanın.', 'error');
      return;
    }

    pushClipHistory();
    const delIdx = state.clips.findIndex((c) => c.id === state.selectedClipId);
    if (delIdx !== -1) {
      const removed = state.clips.splice(delIdx, 1)[0];
      state.selectedClipId = null;
      if (dom.btnDeleteClip) {
        dom.btnDeleteClip.classList.add('opacity-50', 'pointer-events-none');
      }
      syncClipsToEngine();
      renderClipsTrack();
      showToast(`Klip silindi (${formatTime(removed.start)} - ${formatTime(removed.end)}). Boşluk otomatik kapatıldı! 🗑️`, 'success');
    }
  }

  function resetTimelineClips() {
    if (state.duration <= 0) return;
    pushClipHistory();
    state.clips = [{
      id: `clip-${++clipCounter}`,
      start: 0.0,
      end: Math.round(state.duration * 100) / 100,
      selected: false,
    }];
    state.selectedClipId = null;
    if (dom.btnDeleteClip) {
      dom.btnDeleteClip.classList.add('opacity-50', 'pointer-events-none');
    }
    syncClipsToEngine();
    renderClipsTrack();
    showToast('Kurgu sıfırlandı, video tek parça yapıldı.', 'info');
  }

  function syncClipsToEngine() {
    if (!state.clips || state.clips.length === 0) return;

    state.clips.sort((a, b) => a.start - b.start);

    // Overall trim bounds
    state.startTime = state.clips[0].start;
    state.endTime = state.clips[state.clips.length - 1].end;

    dom.inputStartSeconds.value = state.startTime.toFixed(1);
    dom.inputEndSeconds.value = state.endTime.toFixed(1);

    // Gaps between consecutive clips become cutOutSegments
    const gaps = [];
    for (let i = 0; i < state.clips.length - 1; i++) {
      const endCurr = state.clips[i].end;
      const startNext = state.clips[i + 1].start;
      if (startNext - endCurr > 0.05) {
        gaps.push({
          start: Math.round(endCurr * 100) / 100,
          end: Math.round(startNext * 100) / 100,
        });
      }
    }
    state.cutOutSegments = gaps;

    if (dom.clipsCountBadge) {
      dom.clipsCountBadge.textContent = `${state.clips.length} Klip`;
    }

    renderCutSegments();
    renderTimelineCutMarkers();
    updateTimelineHandles();
    updateTrimBadge();
    updateExportSummary();
    updateSavingsEstimate();
  }

  function renderClipsTrack() {
    if (!dom.timelineClipsTrack) return;
    dom.timelineClipsTrack.innerHTML = '';

    if (!state.clips || state.clips.length === 0) return;

    let prevEnd = state.clips[0].start;

    state.clips.forEach((clip, idx) => {
      // If there's an omitted gap before this clip
      if (clip.start - prevEnd > 0.05) {
        const gapDur = (clip.start - prevEnd).toFixed(1);
        const gapEl = document.createElement('div');
        gapEl.className = 'timeline-gap-block';
        gapEl.innerHTML = `<span>Silindi (-${gapDur}s)</span>`;
        gapEl.title = `Silinen Aralık: ${formatTime(prevEnd)} - ${formatTime(clip.start)}`;
        dom.timelineClipsTrack.appendChild(gapEl);
      }

      // Clip element
      const clipEl = document.createElement('div');
      const isSelected = clip.id === state.selectedClipId;
      clipEl.className = `timeline-clip-block ${isSelected ? 'selected' : ''}`;
      clipEl.dataset.clipId = clip.id;

      const dur = (clip.end - clip.start).toFixed(1);
      clipEl.innerHTML = `
        <div class="flex items-center gap-1.5 min-w-0 pointer-events-none">
          <i data-lucide="film" class="w-3.5 h-3.5 ${isSelected ? 'text-indigo-300' : 'text-slate-400'} flex-shrink-0"></i>
          <span class="text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-200'} truncate">Klip ${idx + 1}</span>
        </div>
        <div class="flex items-center gap-1 text-[10px] font-mono ${isSelected ? 'text-indigo-200' : 'text-slate-400'} flex-shrink-0 pointer-events-none">
          <span>${dur}s</span>
        </div>
      `;

      clipEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectClip(clip.id);
      });

      clipEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        dom.videoPlayer.currentTime = clip.start;
      });

      dom.timelineClipsTrack.appendChild(clipEl);
      prevEnd = clip.end;
    });

    refreshIcons();
  }

  function initNLEClipsTrack() {
    if (dom.btnSplitClip) {
      dom.btnSplitClip.addEventListener('click', splitClipAtPlayhead);
    }
    if (dom.btnDeleteClip) {
      dom.btnDeleteClip.addEventListener('click', deleteSelectedClip);
    }
    if (dom.btnUndoTimeline) {
      dom.btnUndoTimeline.addEventListener('click', undoTimeline);
    }
    if (dom.btnResetTimeline) {
      dom.btnResetTimeline.addEventListener('click', resetTimelineClips);
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard Shortcuts Manager
  // ---------------------------------------------------------------------------
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        if (dom.shortcutsModal && !dom.shortcutsModal.classList.contains('hidden')) {
          dom.shortcutsModal.classList.add('hidden');
          return;
        }
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (dom.videoPlayer.paused) {
          if (dom.videoPlayer.currentTime >= state.endTime || dom.videoPlayer.currentTime < state.startTime) {
            dom.videoPlayer.currentTime = state.startTime;
          }
          dom.videoPlayer.play();
        } else {
          dom.videoPlayer.pause();
        }
        return;
      }

      // S or C: Split clip at playhead
      if (e.code === 'KeyS' || e.code === 'KeyC') {
        e.preventDefault();
        splitClipAtPlayhead();
        return;
      }

      // Delete or Backspace: Delete selected clip
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (state.selectedClipId) {
          e.preventDefault();
          deleteSelectedClip();
        }
        return;
      }

      // Ctrl+Z: Undo timeline
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        undoTimeline();
        return;
      }

      // ArrowLeft: Step back 1s (or 5s with Shift)
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        dom.videoPlayer.currentTime = Math.max(0, dom.videoPlayer.currentTime - step);
        return;
      }

      // ArrowRight: Step forward 1s (or 5s with Shift)
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        dom.videoPlayer.currentTime = Math.min(state.duration, dom.videoPlayer.currentTime + step);
        return;
      }

      // J: Step back 3s
      if (e.code === 'KeyJ') {
        e.preventDefault();
        dom.videoPlayer.currentTime = Math.max(0, dom.videoPlayer.currentTime - 3);
        return;
      }

      // K: Pause
      if (e.code === 'KeyK') {
        e.preventDefault();
        dom.videoPlayer.pause();
        return;
      }

      // L: Step forward 3s
      if (e.code === 'KeyL') {
        e.preventDefault();
        dom.videoPlayer.currentTime = Math.min(state.duration, dom.videoPlayer.currentTime + 3);
        return;
      }

      // M: Mute toggle
      if (e.code === 'KeyM') {
        e.preventDefault();
        dom.btnPlayerMute.click();
        return;
      }

      // F: Fullscreen
      if (e.code === 'KeyF') {
        e.preventDefault();
        dom.btnPlayerFs.click();
        return;
      }
    });

    if (dom.btnOpenShortcuts) {
      dom.btnOpenShortcuts.addEventListener('click', () => {
        dom.shortcutsModal.classList.remove('hidden');
        refreshIcons();
      });
    }
    if (dom.btnCloseShortcuts) {
      dom.btnCloseShortcuts.addEventListener('click', () => {
        dom.shortcutsModal.classList.add('hidden');
      });
    }
    if (dom.btnDismissShortcuts) {
      dom.btnDismissShortcuts.addEventListener('click', () => {
        dom.shortcutsModal.classList.add('hidden');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // GPU Hardware Acceleration Detection
  // ---------------------------------------------------------------------------
  async function fetchHardwareCapabilities() {
    try {
      const res = await fetch('/api/hardware');
      if (!res.ok) return;
      const data = await res.json();
      state.gpuCapabilities = data;

      if (data.is_hardware_accelerated) {
        if (dom.gpuStatusBadge) {
          dom.gpuStatusBadge.textContent = `${data.recommended_h264.toUpperCase()} Aktif ⚡`;
          dom.gpuStatusBadge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        }
        if (dom.gpuDescText) {
          dom.gpuDescText.textContent = data.description;
        }
        if (dom.summaryGpuChip) {
          dom.summaryGpuChip.innerHTML = `<i data-lucide="zap" class="w-3 h-3 fill-current"></i><span>${data.hardware_type.toUpperCase()} GPU</span>`;
          dom.summaryGpuChip.classList.remove('hidden');
        }
        // Auto-select hardware codec
        state.codec = data.recommended_h264;
      } else {
        if (dom.gpuStatusBadge) {
          dom.gpuStatusBadge.textContent = 'CPU (Yazılımsal)';
          dom.gpuStatusBadge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-slate-800 text-slate-400 border border-slate-700';
        }
        if (dom.summaryGpuChip) {
          dom.summaryGpuChip.innerHTML = `<i data-lucide="cpu" class="w-3 h-3"></i><span>CPU</span>`;
        }
      }

      if (dom.selectHwaccel) {
        dom.selectHwaccel.addEventListener('change', (e) => {
          state.hwaccelMode = e.target.value;
          if (state.hwaccelMode === 'cpu') {
            state.codec = 'libx264';
            if (dom.summaryGpuChip) {
              dom.summaryGpuChip.innerHTML = `<i data-lucide="cpu" class="w-3 h-3"></i><span>CPU</span>`;
            }
          } else {
            state.codec = data.recommended_h264 || 'libx264';
            if (dom.summaryGpuChip && data.is_hardware_accelerated) {
              dom.summaryGpuChip.innerHTML = `<i data-lucide="zap" class="w-3 h-3 fill-current"></i><span>${data.hardware_type.toUpperCase()} GPU</span>`;
            }
          }
          updateExportSummary();
          refreshIcons();
        });
      }
      updateExportSummary();
      refreshIcons();
    } catch (e) {
      console.warn('Hardware capabilities probe error:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Interactive Dual-Handle Timeline Trimmer
  // ---------------------------------------------------------------------------
  function initTimelineTrimmer() {
    let isDragging = null; // 'start' | 'end' | null

    const onPointerDown = (handle) => (e) => {
      e.preventDefault();
      isDragging = handle;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    dom.handleStart.addEventListener('pointerdown', onPointerDown('start'));
    dom.handleEnd.addEventListener('pointerdown', onPointerDown('end'));

    const onPointerMove = (e) => {
      if (!isDragging || state.duration <= 0) return;
      const rect = dom.timelineTrack.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = ratio * state.duration;

      if (isDragging === 'start') {
        state.startTime = Math.max(0, Math.min(targetTime, state.endTime - 0.2));
        dom.inputStartSeconds.value = state.startTime.toFixed(1);
        dom.videoPlayer.currentTime = state.startTime;
      } else if (isDragging === 'end') {
        state.endTime = Math.min(state.duration, Math.max(targetTime, state.startTime + 0.2));
        dom.inputEndSeconds.value = state.endTime.toFixed(1);
        dom.videoPlayer.currentTime = state.endTime;
      }

      updateTimelineHandles();
      updateTrimBadge();
    };

    const onPointerUp = () => {
      isDragging = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    // Clicking anywhere on timeline track seeks video
    dom.timelineTrack.addEventListener('click', (e) => {
      if (e.target.closest('.timeline-handle')) return;
      const rect = dom.timelineTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekTime = ratio * state.duration;
      dom.videoPlayer.currentTime = seekTime;
    });

    // Timecode Inputs Sync
    dom.inputStartSeconds.addEventListener('input', () => {
      let val = parseFloat(dom.inputStartSeconds.value);
      if (isNaN(val)) val = 0;
      state.startTime = Math.max(0, Math.min(val, state.endTime - 0.1));
      updateTimelineHandles();
      updateTrimBadge();
    });

    dom.inputEndSeconds.addEventListener('input', () => {
      let val = parseFloat(dom.inputEndSeconds.value);
      if (isNaN(val)) val = state.duration;
      state.endTime = Math.min(state.duration, Math.max(val, state.startTime + 0.1));
      updateTimelineHandles();
      updateTrimBadge();
    });

    // Set markers at playhead
    dom.btnSetStartPlayhead.addEventListener('click', () => {
      const cur = dom.videoPlayer.currentTime;
      if (cur < state.endTime) {
        state.startTime = Math.max(0, cur);
        dom.inputStartSeconds.value = state.startTime.toFixed(1);
        updateTimelineHandles();
        updateTrimBadge();
        showToast(`Start marker set to ${formatTime(state.startTime)}`, 'info');
      } else {
        showToast('Start marker must be before End marker.', 'error');
      }
    });

    dom.btnSetEndPlayhead.addEventListener('click', () => {
      const cur = dom.videoPlayer.currentTime;
      if (cur > state.startTime) {
        state.endTime = Math.min(state.duration, cur);
        dom.inputEndSeconds.value = state.endTime.toFixed(1);
        updateTimelineHandles();
        updateTrimBadge();
        showToast(`End marker set to ${formatTime(state.endTime)}`, 'info');
      } else {
        showToast('End marker must be after Start marker.', 'error');
      }
    });

    // Play Selection Cut
    dom.btnPreviewTrim.addEventListener('click', () => {
      dom.videoPlayer.currentTime = state.startTime;
      state.isPlayingTrim = true;
      dom.videoPlayer.play();
    });

    // Cut Out Segment Playhead Buttons
    if (dom.btnCutStartPlayhead) {
      dom.btnCutStartPlayhead.addEventListener('click', () => {
        dom.inputCutStart.value = dom.videoPlayer.currentTime.toFixed(1);
      });
    }
    if (dom.btnCutEndPlayhead) {
      dom.btnCutEndPlayhead.addEventListener('click', () => {
        dom.inputCutEnd.value = dom.videoPlayer.currentTime.toFixed(1);
      });
    }

    // Add Cut Out Segment
    if (dom.btnAddCutSegment) {
      dom.btnAddCutSegment.addEventListener('click', () => {
        const start = parseFloat(dom.inputCutStart.value);
        const end = parseFloat(dom.inputCutEnd.value);
        addCutSegment(start, end);
      });
    }

    // Reset Trim to Full Range
    dom.btnResetTrim.addEventListener('click', () => {
      state.startTime = 0;
      state.endTime = state.duration;
      dom.inputStartSeconds.value = '0.0';
      dom.inputEndSeconds.value = state.duration.toFixed(1);
      state.cutOutSegments = [];
      renderCutSegments();
      updateTimelineHandles();
      updateTrimBadge();
      showToast('Kırpma ve çıkarılan bölümler sıfırlandı.', 'info');
    });
  }

  function getNetDuration() {
    const rawTrimDur = Math.max(0, state.endTime - state.startTime);
    if (!state.cutOutSegments || state.cutOutSegments.length === 0) {
      return rawTrimDur;
    }
    let totalCutOut = 0;
    state.cutOutSegments.forEach((seg) => {
      const s = Math.max(state.startTime, seg.start);
      const e = Math.min(state.endTime, seg.end);
      if (s < e) {
        totalCutOut += e - s;
      }
    });
    return Math.max(0, rawTrimDur - totalCutOut);
  }

  function renderCutSegments() {
    if (!dom.cutSegmentsList) return;
    dom.cutSegmentsList.innerHTML = '';
    const count = state.cutOutSegments ? state.cutOutSegments.length : 0;

    if (dom.cutSegmentsCount) {
      if (count > 0) {
        dom.cutSegmentsCount.textContent = `${count} Bölüm Çıkarılacak`;
        dom.cutSegmentsCount.classList.remove('hidden');
      } else {
        dom.cutSegmentsCount.classList.add('hidden');
      }
    }

    if (state.cutOutSegments) {
      state.cutOutSegments.forEach((seg, idx) => {
        const dur = (seg.end - seg.start).toFixed(1);
        const badge = document.createElement('div');
        badge.className =
          'cut-badge flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono';
        badge.innerHTML = `
          <i data-lucide="scissors" class="w-3.5 h-3.5 text-rose-400"></i>
          <span>${formatTime(seg.start)} - ${formatTime(seg.end)}</span>
          <span class="text-[10px] text-rose-400/80">(-${dur}s)</span>
          <button type="button" class="ml-1 text-slate-400 hover:text-white transition-colors" title="Bu aralığı sil">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        `;
        badge.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          removeCutSegment(idx);
        });
        dom.cutSegmentsList.appendChild(badge);
      });
    }

    renderTimelineCutMarkers();
    updateTrimBadge();
    refreshIcons();
  }

  function renderTimelineCutMarkers() {
    if (!dom.timelineCutMarkers || state.duration <= 0) return;
    dom.timelineCutMarkers.innerHTML = '';

    if (state.cutOutSegments) {
      state.cutOutSegments.forEach((seg) => {
        const leftPct = (seg.start / state.duration) * 100;
        const widthPct = ((seg.end - seg.start) / state.duration) * 100;

        const marker = document.createElement('div');
        marker.className = 'timeline-cut-marker';
        marker.style.left = `${Math.max(0, leftPct)}%`;
        marker.style.width = `${Math.min(100 - leftPct, widthPct)}%`;
        marker.title = `Çıkarılacak: ${formatTime(seg.start)} - ${formatTime(seg.end)}`;
        dom.timelineCutMarkers.appendChild(marker);
      });
    }
  }

  function addCutSegment(start, end) {
    if (isNaN(start) || isNaN(end) || start >= end) {
      showToast('Geçersiz aralık: Başlangıç bitişten küçük olmalıdır.', 'error');
      return;
    }
    if (start < 0 || end > state.duration + 0.1) {
      showToast(`Aralık 0 ile ${state.duration.toFixed(1)} sn arasında olmalıdır.`, 'error');
      return;
    }

    state.cutOutSegments.push({
      start: parseFloat(start.toFixed(2)),
      end: parseFloat(end.toFixed(2)),
    });
    state.cutOutSegments.sort((a, b) => a.start - b.start);
    renderCutSegments();
    showToast(`Aralık (${formatTime(start)} - ${formatTime(end)}) çıkarılacaklara eklendi.`, 'success');
  }

  function removeCutSegment(idx) {
    state.cutOutSegments.splice(idx, 1);
    renderCutSegments();
  }

  function updateTimelineHandles() {
    if (state.duration <= 0) return;
    const startPct = (state.startTime / state.duration) * 100;
    const endPct = (state.endTime / state.duration) * 100;

    dom.handleStart.style.left = `${startPct}%`;
    dom.handleEnd.style.left = `${endPct}%`;
    dom.timelineActiveRegion.style.left = `${startPct}%`;
    dom.timelineActiveRegion.style.width = `${Math.max(0, endPct - startPct)}%`;
  }

  function updateTrimBadge() {
    const netDur = getNetDuration();
    dom.trimDurationBadge.textContent = `${formatTime(netDur)} / ${formatTime(state.duration)}`;

    const ratio = state.duration > 0 ? (netDur / state.duration) * 100 : 100;
    if (ratio < 99) {
      const savedPct = Math.round(100 - ratio);
      const cutCount = state.cutOutSegments ? state.cutOutSegments.length : 0;
      const countNote = cutCount > 0 ? ` • ${cutCount} bölüm silindi` : '';
      dom.trimSavingsPill.textContent = `Toplam %${savedPct} kısaltıldı${countNote}`;
      dom.trimSavingsPill.className = 'text-[11px] text-emerald-400 font-mono font-medium';
    } else {
      dom.trimSavingsPill.textContent = 'Videonun tamamı korunuyor';
      dom.trimSavingsPill.className = 'text-[11px] text-slate-400 font-mono';
    }

    updateExportSummary();
    updateSavingsEstimate();
  }

  // ---------------------------------------------------------------------------
  // Stüdyo Inspector Sekmeleri (Tabs)
  // ---------------------------------------------------------------------------
  function initInspectorTabs() {
    const tabs = [
      { nav: dom.tabNavFormat, panel: dom.tabPanelFormat },
      { nav: dom.tabNavCompress, panel: dom.tabPanelCompress },
      { nav: dom.tabNavCut, panel: dom.tabPanelCut },
      { nav: dom.tabNavAudio, panel: dom.tabPanelAudio },
    ];

    tabs.forEach(({ nav, panel }) => {
      if (!nav || !panel) return;
      nav.addEventListener('click', () => {
        tabs.forEach((t) => {
          if (t.nav) t.nav.classList.remove('active');
          if (t.panel) t.panel.classList.add('hidden');
        });
        nav.classList.add('active');
        panel.classList.remove('hidden');
        refreshIcons();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Aspect Ratio & Fit Mode
  // ---------------------------------------------------------------------------
  function initAspectRatioControls() {
    const aspectCards = dom.aspectRatioSelector.querySelectorAll('.aspect-card');
    aspectCards.forEach((card) => {
      card.addEventListener('click', () => {
        aspectCards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        state.aspectRatio = card.dataset.ratio;

        dom.aspectCurrentBadge.textContent =
          state.aspectRatio === 'original' ? 'Orijinal' : state.aspectRatio;

        // Visual Fit Mode Container visibility
        if (state.aspectRatio === 'original') {
          dom.fitModeContainer.classList.add('opacity-40', 'pointer-events-none');
        } else {
          dom.fitModeContainer.classList.remove('opacity-40', 'pointer-events-none');
        }

        updateAspectGuideOverlay();
        updateExportSummary();
      });
    });

    // Fit Mode radio change
    const fitRadios = document.querySelectorAll('input[name="fit_mode"]');
    fitRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        state.fitMode = e.target.value;
        updateExportSummary();
      });
    });
  }

  function updateAspectGuideOverlay() {
    const overlay = dom.aspectGuideOverlay;
    if (state.aspectRatio === 'original') {
      overlay.style.boxShadow = 'none';
      overlay.style.border = 'none';
      return;
    }

    // Add subtle visual boundary box indicating aspect target
    overlay.style.border = '1px dashed rgba(99, 102, 241, 0.4)';
    overlay.style.boxShadow = 'inset 0 0 0 2000px rgba(15, 23, 42, 0.25)';
  }

  // ---------------------------------------------------------------------------
  // Resolution & FPS Controls
  // ---------------------------------------------------------------------------
  function initResolutionAndFpsControls() {
    dom.selectResolution.addEventListener('change', (e) => {
      state.resolution = e.target.value;
      if (state.resolution === 'custom') {
        dom.customResRow.classList.remove('hidden');
      } else {
        dom.customResRow.classList.add('hidden');
      }
      updateExportSummary();
    });

    dom.customWidth.addEventListener('input', () => {
      state.customWidth = parseInt(dom.customWidth.value) || null;
      updateExportSummary();
    });

    dom.customHeight.addEventListener('input', () => {
      state.customHeight = parseInt(dom.customHeight.value) || null;
      updateExportSummary();
    });

    dom.selectFps.addEventListener('change', (e) => {
      state.fps = e.target.value;
      if (state.fps === 'custom') {
        dom.customFpsRow.classList.remove('hidden');
      } else {
        dom.customFpsRow.classList.add('hidden');
      }
      updateExportSummary();
    });

    dom.customFpsInput.addEventListener('input', () => {
      state.customFps = parseFloat(dom.customFpsInput.value) || null;
      updateExportSummary();
    });
  }

  // ---------------------------------------------------------------------------
  // Compression & Audio Settings
  // ---------------------------------------------------------------------------
  function initCompressionControls() {
    // Mode Switcher Tabs
    dom.tabModeTarget.addEventListener('click', () => {
      state.compressionMode = 'target_size';
      dom.tabModeTarget.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
      dom.tabModeTarget.classList.remove('text-slate-400');
      dom.tabModeCrf.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
      dom.tabModeCrf.classList.add('text-slate-400');

      dom.panelTargetSize.classList.remove('hidden');
      dom.panelCrf.classList.add('hidden');
      updateExportSummary();
    });

    dom.tabModeCrf.addEventListener('click', () => {
      state.compressionMode = 'crf';
      dom.tabModeCrf.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
      dom.tabModeCrf.classList.remove('text-slate-400');
      dom.tabModeTarget.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
      dom.tabModeTarget.classList.add('text-slate-400');

      dom.panelCrf.classList.remove('hidden');
      dom.panelTargetSize.classList.add('hidden');
      updateExportSummary();
    });

    // Target MB Input & Slider
    const syncTargetMb = (val) => {
      let num = parseFloat(val);
      if (isNaN(num) || num <= 0) num = 1;
      state.targetSizeMb = num;
      dom.inputTargetMb.value = num;
      dom.sliderTargetMb.value = num;
      updateSavingsEstimate();
      updateExportSummary();
    };

    dom.sliderTargetMb.addEventListener('input', (e) => syncTargetMb(e.target.value));
    dom.inputTargetMb.addEventListener('input', (e) => syncTargetMb(e.target.value));

    // Preset Target MB buttons
    document.querySelectorAll('.preset-target-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mb = parseFloat(btn.dataset.mb);
        syncTargetMb(mb);
      });
    });

    // CRF Slider
    dom.sliderCrf.addEventListener('input', (e) => {
      const crfVal = parseInt(e.target.value);
      state.crf = crfVal;
      let label = 'Dengeli';
      if (crfVal <= 18) label = 'Görsel Kayıpsız';
      else if (crfVal <= 21) label = 'Çok Yüksek Kalite';
      else if (crfVal <= 24) label = 'Yüksek Kalite (Önerilen)';
      else if (crfVal <= 28) label = 'Orta Sıkıştırma';
      else label = 'Maksimum Sıkıştırma';

      dom.crfValueBadge.textContent = `${crfVal} (${label})`;
      updateExportSummary();
    });

    dom.selectCodec.addEventListener('change', (e) => {
      state.codec = e.target.value;
      updateExportSummary();
    });

    dom.selectPreset.addEventListener('change', (e) => {
      state.preset = e.target.value;
      updateExportSummary();
    });

    // Audio Controls
    dom.checkRemoveAudio.addEventListener('change', (e) => {
      state.removeAudio = e.target.checked;
      if (state.removeAudio) {
        dom.audioBitrateRow.classList.add('opacity-40', 'pointer-events-none');
      } else {
        dom.audioBitrateRow.classList.remove('opacity-40', 'pointer-events-none');
      }
      updateExportSummary();
      updateSavingsEstimate();
    });

    dom.selectAudioBitrate.addEventListener('change', (e) => {
      state.audioBitrate = parseInt(e.target.value) || 128;
      updateExportSummary();
    });
  }

  function updateSavingsEstimate() {
    if (state.originalSize <= 0) return;
    const origMb = state.originalSize / (1024 * 1024);
    const cutDur = Math.max(0.1, state.endTime - state.startTime);
    const durationRatio = state.duration > 0 ? cutDur / state.duration : 1;
    const effectiveOrigMb = origMb * durationRatio;

    if (state.targetSizeMb < effectiveOrigMb) {
      const pct = Math.round(((effectiveOrigMb - state.targetSizeMb) / effectiveOrigMb) * 100);
      dom.targetSavingsPercentage.textContent = `-%${pct} Tasarruf`;
      dom.targetSavingsPercentage.className = 'font-bold text-emerald-400 font-mono text-sm';
    } else {
      dom.targetSavingsPercentage.textContent = 'Orijinal Boyut veya Daha Büyük';
      dom.targetSavingsPercentage.className = 'font-semibold text-slate-400 font-mono text-xs';
    }
  }

  function updateExportSummary() {
    const parts = [];

    // Resolution
    if (state.resolution !== 'original') {
      parts.push(state.resolution);
    } else if (state.metadata && state.metadata.video) {
      parts.push(`${state.metadata.video.width}x${state.metadata.video.height}`);
    } else {
      parts.push('Orijinal Çözünürlük');
    }

    // Aspect ratio
    if (state.aspectRatio !== 'original') {
      const fitLabel = state.fitMode === 'pad' ? 'Şeritli' : state.fitMode === 'crop' ? 'Kırpma' : 'Uzatma';
      parts.push(`${state.aspectRatio} (${fitLabel})`);
    }

    // FPS
    if (state.fps !== 'original') {
      parts.push(`${state.fps} FPS`);
    }

    // Compression Mode
    if (state.compressionMode === 'target_size') {
      parts.push(`Hedef: ~${state.targetSizeMb} MB`);
    } else {
      const codecName = state.codec === 'libx265' ? 'H.265' : 'H.264';
      parts.push(`CRF ${state.crf} (${codecName})`);
    }

    // Multi-segment cuts
    if (state.cutOutSegments && state.cutOutSegments.length > 0) {
      parts.push(`${state.cutOutSegments.length} Bölüm Silinecek`);
    }

    if (state.removeAudio) {
      parts.push('Sessiz');
    } else {
      parts.push(`${state.audioBitrate}k Ses`);
    }

    if (dom.exportSummaryText) {
      dom.exportSummaryText.textContent = parts.join(' • ');
    }
  }

  // ---------------------------------------------------------------------------
  // Process Job Execution & Live SSE Progress
  // ---------------------------------------------------------------------------
  function initProcessHandlers() {
    dom.btnStartProcess.addEventListener('click', startJob);
    dom.btnCancelJob.addEventListener('click', cancelCurrentJob);
  }

  async function startJob() {
    if (!state.fileId) {
      showToast('İşlenecek video dosyası bulunamadı.', 'error');
      return;
    }

    // Construct VideoFilterConfig payload matching backend schema
    const config = {
      mode: state.compressionMode,
      fit_mode: state.fitMode,
      remove_audio: state.removeAudio,
      audio_bitrate_kbps: state.audioBitrate,
      fast_seek: true,
    };

    // Trimming
    if (state.startTime > 0) {
      config.start_time = Math.round(state.startTime * 1000) / 1000;
    }
    if (state.endTime < state.duration) {
      config.end_time = Math.round(state.endTime * 1000) / 1000;
    }

    // Multi-segment Cut-Outs (remove parts)
    if (state.cutOutSegments && state.cutOutSegments.length > 0) {
      config.cut_out_segments = state.cutOutSegments.map((s) => ({
        start: Math.round(s.start * 1000) / 1000,
        end: Math.round(s.end * 1000) / 1000,
      }));
    }

    // Aspect Ratio
    if (state.aspectRatio !== 'original') {
      config.aspect_ratio = state.aspectRatio;
    }

    // Resolution
    if (state.resolution === 'custom' && state.customWidth && state.customHeight) {
      config.width = state.customWidth;
      config.height = state.customHeight;
    } else if (state.resolution !== 'original' && state.resolution !== 'custom') {
      const [w, h] = state.resolution.split('x').map(Number);
      if (w && h) {
        config.width = w;
        config.height = h;
      }
    }

    // FPS
    if (state.fps === 'custom' && state.customFps) {
      config.fps = state.customFps;
    } else if (state.fps !== 'original' && state.fps !== 'custom') {
      config.fps = parseFloat(state.fps);
    }

    // Compression Mode parameters
    if (state.compressionMode === 'target_size') {
      config.target_size_mb = state.targetSizeMb;
      config.preset = 'medium';
      config.video_codec = state.codec || 'libx264';
    } else {
      config.crf = state.crf;
      config.preset = state.preset;
      config.video_codec = state.codec || 'libx264';
    }
    config.hwaccel = state.hwaccelMode || 'auto';

    // Reset UI progress meters
    dom.progressPercentLarge.textContent = '0';
    dom.jobProgressBar.style.width = '0%';
    dom.metricSpeed.textContent = '0.0x';
    dom.metricFps.textContent = '0.0';
    dom.metricCurrentTime.textContent = '00:00:00';
    dom.metricEta.textContent = 'Hesaplanıyor...';
    dom.progressLogTicker.textContent = 'İşlem FFmpeg motoruna iletiliyor...';

    switchView('progress');

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: state.fileId,
          config: config,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Job submission failed' }));
        throw new Error(err.detail || 'Failed to initialize processing job');
      }

      const jobData = await res.json();
      state.activeJobId = jobData.job_id;
      dom.progressJobId.textContent = `Job ID: ${jobData.job_id.slice(0, 8)}...`;

      // Connect to SSE stream
      subscribeToJobStream(state.activeJobId);
    } catch (err) {
      showToast(err.message, 'error');
      switchView('editor');
    }
  }

  function subscribeToJobStream(jobId) {
    if (state.activeEventSource) {
      state.activeEventSource.close();
      state.activeEventSource = null;
    }

    const sse = new EventSource(`/api/jobs/${jobId}/stream`);
    state.activeEventSource = sse;

    sse.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        handleJobProgressEvent(event);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    sse.onerror = () => {
      // If error occurs, check job status via direct GET fallback
      checkJobStatusFallback(jobId);
    };
  }

  async function checkJobStatusFallback(jobId) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          handleJobProgressEvent(job);
        }
      }
    } catch (_) {}
  }

  function handleJobProgressEvent(event) {
    const progress = Math.min(100, Math.max(0, event.progress || 0));
    dom.progressPercentLarge.textContent = Math.round(progress);
    dom.jobProgressBar.style.width = `${progress}%`;

    const data = event.progress_data || {};
    if (data.speed) dom.metricSpeed.textContent = data.speed;
    if (data.fps !== undefined) dom.metricFps.textContent = `${Math.round(data.fps * 10) / 10}`;
    if (data.current_time) dom.metricCurrentTime.textContent = data.current_time;
    if (data.eta_seconds !== undefined && data.eta_seconds !== null) {
      dom.metricEta.textContent = `~${Math.round(data.eta_seconds)}s`;
    } else {
      dom.metricEta.textContent = 'Hesaplanıyor';
    }

    if (data.bitrate && data.bitrate !== 'N/A') {
      dom.progressLogTicker.textContent = `İşleniyor: ${data.bitrate} (FPS: ${data.fps || '0'})`;
    } else {
      dom.progressLogTicker.textContent = `Durum: ${event.status.toUpperCase()} - %${Math.round(progress)}`;
    }

    if (event.status === 'completed') {
      if (state.activeEventSource) {
        state.activeEventSource.close();
        state.activeEventSource = null;
      }
      state.jobOutputSize = event.output_size;
      setTimeout(() => onJobCompleted(event), 400);
    } else if (event.status === 'failed' || event.status === 'cancelled') {
      if (state.activeEventSource) {
        state.activeEventSource.close();
        state.activeEventSource = null;
      }
      const errMsg = event.error || (event.status === 'cancelled' ? 'İşlem iptal edildi' : 'Video işleme başarısız oldu');
      showToast(errMsg, event.status === 'cancelled' ? 'info' : 'error');
      switchView('editor');
    }
  }

  async function cancelCurrentJob() {
    if (!state.activeJobId) return;
    try {
      dom.btnCancelJob.disabled = true;
      dom.progressLogTicker.textContent = 'İşlem iptal ediliyor...';
      const res = await fetch(`/api/jobs/${state.activeJobId}/cancel`, { method: 'POST' });
      if (res.ok) {
        showToast('İşlem iptal edildi.', 'info');
      }
    } catch (err) {
      showToast('İşlem iptal edilemedi.', 'error');
    } finally {
      dom.btnCancelJob.disabled = false;
      if (state.activeEventSource) {
        state.activeEventSource.close();
        state.activeEventSource = null;
      }
      switchView('editor');
    }
  }

  // ---------------------------------------------------------------------------
  // Save Destination & File Picker Handlers
  // ---------------------------------------------------------------------------
  async function saveVideoWithPicker(jobId, filename) {
    const suggestedName = filename || `processed_${state.filename || 'video.mp4'}`;
    const downloadUrl = `/api/download/${jobId}`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [
            {
              description: 'MP4 Video (*.mp4)',
              accept: { 'video/mp4': ['.mp4'] },
            },
          ],
        });

        showToast('Video seçilen konuma kaydediliyor...', 'info');
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error('Video dosyası indirilemedi');

        const writable = await handle.createWritable();
        await res.body.pipeTo(writable);

        showToast('Video başarıyla seçtiğiniz konuma kaydedildi! 🎉', 'success');
        if (dom.saveLocationModal) dom.saveLocationModal.classList.add('hidden');
        return true;
      } catch (err) {
        if (err.name === 'AbortError') {
          showToast('Kayıt işlemi iptal edildi.', 'info');
        } else {
          console.error(err);
          showToast(`Kayıt hatası: ${err.message}`, 'error');
        }
        return false;
      }
    } else {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Video İndirilenler klasörüne indirildi.', 'success');
      if (dom.saveLocationModal) dom.saveLocationModal.classList.add('hidden');
      return true;
    }
  }

  async function saveVideoToCustomPath(jobId, destinationPath) {
    if (!destinationPath || !destinationPath.trim()) {
      showToast('Lütfen geçerli bir klasör veya dosya yolu yazın.', 'error');
      return;
    }

    try {
      showToast('Video belirtilen yola kopyalanıyor...', 'info');
      const res = await fetch(`/api/jobs/${jobId}/save-to`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: destinationPath.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Kayıt başarısız');
      }

      showToast(`Video başarıyla kaydedildi: ${data.saved_path}`, 'success');
      if (dom.saveLocationModal) dom.saveLocationModal.classList.add('hidden');
    } catch (err) {
      showToast(`Hata: ${err.message}`, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Completion Screen & Download Preview
  // ---------------------------------------------------------------------------
  function onJobCompleted(jobEvent) {
    // Fill file size badges
    dom.completeOriginalSize.textContent = formatBytes(state.originalSize);
    if (jobEvent.output_size) {
      dom.completeFinalSize.textContent = formatBytes(jobEvent.output_size);
      const ratio = (jobEvent.output_size / state.originalSize) * 100;
      if (ratio < 100) {
        const saved = Math.round(100 - ratio);
        dom.completeSavingsBadge.textContent = `-%${saved} Tasarruf`;
        dom.completeSavingsBadge.className =
          'px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold font-mono text-xs sm:text-sm';
      } else {
        dom.completeSavingsBadge.textContent = 'Boyut Korundu';
        dom.completeSavingsBadge.className =
          'px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold font-mono text-xs sm:text-sm';
      }
    } else {
      dom.completeSavingsBadge.textContent = 'Hazır';
    }

    // Setup Processed Video Preview Player
    const outputUrl = `/api/media/${jobEvent.job_id}`;
    dom.outputVideoPlayer.src = outputUrl;
    dom.outputVideoPlayer.load();

    // Setup Download and Save Links
    const outputFilename = `processed_${state.filename}`;
    const downloadUrl = `/api/download/${jobEvent.job_id}`;
    dom.btnDownloadOutput.href = downloadUrl;
    dom.btnDownloadOutput.setAttribute('download', outputFilename);

    // Save As button handlers
    dom.btnSaveAs.onclick = () => saveVideoWithPicker(jobEvent.job_id, outputFilename);
    dom.modalBtnSaveAs.onclick = () => saveVideoWithPicker(jobEvent.job_id, outputFilename);

    // Direct path save handlers
    dom.btnDirectSaveSubmit.onclick = () => {
      saveVideoToCustomPath(jobEvent.job_id, dom.inputDirectSavePath.value);
    };
    dom.modalBtnSavePath.onclick = () => {
      saveVideoToCustomPath(jobEvent.job_id, dom.modalInputSavePath.value);
    };

    // Modal Close
    dom.modalBtnClose.onclick = () => {
      dom.saveLocationModal.classList.add('hidden');
    };

    dom.btnCopyLink.onclick = () => {
      const fullUrl = `${window.location.origin}${downloadUrl}`;
      navigator.clipboard.writeText(fullUrl).then(() => {
        dom.copyLinkText.textContent = 'Copied!';
        showToast('Download link copied to clipboard.', 'success');
        setTimeout(() => (dom.copyLinkText.textContent = 'Copy Link'), 2000);
      });
    };

    switchView('complete');

    // Automatically ask user where to save the video
    setTimeout(() => {
      if (dom.saveLocationModal) {
        dom.saveLocationModal.classList.remove('hidden');
        refreshIcons();
      }
    }, 350);

    showToast('Video processed successfully!', 'success');
  }

  // ---------------------------------------------------------------------------
  // Auto-Update Handlers
  // ---------------------------------------------------------------------------
  function initUpdateHandlers() {
    let pendingDownloadUrl = null;

    async function checkForUpdates(isManual = false) {
      if (isManual) {
        if (dom.iconUpdateRefresh) dom.iconUpdateRefresh.classList.add('animate-spin');
        showToast('Güncellemeler denetleniyor...', 'info');
      }

      try {
        const res = await fetch('/api/updates/check');
        if (!res.ok) throw new Error(`Kontrol başarısız (${res.status})`);
        const data = await res.json();

        if (data.update_available) {
          pendingDownloadUrl = data.download_url;
          dom.updateModalTitle.textContent = `${data.release_name || 'Yeni Güncelleme'}`;
          dom.updateCurrentVer.textContent = `v${data.current_version}`;
          dom.updateLatestVer.textContent = `v${data.latest_version}`;
          dom.updateChangelog.textContent = data.changelog || 'Yeni özellikler ve optimizasyonlar.';
          dom.updateRepoLabel.textContent = `GitHub: ${data.repo}`;

          // Reset progress UI
          dom.updateProgressContainer.classList.add('hidden');
          dom.updateActionButtons.classList.remove('hidden');
          dom.updateProgressBar.style.width = '0%';
          dom.btnStartUpdate.disabled = false;

          dom.updateModal.classList.remove('hidden');
          refreshIcons();
        } else if (isManual) {
          if (data.error) {
            showToast(`Güncelleme denetlenemedi: ${data.error}`, 'error');
          } else {
            showToast(`koala-cut en son sürümde! (v${data.current_version}) 🎉`, 'success');
          }
        }
      } catch (err) {
        if (isManual) {
          showToast(`Güncelleme hatası: ${err.message}`, 'error');
        }
      } finally {
        if (isManual && dom.iconUpdateRefresh) {
          setTimeout(() => dom.iconUpdateRefresh.classList.remove('animate-spin'), 600);
        }
      }
    }

    async function applyUpdate() {
      if (!pendingDownloadUrl) {
        showToast('İndirme bağlantısı bulunamadı.', 'error');
        return;
      }

      dom.btnStartUpdate.disabled = true;
      dom.updateProgressContainer.classList.remove('hidden');
      dom.updateProgressStatus.textContent = 'Yeni sürüm indiriliyor...';
      dom.updateProgressBar.style.width = '45%';
      dom.updateProgressPct.textContent = '45%';

      try {
        const res = await fetch('/api/updates/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ download_url: pendingDownloadUrl }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Güncelleme başarısız');

        dom.updateProgressBar.style.width = '100%';
        dom.updateProgressPct.textContent = '100%';
        dom.updateProgressStatus.textContent = 'Kuruluyor! Uygulama yeniden başlıyor...';
        showToast('Güncelleme uygulandı! koala-cut yeniden başlatılıyor... 🐨', 'success');

        setTimeout(() => {
          window.location.reload();
        }, 3500);
      } catch (err) {
        showToast(`Güncelleme yüklenemedi: ${err.message}`, 'error');
        dom.updateProgressContainer.classList.add('hidden');
        dom.btnStartUpdate.disabled = false;
      }
    }

    // Header version button click
    if (dom.btnCheckUpdates) {
      dom.btnCheckUpdates.addEventListener('click', () => checkForUpdates(true));
    }

    // Modal action buttons
    if (dom.btnStartUpdate) {
      dom.btnStartUpdate.addEventListener('click', applyUpdate);
    }
    if (dom.btnDismissUpdate) {
      dom.btnDismissUpdate.addEventListener('click', () => {
        dom.updateModal.classList.add('hidden');
      });
    }

    // Repo config toggle
    if (dom.btnToggleRepoEdit) {
      dom.btnToggleRepoEdit.addEventListener('click', () => {
        dom.repoEditBox.classList.toggle('hidden');
      });
    }

    if (dom.btnSaveCustomRepo) {
      dom.btnSaveCustomRepo.addEventListener('click', async () => {
        const repo = (dom.inputCustomRepo.value || '').trim();
        if (!repo || !repo.includes('/')) {
          showToast('Lütfen "kullanici/depo" formatında yazın.', 'error');
          return;
        }
        try {
          const res = await fetch('/api/updates/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo }),
          });
          const data = await res.json();
          if (res.ok) {
            dom.updateRepoLabel.textContent = `GitHub: ${data.repo}`;
            dom.repoEditBox.classList.add('hidden');
            showToast('GitHub deposu kaydedildi!', 'success');
          }
        } catch (e) {
          showToast('Depo kaydedilemedi.', 'error');
        }
      });
    }

    // Check silently 2.5 seconds after app startup
    setTimeout(() => checkForUpdates(false), 2500);
  }

  // ---------------------------------------------------------------------------
  // Bootstrapping
  // ---------------------------------------------------------------------------
  function init() {
    initUploadHandlers();
    initPlayerControls();
    initTimelineTrimmer();
    initNLEClipsTrack();
    initKeyboardShortcuts();
    initInspectorTabs();
    initAspectRatioControls();
    initResolutionAndFpsControls();
    initCompressionControls();
    initProcessHandlers();
    initUpdateHandlers();
    fetchHardwareCapabilities();
    refreshIcons();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
