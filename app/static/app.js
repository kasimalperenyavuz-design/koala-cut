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

    // CapCut NLE Multi-Track Timeline
    tracks: [
      { id: 'v1', type: 'video', name: 'V1', visible: true, locked: false, clips: [] },
      { id: 'a1', type: 'audio', name: 'A1', muted: false, locked: false, clips: [] },
    ],
    selectedClipId: null,
    selectedTrackId: 'v1',
    timelineZoom: 45, // Pixels per second
    isSnappingEnabled: true,
    isRippleEnabled: true,
    timelineHistory: [], // Undo snapshots
    startTime: 0,
    endTime: 0,
    isPlayingTrim: false,

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

    // CapCut NLE Timeline Studio Elements
    capcutTimelineStudio: document.getElementById('capcut-timeline-studio'),
    timelineScrollViewport: document.getElementById('timeline-scroll-viewport'),
    timelineCanvas: document.getElementById('timeline-canvas'),
    timelineRuler: document.getElementById('timeline-ruler'),
    rulerCanvas: document.getElementById('ruler-canvas'),
    timelinePlayheadLine: document.getElementById('timeline-playhead-line'),
    timelinePlayheadHead: document.getElementById('timeline-playhead-head'),
    timelineSnapGuide: document.getElementById('timeline-snap-guide'),
    timelineHeadersContainer: document.getElementById('timeline-headers-container'),
    timelineLanesArea: document.getElementById('timeline-lanes-area'),
    trackV1Clips: document.getElementById('track-v1-clips'),
    trackA1Clips: document.getElementById('track-a1-clips'),
    trimDurationBadge: document.getElementById('trim-duration-badge'),
    clipsCountBadge: document.getElementById('clips-count-badge'),
    timelineSelectionHint: document.getElementById('timeline-selection-hint'),

    // Timeline Toolbar Controls
    btnAddVideoTrack: document.getElementById('btn-add-video-track'),
    btnAddAudioTrack: document.getElementById('btn-add-audio-track'),
    btnSplitClip: document.getElementById('btn-split-clip'),
    btnDeleteClip: document.getElementById('btn-delete-clip'),
    btnUndoTimeline: document.getElementById('btn-undo-timeline'),
    btnResetTimeline: document.getElementById('btn-reset-timeline'),
    btnToggleSnap: document.getElementById('btn-toggle-snap'),
    snapStatusText: document.getElementById('snap-status-text'),
    btnToggleRipple: document.getElementById('btn-toggle-ripple'),
    rippleStatusText: document.getElementById('ripple-status-text'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomFit: document.getElementById('btn-zoom-fit'),
    timelineZoomSlider: document.getElementById('timeline-zoom-slider'),
    btnOpenShortcuts: document.getElementById('btn-open-shortcuts'),

    // Track Controls
    btnTrackV1Visible: document.getElementById('btn-track-v1-visible'),
    btnTrackV1Lock: document.getElementById('btn-track-v1-lock'),
    btnTrackA1Mute: document.getElementById('btn-track-a1-mute'),
    btnTrackA1Lock: document.getElementById('btn-track-a1-lock'),

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
    tabNavClip: document.getElementById('tab-nav-clip'),
    tabNavAudio: document.getElementById('tab-nav-audio'),
    tabPanelFormat: document.getElementById('tab-panel-format'),
    tabPanelCompress: document.getElementById('tab-panel-compress'),
    tabPanelClip: document.getElementById('tab-panel-clip'),
    tabPanelAudio: document.getElementById('tab-panel-audio'),

    // Clip Inspector Elements
    clipInspectorBadge: document.getElementById('clip-inspector-badge'),
    clipEmptyState: document.getElementById('clip-empty-state'),
    clipActiveInspector: document.getElementById('clip-active-inspector'),
    inspectorClipTitle: document.getElementById('inspector-clip-title'),
    inspectorClipTiming: document.getElementById('inspector-clip-timing'),
    btnInspectorDeleteClip: document.getElementById('btn-inspector-delete-clip'),
    sliderClipSpeed: document.getElementById('slider-clip-speed'),
    inspectorSpeedBadge: document.getElementById('inspector-speed-badge'),
    sliderClipVolume: document.getElementById('slider-clip-volume'),
    inspectorVolumeBadge: document.getElementById('inspector-volume-badge'),
    inputClipIn: document.getElementById('input-clip-in'),
    inputClipOut: document.getElementById('input-clip-out'),
    selectClipTrack: document.getElementById('select-clip-track'),

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
    btnOpenFolder: document.getElementById('btn-open-folder'),
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

    // NLE Context Menu Elements
    timelineContextMenu: document.getElementById('timeline-context-menu'),
    contextClipActions: document.getElementById('context-clip-actions'),
    contextTrackActions: document.getElementById('context-track-actions'),
    contextClipLabel: document.getElementById('context-clip-label'),
    contextClipDuration: document.getElementById('context-clip-duration'),
    contextMuteText: document.getElementById('context-mute-text'),
    contextTrackList: document.getElementById('context-track-list'),

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
    try {
      state.fileId = payload.file_id;
      state.filename = payload.filename || 'video.mp4';
      state.metadata = payload.metadata;
      state.duration = payload.metadata ? (payload.metadata.duration || 0) : 0;
      state.originalSize = payload.metadata ? (payload.metadata.size_bytes || 0) : 0;

      // Reset trim to full range
      state.startTime = 0;
      state.endTime = state.duration;

      // Display metadata bar
      if (dom.metaFilename) {
        dom.metaFilename.textContent = state.filename;
        dom.metaFilename.title = state.filename;
      }
      const vMeta = payload.metadata && payload.metadata.video;
      if (vMeta) {
        if (dom.metaCodec) dom.metaCodec.textContent = (vMeta.codec || 'H.264').toUpperCase();
        if (dom.metaRes) dom.metaRes.textContent = `${vMeta.width}x${vMeta.height}`;
        if (dom.metaFps) dom.metaFps.textContent = `${Math.round(vMeta.fps)} fps`;
      } else {
        if (dom.metaCodec) dom.metaCodec.textContent = 'N/A';
        if (dom.metaRes) dom.metaRes.textContent = 'Bilinmiyor';
        if (dom.metaFps) dom.metaFps.textContent = 'Bilinmiyor';
      }
      if (dom.metaDuration) dom.metaDuration.textContent = formatTime(state.duration);
      if (dom.metaSize) dom.metaSize.textContent = formatBytes(state.originalSize);

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
      if (dom.inputTargetMb) dom.inputTargetMb.value = state.targetSizeMb;
      if (dom.sliderTargetMb) {
        dom.sliderTargetMb.value = state.targetSizeMb;
        dom.sliderTargetMb.max = Math.max(50, Math.ceil(origMb * 1.2));
      }

      // Initialize CapCut Multi-Track Timeline
      clipCounter = 1;
      const v1 = getV1Track();
      if (v1) {
        v1.clips = [createClip('clip-1', 0.0, state.duration, 0.0, 1.0, 1.0)];
      }
      state.selectedClipId = null;
      state.timelineHistory = [];
      if (dom.btnDeleteClip) {
        dom.btnDeleteClip.classList.add('opacity-50', 'pointer-events-none');
      }
      renderAllTracks();
      updateTimelineDurationBadge();
      switchView('editor');
      showToast(`Video yüklendi: ${state.filename}`, 'success');
    } catch (err) {
      console.error('Error in loadMediaIntoEditor:', err);
      showToast('Video yüklenirken hata oluştu: ' + err.message, 'error');
      switchView('editor');
    }
  }

  // ---------------------------------------------------------------------------
  // Video Player Transport Controls
  // ---------------------------------------------------------------------------
  function initPlayerControls() {
    // Play / Pause Toggle
    const togglePlay = () => {
      if (dom.videoPlayer.paused) {
        const v1 = getV1Track();
        if (v1 && v1.clips.length > 0) {
          const lastClip = v1.clips[v1.clips.length - 1];
          const firstClip = v1.clips[0];
          if (dom.videoPlayer.currentTime >= lastClip.out_point || dom.videoPlayer.currentTime < firstClip.in_point) {
            dom.videoPlayer.currentTime = firstClip.in_point;
          }
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
      updatePlayheadPosition();

      // Real-time Gap Skipping across deleted timeline regions
      if (!dom.videoPlayer.paused) {
        const v1 = getV1Track();
        if (v1 && v1.clips.length > 0) {
          const lastClip = v1.clips[v1.clips.length - 1];
          if (cur >= lastClip.out_point) {
            dom.videoPlayer.pause();
            state.isPlayingTrim = false;
            return;
          }

          for (let i = 0; i < v1.clips.length - 1; i++) {
            const currentClip = v1.clips[i];
            const nextClip = v1.clips[i + 1];
            if (cur >= currentClip.out_point && cur < nextClip.in_point) {
              dom.videoPlayer.currentTime = nextClip.in_point;
              break;
            }
          }
        }
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

  // ===========================================================================
  // CapCut NLE Multi-Track Timeline Engine
  // ===========================================================================
  let clipCounter = 1;

  function getClipDuration(clip) {
    if (!clip) return 0.1;
    const spd = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
    const inPt = typeof clip.in_point === 'number' ? clip.in_point : 0;
    const outPt = typeof clip.out_point === 'number' ? clip.out_point : inPt + 0.1;
    return Math.max(0.1, (outPt - inPt) / spd);
  }

  function createClip(id, in_point, out_point, timeline_start = 0.0, speed = 1.0, volume = 1.0) {
    return {
      id,
      in_point: Math.round(in_point * 1000) / 1000,
      out_point: Math.round(out_point * 1000) / 1000,
      timeline_start: Math.round(timeline_start * 1000) / 1000,
      speed: speed || 1.0,
      volume: volume !== undefined ? volume : 1.0,
      get duration() {
        return getClipDuration(this);
      },
    };
  }

  function timeToPx(seconds) {
    return Math.max(0, (seconds || 0) * state.timelineZoom);
  }

  function pxToTime(px) {
    return Math.max(0, (px || 0) / state.timelineZoom);
  }

  function getV1Track() {
    return state.tracks.find((t) => t.id === 'v1');
  }

  function getA1Track() {
    return state.tracks.find((t) => t.id === 'a1');
  }

  function getSelectedClip() {
    if (!state.selectedClipId) return null;
    for (const track of state.tracks) {
      const c = track.clips.find((clip) => clip.id === state.selectedClipId);
      if (c) return { clip: c, track };
    }
    return null;
  }

  function pushTimelineHistory() {
    state.timelineHistory.push({
      tracks: JSON.parse(JSON.stringify(state.tracks)),
      selectedClipId: state.selectedClipId,
    });
    if (state.timelineHistory.length > 30) {
      state.timelineHistory.shift();
    }
  }

  function undoTimeline() {
    if (!state.timelineHistory || state.timelineHistory.length === 0) {
      showToast('Geri alınacak bir kurgu işlemi bulunmuyor.', 'info');
      return;
    }
    const previous = state.timelineHistory.pop();
    state.tracks = previous.tracks;
    state.selectedClipId = previous.selectedClipId;
    renderAllTracks();
    updateTimelineDurationBadge();
    updateClipInspector();
    showToast('Son işlem geri alındı (Undo) ↩️', 'info');
  }

  function snapTime(rawTime, thresholdSeconds = 0.25) {
    if (!state.isSnappingEnabled) return rawTime;

    const snapPoints = [0, dom.videoPlayer.currentTime];
    state.tracks.forEach((t) => {
      (t.clips || []).forEach((c) => {
        snapPoints.push(c.timeline_start);
        snapPoints.push(c.timeline_start + getClipDuration(c));
      });
    });

    let closest = rawTime;
    let minDiff = thresholdSeconds;
    for (const pt of snapPoints) {
      const diff = Math.abs(rawTime - pt);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pt;
      }
    }
    return closest;
  }

  function calculateNetDuration() {
    let maxEnd = 0;
    state.tracks.forEach((track) => {
      (track.clips || []).forEach((c) => {
        const end = c.timeline_start + getClipDuration(c);
        if (end > maxEnd) maxEnd = end;
      });
    });
    return maxEnd > 0 ? maxEnd : state.duration;
  }

  function updateTimelineDurationBadge() {
    const netDur = calculateNetDuration();
    if (dom.trimDurationBadge) {
      dom.trimDurationBadge.textContent = formatTime(netDur);
    }
    let totalClips = 0;
    state.tracks.forEach((t) => {
      totalClips += (t.clips || []).length;
    });
    if (dom.clipsCountBadge) {
      dom.clipsCountBadge.textContent = `${totalClips} Klip`;
    }
    updateExportSummary();
    updateSavingsEstimate();
  }

  // --- Ruler Rendering ---
  function renderTimelineRuler() {
    if (!dom.rulerCanvas || !dom.timelineRuler) return;
    const canvas = dom.rulerCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const netDur = Math.max(state.duration, calculateNetDuration(), 10);
    const viewportWidth = dom.timelineScrollViewport ? dom.timelineScrollViewport.clientWidth : 800;
    const totalWidth = Math.max(viewportWidth, timeToPx(netDur) + 200);

    canvas.width = totalWidth;
    canvas.height = 32;
    if (dom.timelineCanvas) {
      dom.timelineCanvas.style.width = `${totalWidth}px`;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';

    let stepSec = 1;
    if (state.timelineZoom < 25) stepSec = 5;
    else if (state.timelineZoom < 50) stepSec = 2;
    else if (state.timelineZoom > 100) stepSec = 0.5;

    for (let t = 0; t <= netDur + 10; t += 0.5) {
      const x = timeToPx(t);
      const isMajor = Math.abs(t % (stepSec * 2)) < 0.01;
      const isMedium = Math.abs(t % stepSec) < 0.01;

      ctx.beginPath();
      if (isMajor) {
        ctx.moveTo(x, 16);
        ctx.lineTo(x, 32);
        ctx.stroke();
        ctx.fillText(formatTime(t).split('.')[0], x + 4, 12);
      } else if (isMedium) {
        ctx.moveTo(x, 22);
        ctx.lineTo(x, 32);
        ctx.stroke();
      } else {
        ctx.moveTo(x, 26);
        ctx.lineTo(x, 32);
        ctx.stroke();
      }
    }
  }

  // --- Dynamic Tracks & Clips Rendering ---
  function renderAllTracks() {
    renderTimelineRuler();
    renderTrackHeaders();
    renderTrackLanes();
    updatePlayheadPosition();
    updateClipInspector();
    updateSelectClipTrackDropdown();
  }

  function renderTrackHeaders() {
    if (!dom.timelineHeadersContainer) return;
    dom.timelineHeadersContainer.innerHTML = '';

    state.tracks.forEach((track) => {
      const isVideo = track.type === 'video';
      const isSelected = state.selectedTrackId === track.id;
      const isBaseTrack = track.id === 'v1' || track.id === 'a1';

      const headerEl = document.createElement('div');
      headerEl.className = `h-11 px-3 border-b border-white/5 flex items-center justify-between transition-colors ${
        isSelected ? 'bg-indigo-950/40 border-l-2 border-l-indigo-500' : 'bg-slate-900/60'
      }`;
      headerEl.dataset.trackId = track.id;

      const iconName = isVideo ? 'film' : 'volume-2';
      const iconColor = isVideo ? 'text-indigo-400' : 'text-cyan-400';
      const badgeColor = isVideo ? 'text-indigo-300' : 'text-cyan-300';

      headerEl.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="${iconName}" class="w-3.5 h-3.5 ${iconColor} flex-shrink-0"></i>
          <span class="text-xs font-mono font-bold ${badgeColor}">${track.name}</span>
          ${track.locked ? '<i data-lucide="lock" class="w-3 h-3 text-amber-400 flex-shrink-0"></i>' : ''}
        </div>
        <div class="flex items-center gap-1">
          ${
            isVideo
              ? `
            <button class="btn-track-toggle-vis p-1 rounded hover:bg-white/10 ${track.visible === false ? 'text-slate-600' : 'text-slate-300'}" title="${track.visible === false ? 'İzi Göster' : 'İzi Gizle'}">
              <i data-lucide="${track.visible === false ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
            </button>
          `
              : `
            <button class="btn-track-toggle-mute p-1 rounded hover:bg-white/10 ${track.muted ? 'text-slate-600' : 'text-slate-300'}" title="${track.muted ? 'Sesi Aç' : 'Sesi Kapat'}">
              <i data-lucide="${track.muted ? 'volume-x' : 'volume-2'}" class="w-3.5 h-3.5"></i>
            </button>
          `
          }
          <button class="btn-track-toggle-lock p-1 rounded hover:bg-white/10 ${track.locked ? 'text-amber-400' : 'text-slate-500'}" title="${track.locked ? 'Kilidi Aç' : 'İzi Kilitle'}">
            <i data-lucide="${track.locked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          </button>
          ${
            !isBaseTrack
              ? `
            <button class="btn-track-delete p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400" title="İzi Kaldır">
              <i data-lucide="trash-2" class="w-3 h-3"></i>
            </button>
          `
              : ''
          }
        </div>
      `;

      const btnVis = headerEl.querySelector('.btn-track-toggle-vis');
      if (btnVis) {
        btnVis.addEventListener('click', (e) => {
          e.stopPropagation();
          track.visible = track.visible === false;
          renderAllTracks();
        });
      }

      const btnMute = headerEl.querySelector('.btn-track-toggle-mute');
      if (btnMute) {
        btnMute.addEventListener('click', (e) => {
          e.stopPropagation();
          track.muted = !track.muted;
          renderAllTracks();
        });
      }

      const btnLock = headerEl.querySelector('.btn-track-toggle-lock');
      if (btnLock) {
        btnLock.addEventListener('click', (e) => {
          e.stopPropagation();
          track.locked = !track.locked;
          renderAllTracks();
        });
      }

      const btnDel = headerEl.querySelector('.btn-track-delete');
      if (btnDel) {
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteTrack(track.id);
        });
      }

      headerEl.addEventListener('click', () => {
        state.selectedTrackId = track.id;
        renderTrackHeaders();
      });

      dom.timelineHeadersContainer.appendChild(headerEl);
    });

    refreshIcons();
  }

  function renderTrackLanes() {
    if (!dom.timelineLanesArea) return;
    dom.timelineLanesArea.innerHTML = '';

    state.tracks.forEach((track) => {
      const isVideo = track.type === 'video';
      const laneEl = document.createElement('div');
      laneEl.className = `relative w-full h-11 border-b border-white/5 track-lane-grid-bg overflow-visible flex items-center ${
        track.locked ? 'opacity-60 pointer-events-none' : ''
      }`;
      laneEl.dataset.trackId = track.id;

      (track.clips || []).forEach((clip, index) => {
        const clipDuration = getClipDuration(clip);
        const clipEl = document.createElement('div');
        const isSelected = clip.id === state.selectedClipId;

        if (isVideo) {
          clipEl.className = `timeline-clip-card ${isSelected ? 'selected' : ''}`;
        } else {
          clipEl.className = `timeline-audio-clip-card ${isSelected ? 'selected' : ''}`;
        }

        clipEl.dataset.clipId = clip.id;
        clipEl.dataset.trackId = track.id;
        clipEl.style.left = `${timeToPx(clip.timeline_start)}px`;
        clipEl.style.width = `${Math.max(28, timeToPx(clipDuration))}px`;

        const durStr = clipDuration.toFixed(1);
        const speedBadge =
          clip.speed && clip.speed !== 1.0
            ? `<span class="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold">${clip.speed}x</span>`
            : '';
        const volBadge =
          !isVideo && clip.volume !== undefined && clip.volume !== 1.0
            ? `<span class="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-300 font-mono">%${Math.round(clip.volume * 100)}</span>`
            : '';

        if (isVideo) {
          clipEl.innerHTML = `
            <div class="clip-trim-handle clip-trim-handle-left" data-action="trim-left" title="Klibin başını kırp"></div>
            <div class="flex items-center gap-1.5 min-w-0 flex-1 px-1 pointer-events-none">
              <i data-lucide="film" class="w-3.5 h-3.5 text-indigo-300 flex-shrink-0"></i>
              <span class="text-xs font-semibold text-white truncate">Klip ${index + 1}</span>
              ${speedBadge}
            </div>
            <div class="flex items-center gap-1 text-[10px] font-mono text-indigo-200 pointer-events-none flex-shrink-0">
              <span>${durStr}s</span>
            </div>
            <div class="clip-trim-handle clip-trim-handle-right" data-action="trim-right" title="Klibin sonunu kırp"></div>
          `;
        } else {
          clipEl.innerHTML = `
            <div class="clip-trim-handle clip-trim-handle-left" data-action="trim-left" title="Sesin başını kırp"></div>
            <div class="flex items-center gap-1.5 min-w-0 flex-1 px-1 pointer-events-none">
              <i data-lucide="volume-2" class="w-3 h-3 text-cyan-400 flex-shrink-0"></i>
              <span class="text-[11px] font-medium text-cyan-200 truncate">Ses ${index + 1}</span>
              ${volBadge}
            </div>
            <div class="flex items-center gap-1 text-[10px] font-mono text-cyan-200 pointer-events-none flex-shrink-0">
              <span>${durStr}s</span>
            </div>
            <div class="clip-trim-handle clip-trim-handle-right" data-action="trim-right" title="Sesin sonunu kırp"></div>
          `;
        }

        clipEl.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          const action = e.target.dataset.action;
          if (action === 'trim-left') {
            initClipEdgeTrimming(clip, track, 'left', e);
          } else if (action === 'trim-right') {
            initClipEdgeTrimming(clip, track, 'right', e);
          } else {
            selectClip(clip.id);
            initClipDragging(clip, track, e);
          }
        });

        laneEl.appendChild(clipEl);
      });

      dom.timelineLanesArea.appendChild(laneEl);
    });

    refreshIcons();
  }

  function updateSelectClipTrackDropdown() {
    if (!dom.selectClipTrack) return;
    const sel = getSelectedClip();
    dom.selectClipTrack.innerHTML = '';
    state.tracks.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.name} (${t.type === 'video' ? 'Video' : 'Ses'})`;
      if (sel && sel.track.id === t.id) {
        opt.selected = true;
      }
      dom.selectClipTrack.appendChild(opt);
    });
  }

  // --- Edge Trimming Drag (Left & Right Handles) ---
  function initClipEdgeTrimming(clip, track, edge, downEvent) {
    downEvent.stopPropagation();
    downEvent.preventDefault();
    pushTimelineHistory();

    const startX = downEvent.clientX;
    const origIn = clip.in_point;
    const origOut = clip.out_point;
    const origTimelineStart = clip.timeline_start;
    const speed = clip.speed || 1.0;

    const onPointerMove = (e) => {
      const dx = e.clientX - startX;
      const dSeconds = dx / state.timelineZoom;

      if (edge === 'left') {
        const deltaSource = dSeconds * speed;
        let newIn = Math.max(0, Math.min(origOut - 0.2, origIn + deltaSource));
        newIn = snapTime(newIn, 0.15);
        clip.in_point = Math.round(newIn * 100) / 100;
        clip.timeline_start = Math.max(0, origTimelineStart + (clip.in_point - origIn) / speed);
        dom.videoPlayer.currentTime = clip.in_point;
      } else if (edge === 'right') {
        const deltaSource = dSeconds * speed;
        let newOut = Math.min(state.duration, Math.max(origIn + 0.2, origOut + deltaSource));
        newOut = snapTime(newOut, 0.15);
        clip.out_point = Math.round(newOut * 100) / 100;
        dom.videoPlayer.currentTime = clip.out_point;
      }

      renderAllTracks();
      updateTimelineDurationBadge();
      updateClipInspector();
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (state.isRippleEnabled) {
        rippleAlignClips(track);
      }
      renderAllTracks();
      updateTimelineDurationBadge();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // --- Clip Position Dragging on Track ---
  function initClipDragging(clip, track, downEvent) {
    downEvent.preventDefault();
    const startX = downEvent.clientX;
    const origTimelineStart = clip.timeline_start;
    let hasMoved = false;

    const onPointerMove = (e) => {
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3 && !hasMoved) {
        hasMoved = true;
        pushTimelineHistory();
      }
      if (!hasMoved) return;

      const dSeconds = dx / state.timelineZoom;
      let newStart = Math.max(0, origTimelineStart + dSeconds);
      newStart = snapTime(newStart, 0.2);
      clip.timeline_start = Math.round(newStart * 100) / 100;

      if (dom.timelineSnapGuide) {
        dom.timelineSnapGuide.classList.remove('hidden');
        dom.timelineSnapGuide.style.left = `${timeToPx(clip.timeline_start)}px`;
      }

      renderTrackLanes();
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (dom.timelineSnapGuide) {
        dom.timelineSnapGuide.classList.add('hidden');
      }
      if (hasMoved) {
        track.clips.sort((a, b) => a.timeline_start - b.timeline_start);
        if (state.isRippleEnabled) {
          rippleAlignClips(track);
        }
        renderAllTracks();
        updateTimelineDurationBadge();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function rippleAlignClips(targetTrack) {
    const t = targetTrack || getV1Track();
    if (!t || !t.clips || t.clips.length === 0) return;
    t.clips.sort((a, b) => a.timeline_start - b.timeline_start);
    let cur = 0;
    t.clips.forEach((c) => {
      c.timeline_start = Math.round(cur * 100) / 100;
      cur += getClipDuration(c);
    });
  }

  // --- Razor Split Tool ---
  function splitClipAtPlayhead() {
    if (state.duration <= 0) return;
    const cur = dom.videoPlayer.currentTime;

    const track = state.tracks.find((t) => t.id === state.selectedTrackId) || getV1Track();
    if (!track || !track.clips || track.clips.length === 0) return;

    const targetIdx = track.clips.findIndex(
      (c) => cur > c.in_point + 0.15 && cur < c.out_point - 0.15
    );

    if (targetIdx === -1) {
      showToast('İmleç bir klibin sınırında veya boş bir aralıkta. Bölme yapılamaz.', 'info');
      return;
    }

    pushTimelineHistory();
    const targetClip = track.clips[targetIdx];
    const curRounded = Math.round(cur * 100) / 100;
    const splitOffset = (curRounded - targetClip.in_point) / (targetClip.speed || 1.0);

    const clipA = createClip(
      `clip-${++clipCounter}`,
      targetClip.in_point,
      curRounded,
      targetClip.timeline_start,
      targetClip.speed,
      targetClip.volume
    );
    const clipB = createClip(
      `clip-${++clipCounter}`,
      curRounded,
      targetClip.out_point,
      Math.round((targetClip.timeline_start + splitOffset) * 100) / 100,
      targetClip.speed,
      targetClip.volume
    );

    track.clips.splice(targetIdx, 1, clipA, clipB);
    if (state.isRippleEnabled) rippleAlignClips(track);

    selectClip(clipB.id);
    renderAllTracks();
    updateTimelineDurationBadge();
    showToast(`Klip ${formatTime(curRounded)} noktasından bölündü (Split) ✂️`, 'success');
  }

  function selectClip(clipId) {
    state.selectedClipId = clipId;
    const sel = getSelectedClip();
    if (sel) {
      state.selectedTrackId = sel.track.id;
    }
    if (dom.btnDeleteClip) {
      dom.btnDeleteClip.classList.remove('opacity-50', 'pointer-events-none');
    }
    renderAllTracks();
    updateClipInspector();
    activateInspectorTab('clip');
  }

  function deleteSelectedClip() {
    if (!state.selectedClipId) {
      showToast('Lütfen silmek istediğiniz klibe tıklayın.', 'info');
      return;
    }
    const sel = getSelectedClip();
    if (!sel) return;
    const { clip, track } = sel;

    // Check if total video clips <= 1 across all video tracks
    let totalVideoClips = 0;
    state.tracks.filter((t) => t.type === 'video').forEach((t) => (totalVideoClips += t.clips.length));
    if (track.type === 'video' && totalVideoClips <= 1) {
      showToast('Videonun tamamını silemezsiniz! Sıfırlamak için Sıfırla butonunu kullanın.', 'error');
      return;
    }

    pushTimelineHistory();
    const delIdx = track.clips.findIndex((c) => c.id === state.selectedClipId);
    if (delIdx !== -1) {
      const removed = track.clips.splice(delIdx, 1)[0];
      state.selectedClipId = null;
      if (dom.btnDeleteClip) {
        dom.btnDeleteClip.classList.add('opacity-50', 'pointer-events-none');
      }
      if (state.isRippleEnabled) rippleAlignClips(track);

      renderAllTracks();
      updateTimelineDurationBadge();
      updateClipInspector();
      showToast(`Klip silindi (${formatTime(removed.in_point)} - ${formatTime(removed.out_point)}) 🗑️`, 'success');
    }
  }

  function duplicateClip(clipId) {
    const sel = getSelectedClip();
    if (!sel) return;
    const { clip, track } = sel;
    pushTimelineHistory();
    const newId = `clip-${++clipCounter}`;
    const newClip = createClip(
      newId,
      clip.in_point,
      clip.out_point,
      clip.timeline_start + getClipDuration(clip) + 0.2,
      clip.speed,
      clip.volume
    );
    track.clips.push(newClip);
    track.clips.sort((a, b) => a.timeline_start - b.timeline_start);
    selectClip(newId);
    renderAllTracks();
    updateTimelineDurationBadge();
    showToast('Klip çoğaltıldı (Duplicate) 📋', 'success');
  }

  function moveClipToTrack(clipId, targetTrackId) {
    const sel = getSelectedClip();
    if (!sel) return;
    const { clip, track: sourceTrack } = sel;
    if (sourceTrack.id === targetTrackId) return;
    const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) return;

    pushTimelineHistory();
    sourceTrack.clips = sourceTrack.clips.filter((c) => c.id !== clipId);
    targetTrack.clips.push(clip);
    targetTrack.clips.sort((a, b) => a.timeline_start - b.timeline_start);
    state.selectedTrackId = targetTrackId;
    renderAllTracks();
    updateClipInspector();
    showToast(`Klip ${targetTrack.name} kanalına taşındı.`, 'info');
  }

  function addTrack(type) {
    const prefix = type === 'video' ? 'v' : 'a';
    const sameTypeTracks = state.tracks.filter((t) => t.type === type);
    let maxNum = 0;
    sameTypeTracks.forEach((t) => {
      const num = parseInt(t.id.replace(prefix, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    const nextNum = maxNum + 1;
    const id = `${prefix}${nextNum}`;
    const name = `${prefix.toUpperCase()}${nextNum}`;

    const newTrack = {
      id,
      type,
      name,
      locked: false,
      clips: [],
    };
    if (type === 'video') newTrack.visible = true;
    else newTrack.muted = false;

    pushTimelineHistory();
    if (type === 'video') {
      const lastVideoIdx = state.tracks.map((t) => t.type).lastIndexOf('video');
      state.tracks.splice(lastVideoIdx + 1, 0, newTrack);
    } else {
      state.tracks.push(newTrack);
    }

    state.selectedTrackId = id;
    renderAllTracks();
    showToast(`Yeni ${type === 'video' ? 'video' : 'ses'} izi eklendi (${name}) 🎬`, 'success');
  }

  function deleteTrack(trackId) {
    if (trackId === 'v1' || trackId === 'a1') {
      showToast('Temel izler (V1, A1) silinemez.', 'info');
      return;
    }
    const idx = state.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;

    pushTimelineHistory();
    state.tracks.splice(idx, 1);
    if (state.selectedTrackId === trackId) {
      state.selectedTrackId = 'v1';
    }
    if (state.selectedClipId && !getSelectedClip()) {
      state.selectedClipId = null;
    }
    renderAllTracks();
    updateTimelineDurationBadge();
    updateClipInspector();
    showToast('Kanal silindi 🗑️', 'info');
  }

  function resetTimeline() {
    if (state.duration <= 0) return;
    pushTimelineHistory();
    clipCounter = 1;
    state.tracks = [
      { id: 'v1', type: 'video', name: 'V1', visible: true, locked: false, clips: [createClip('clip-1', 0.0, state.duration, 0.0, 1.0, 1.0)] },
      { id: 'a1', type: 'audio', name: 'A1', muted: false, locked: false, clips: [] },
    ];
    state.selectedClipId = null;
    state.selectedTrackId = 'v1';
    if (dom.btnDeleteClip) {
      dom.btnDeleteClip.classList.add('opacity-50', 'pointer-events-none');
    }
    renderAllTracks();
    updateTimelineDurationBadge();
    updateClipInspector();
    showToast('Zaman çizgisi sıfırlandı, video tek parça yapıldı.', 'info');
  }

  // --- Clip Inspector Synchronizer ---
  function updateClipInspector() {
    const sel = getSelectedClip();
    if (!sel) {
      if (dom.clipEmptyState) dom.clipEmptyState.classList.remove('hidden');
      if (dom.clipActiveInspector) dom.clipActiveInspector.classList.add('hidden');
      if (dom.clipInspectorBadge) {
        dom.clipInspectorBadge.textContent = 'Seçim Yok';
        dom.clipInspectorBadge.className = 'px-2 py-0.5 text-[10px] font-bold font-mono rounded-full bg-slate-800 text-slate-400 border border-white/5';
      }
      if (dom.timelineSelectionHint) dom.timelineSelectionHint.textContent = 'Seçili Klip: Yok';
      return;
    }

    const { clip, track } = sel;
    if (dom.clipEmptyState) dom.clipEmptyState.classList.add('hidden');
    if (dom.clipActiveInspector) dom.clipActiveInspector.classList.remove('hidden');
    if (dom.clipInspectorBadge) {
      dom.clipInspectorBadge.textContent = `${track.name}: ${clip.id.toUpperCase()}`;
      dom.clipInspectorBadge.className = 'px-2 py-0.5 text-[10px] font-bold font-mono rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
    }

    const clipIdx = track.clips.findIndex((c) => c.id === clip.id) + 1;
    if (dom.inspectorClipTitle) dom.inspectorClipTitle.textContent = `${track.name} - Klip ${clipIdx}`;
    if (dom.inspectorClipTiming) {
      dom.inspectorClipTiming.textContent = `${formatTime(clip.in_point)} - ${formatTime(clip.out_point)} • ${getClipDuration(clip).toFixed(1)}s`;
    }
    if (dom.timelineSelectionHint) {
      dom.timelineSelectionHint.textContent = `Seçili: ${track.name} Klip ${clipIdx} (${formatTime(clip.in_point)} - ${formatTime(clip.out_point)})`;
    }

    if (dom.sliderClipSpeed) dom.sliderClipSpeed.value = clip.speed || 1.0;
    if (dom.inspectorSpeedBadge) dom.inspectorSpeedBadge.textContent = `${clip.speed || 1.0}x`;
    if (dom.sliderClipVolume) dom.sliderClipVolume.value = Math.round((clip.volume !== undefined ? clip.volume : 1.0) * 100);
    if (dom.inspectorVolumeBadge) dom.inspectorVolumeBadge.textContent = `%${Math.round((clip.volume !== undefined ? clip.volume : 1.0) * 100)}`;
    if (dom.inputClipIn) dom.inputClipIn.value = clip.in_point.toFixed(1);
    if (dom.inputClipOut) dom.inputClipOut.value = clip.out_point.toFixed(1);
    if (dom.selectClipTrack) dom.selectClipTrack.value = track.id;
  }

  function initClipInspectorListeners() {
    if (dom.btnInspectorDeleteClip) {
      dom.btnInspectorDeleteClip.addEventListener('click', deleteSelectedClip);
    }

    if (dom.selectClipTrack) {
      dom.selectClipTrack.addEventListener('change', (e) => {
        if (state.selectedClipId) {
          moveClipToTrack(state.selectedClipId, e.target.value);
        }
      });
    }

    if (dom.sliderClipSpeed) {
      dom.sliderClipSpeed.addEventListener('input', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.speed = parseFloat(e.target.value);
        if (dom.inspectorSpeedBadge) dom.inspectorSpeedBadge.textContent = `${sel.clip.speed}x`;
        if (state.isRippleEnabled) rippleAlignClips(sel.track);
        renderAllTracks();
        updateTimelineDurationBadge();
      });
    }

    document.querySelectorAll('.clip-speed-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.speed = parseFloat(btn.dataset.speed);
        if (dom.sliderClipSpeed) dom.sliderClipSpeed.value = sel.clip.speed;
        if (dom.inspectorSpeedBadge) dom.inspectorSpeedBadge.textContent = `${sel.clip.speed}x`;
        if (state.isRippleEnabled) rippleAlignClips(sel.track);
        renderAllTracks();
        updateTimelineDurationBadge();
      });
    });

    if (dom.sliderClipVolume) {
      dom.sliderClipVolume.addEventListener('input', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.volume = parseInt(e.target.value, 10) / 100;
        if (dom.inspectorVolumeBadge) dom.inspectorVolumeBadge.textContent = `%${e.target.value}`;
        renderTrackLanes();
      });
    }

    if (dom.inputClipIn) {
      dom.inputClipIn.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0 && val < sel.clip.out_point) {
          sel.clip.in_point = val;
          if (state.isRippleEnabled) rippleAlignClips(sel.track);
          renderAllTracks();
          updateTimelineDurationBadge();
          updateClipInspector();
        }
      });
    }

    if (dom.inputClipOut) {
      dom.inputClipOut.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > sel.clip.in_point && val <= state.duration) {
          sel.clip.out_point = val;
          if (state.isRippleEnabled) rippleAlignClips(sel.track);
          renderAllTracks();
          updateTimelineDurationBadge();
          updateClipInspector();
        }
      });
    }
  }

  // --- Playhead & Ruler Scrubber ---
  function updatePlayheadPosition() {
    if (!dom.timelinePlayheadLine) return;
    const cur = dom.videoPlayer.currentTime;
    dom.timelinePlayheadLine.style.left = `${timeToPx(cur)}px`;
  }

  function initTimelineRulerScrubber() {
    let isScrubbing = false;

    const seekAtEvent = (e) => {
      if (!dom.timelineCanvas) return;
      const canvasRect = dom.timelineCanvas.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const offsetX = clientX - canvasRect.left;
      const targetTime = Math.max(0, Math.min(state.duration, pxToTime(offsetX)));

      if (dom.timelinePlayheadLine) {
        dom.timelinePlayheadLine.style.left = `${Math.max(0, offsetX)}px`;
      }
      dom.videoPlayer.currentTime = targetTime;
      if (dom.playerCurrentTime) {
        dom.playerCurrentTime.textContent = formatTime(targetTime);
      }
    };

    const startScrubbing = (e) => {
      isScrubbing = true;
      document.body.classList.add('scrubbing-active');
      if (e.target && e.target.setPointerCapture && e.pointerId !== undefined) {
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      seekAtEvent(e);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isScrubbing) return;
      seekAtEvent(e);
    };

    const onPointerUp = () => {
      if (!isScrubbing) return;
      isScrubbing = false;
      document.body.classList.remove('scrubbing-active');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      updatePlayheadPosition();
    };

    if (dom.timelineRuler) {
      dom.timelineRuler.addEventListener('pointerdown', startScrubbing);
    }
    if (dom.timelinePlayheadHead) {
      dom.timelinePlayheadHead.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        startScrubbing(e);
      });
    }
    if (dom.timelineLanesArea) {
      dom.timelineLanesArea.addEventListener('pointerdown', (e) => {
        if (e.target === dom.timelineLanesArea || e.target.classList.contains('track-lane-grid-bg')) {
          if (e.button === 0) {
            startScrubbing(e);
          }
        }
      });
    }
  }

  // --- Zoom Controls ---
  function initZoomControls() {
    const applyZoom = (newZoom) => {
      state.timelineZoom = Math.max(15, Math.min(180, newZoom));
      if (dom.timelineZoomSlider) dom.timelineZoomSlider.value = state.timelineZoom;
      renderAllTracks();
    };

    if (dom.timelineZoomSlider) {
      dom.timelineZoomSlider.addEventListener('input', (e) => {
        applyZoom(parseFloat(e.target.value));
      });
    }

    if (dom.btnZoomIn) {
      dom.btnZoomIn.addEventListener('click', () => {
        applyZoom(state.timelineZoom * 1.25);
      });
    }

    if (dom.btnZoomOut) {
      dom.btnZoomOut.addEventListener('click', () => {
        applyZoom(state.timelineZoom * 0.8);
      });
    }

    if (dom.btnZoomFit) {
      dom.btnZoomFit.addEventListener('click', () => {
        const viewportWidth = dom.timelineScrollViewport ? dom.timelineScrollViewport.clientWidth - 40 : 600;
        const netDur = Math.max(1, calculateNetDuration());
        applyZoom(viewportWidth / netDur);
      });
    }
  }

  // --- NLE Context Menu System ---
  let contextClickedTime = 0;

  function initTimelineContextMenu() {
    if (!dom.timelineContextMenu) return;

    // 1. GLOBAL INTERCEPT: Block browser's native context menu across entire window!
    document.addEventListener(
      'contextmenu',
      (e) => {
        // Allow native context menu ONLY on editable text input / textarea
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();

        // If user is in editor view, open our custom NLE context menu
        if (state.view === 'editor') {
          openContextMenu(e);
        }
      },
      { capture: true }
    );

    function openContextMenu(e) {
      if (!dom.timelineContextMenu) return;

      const clipCard = e.target.closest('.timeline-clip-card, .timeline-audio-clip-card');
      const canvasRect = dom.timelineCanvas ? dom.timelineCanvas.getBoundingClientRect() : { left: 0 };
      const clickOffset = e.clientX - canvasRect.left;
      contextClickedTime = Math.max(0, Math.min(state.duration, pxToTime(clickOffset)));

      if (clipCard) {
        const clipId = clipCard.dataset.clipId;
        selectClip(clipId);
        const sel = getSelectedClip();
        if (sel) {
          const { clip, track } = sel;
          if (dom.contextClipActions) dom.contextClipActions.classList.remove('hidden');
          if (dom.contextTrackActions) dom.contextTrackActions.classList.add('hidden');
          if (dom.contextClipLabel) dom.contextClipLabel.textContent = `${track.name}: ${clip.id.toUpperCase()}`;
          if (dom.contextClipDuration) dom.contextClipDuration.textContent = `${getClipDuration(clip).toFixed(1)}s`;
          if (dom.contextMuteText) {
            dom.contextMuteText.textContent = clip.volume === 0 ? 'Klip Sesini Aç' : 'Klip Sesini Kapat';
          }

          if (dom.contextTrackList) {
            dom.contextTrackList.innerHTML = '';
            state.tracks.forEach((t) => {
              const pill = document.createElement('button');
              const isCurr = t.id === track.id;
              pill.className = `px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-all ${
                isCurr ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`;
              pill.textContent = t.name;
              pill.title = `${t.name} izine taşı`;
              pill.addEventListener('click', () => {
                moveClipToTrack(clip.id, t.id);
                closeContextMenu();
              });
              dom.contextTrackList.appendChild(pill);
            });
          }
        }
      } else {
        if (dom.contextClipActions) dom.contextClipActions.classList.add('hidden');
        if (dom.contextTrackActions) dom.contextTrackActions.classList.remove('hidden');
      }

      const menuWidth = 220;
      const menuHeight = 280;
      const left = Math.min(window.innerWidth - menuWidth - 10, Math.max(10, e.clientX));
      const top = Math.min(window.innerHeight - menuHeight - 10, Math.max(10, e.clientY));

      dom.timelineContextMenu.style.left = `${left}px`;
      dom.timelineContextMenu.style.top = `${top}px`;
      dom.timelineContextMenu.classList.remove('hidden');
      refreshIcons();
    }

    function closeContextMenu() {
      if (dom.timelineContextMenu) {
        dom.timelineContextMenu.classList.add('hidden');
      }
    }

    // Dismiss only on left-click outside context menu
    document.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && dom.timelineContextMenu && !dom.timelineContextMenu.contains(e.target)) {
        closeContextMenu();
      }
    });

    // Dismiss on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    });

    dom.timelineContextMenu.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        closeContextMenu();

        if (action === 'split') {
          splitClipAtPlayhead();
        } else if (action === 'delete') {
          deleteSelectedClip();
        } else if (action === 'duplicate') {
          if (state.selectedClipId) duplicateClip(state.selectedClipId);
        } else if (action === 'mute-toggle') {
          const sel = getSelectedClip();
          if (sel) {
            pushTimelineHistory();
            sel.clip.volume = sel.clip.volume === 0 ? 1.0 : 0;
            renderAllTracks();
            updateClipInspector();
            showToast(`Klip sesi ${sel.clip.volume === 0 ? 'kapatıldı 🔇' : 'açıldı 🔊'}`, 'info');
          }
        } else if (action === 'add-video-track') {
          addTrack('video');
        } else if (action === 'add-audio-track') {
          addTrack('audio');
        } else if (action === 'ripple-close-gaps') {
          pushTimelineHistory();
          state.tracks.forEach((t) => rippleAlignClips(t));
          renderAllTracks();
          updateTimelineDurationBadge();
          showToast('Tüm kanallardaki boşluklar kapatıldı ⚡', 'success');
        } else if (action === 'set-playhead-here') {
          dom.videoPlayer.currentTime = contextClickedTime;
          updatePlayheadPosition();
        }
      });
    });

    dom.timelineContextMenu.querySelectorAll('.context-speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        const sel = getSelectedClip();
        if (sel && speed) {
          pushTimelineHistory();
          sel.clip.speed = speed;
          if (state.isRippleEnabled) rippleAlignClips(sel.track);
          renderAllTracks();
          updateTimelineDurationBadge();
          updateClipInspector();
          showToast(`Klip hızı ${speed}x yapıldı ⚡`, 'info');
        }
        closeContextMenu();
      });
    });
  }

  // --- Toolbar Handlers ---
  function initCapCutTimelineStudio() {
    if (dom.btnSplitClip) dom.btnSplitClip.addEventListener('click', splitClipAtPlayhead);
    if (dom.btnDeleteClip) dom.btnDeleteClip.addEventListener('click', deleteSelectedClip);
    if (dom.btnUndoTimeline) dom.btnUndoTimeline.addEventListener('click', undoTimeline);
    if (dom.btnResetTimeline) dom.btnResetTimeline.addEventListener('click', resetTimeline);
    if (dom.btnAddVideoTrack) dom.btnAddVideoTrack.addEventListener('click', () => addTrack('video'));
    if (dom.btnAddAudioTrack) dom.btnAddAudioTrack.addEventListener('click', () => addTrack('audio'));

    if (dom.btnToggleSnap) {
      dom.btnToggleSnap.addEventListener('click', () => {
        state.isSnappingEnabled = !state.isSnappingEnabled;
        dom.btnToggleSnap.classList.toggle('bg-emerald-500/20', state.isSnappingEnabled);
        dom.btnToggleSnap.classList.toggle('text-emerald-300', state.isSnappingEnabled);
        dom.btnToggleSnap.classList.toggle('border-emerald-500/30', state.isSnappingEnabled);
        dom.btnToggleSnap.classList.toggle('opacity-60', !state.isSnappingEnabled);
        if (dom.snapStatusText) {
          dom.snapStatusText.textContent = `Mıknatıs: ${state.isSnappingEnabled ? 'Açık' : 'Kapalı'}`;
        }
      });
    }

    if (dom.btnToggleRipple) {
      dom.btnToggleRipple.addEventListener('click', () => {
        state.isRippleEnabled = !state.isRippleEnabled;
        dom.btnToggleRipple.classList.toggle('bg-indigo-500/20', state.isRippleEnabled);
        dom.btnToggleRipple.classList.toggle('text-indigo-300', state.isRippleEnabled);
        dom.btnToggleRipple.classList.toggle('border-indigo-500/30', state.isRippleEnabled);
        dom.btnToggleRipple.classList.toggle('opacity-60', !state.isRippleEnabled);
        if (dom.rippleStatusText) {
          dom.rippleStatusText.textContent = `Boşluğu Kapat: ${state.isRippleEnabled ? 'Açık' : 'Kapalı'}`;
        }
        if (state.isRippleEnabled) {
          state.tracks.forEach((t) => rippleAlignClips(t));
          renderAllTracks();
        }
      });
    }

    initZoomControls();
    initTimelineRulerScrubber();
    initClipInspectorListeners();
    initTimelineContextMenu();
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

      // Guard F5 / Ctrl+R to prevent accidental project loss
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyR')) {
        if (state.view === 'editor') {
          e.preventDefault();
          showToast('Kurgunuzun kaybolmaması için sayfa yenileme engellendi. Baştan başlamak için "Yeni Video" butonunu kullanın.', 'info');
          return;
        }
      }

      // Comma (,): Step 1 frame back
      if (e.code === 'Comma') {
        e.preventDefault();
        const fps = (state.metadata && state.metadata.video && state.metadata.video.fps) || 30;
        dom.videoPlayer.currentTime = Math.max(0, dom.videoPlayer.currentTime - (1 / fps));
        return;
      }

      // Period (.): Step 1 frame forward
      if (e.code === 'Period') {
        e.preventDefault();
        const fps = (state.metadata && state.metadata.video && state.metadata.video.fps) || 30;
        dom.videoPlayer.currentTime = Math.min(state.duration, dom.videoPlayer.currentTime + (1 / fps));
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
  // Stüdyo Inspector Sekmeleri (Tabs)
  // ---------------------------------------------------------------------------
  function activateInspectorTab(tabKey) {
    const tabs = [
      { key: 'format', nav: dom.tabNavFormat, panel: dom.tabPanelFormat },
      { key: 'compress', nav: dom.tabNavCompress, panel: dom.tabPanelCompress },
      { key: 'clip', nav: dom.tabNavClip, panel: dom.tabPanelClip },
      { key: 'audio', nav: dom.tabNavAudio, panel: dom.tabPanelAudio },
    ];

    tabs.forEach(({ key, nav, panel }) => {
      if (!nav || !panel) return;
      if (key === tabKey) {
        nav.classList.add('active');
        panel.classList.remove('hidden');
      } else {
        nav.classList.remove('active');
        panel.classList.add('hidden');
      }
    });
    refreshIcons();
  }

  function initInspectorTabs() {
    const tabs = [
      { key: 'format', nav: dom.tabNavFormat },
      { key: 'compress', nav: dom.tabNavCompress },
      { key: 'clip', nav: dom.tabNavClip },
      { key: 'audio', nav: dom.tabNavAudio },
    ];

    tabs.forEach(({ key, nav }) => {
      if (!nav) return;
      nav.addEventListener('click', () => {
        activateInspectorTab(key);
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
    const cutDur = Math.max(0.1, calculateNetDuration());
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

    // Timeline Clips
    const v1Track = getV1Track();
    if (v1Track && v1Track.clips && v1Track.clips.length > 0) {
      parts.push(`${v1Track.clips.length} Klip (${formatTime(calculateNetDuration())})`);
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

    // Multi-track Timeline Tracks & Clips
    const activeTracks = state.tracks.filter((t) => t.clips && t.clips.length > 0);
    if (activeTracks.length > 0) {
      config.timeline_tracks = activeTracks.map((t) => ({
        id: t.id,
        type: t.type,
        clips: t.clips.map((c) => ({
          id: c.id,
          in_point: Math.round(c.in_point * 1000) / 1000,
          out_point: Math.round(c.out_point * 1000) / 1000,
          timeline_start: Math.round(c.timeline_start * 1000) / 1000,
          speed: c.speed || 1.0,
          volume: c.volume !== undefined ? c.volume : 1.0,
        })),
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

    if (dom.btnOpenFolder) {
      dom.btnOpenFolder.onclick = async () => {
        try {
          const res = await fetch(`/api/jobs/${jobEvent.job_id}/open-folder`, { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.status === 'opened') {
            showToast('Dosya konumu Windows Gezgininde açıldı 📁', 'success');
          } else {
            showToast(data.detail || 'Klasör açılamadı', 'error');
          }
        } catch (err) {
          showToast('Klasör açılırken hata oluştu: ' + err.message, 'error');
        }
      };
    }

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
    initCapCutTimelineStudio();
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
