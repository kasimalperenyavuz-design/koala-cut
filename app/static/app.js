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
    theme: localStorage.getItem('koala_theme') || 'dark',
    previewQuality: localStorage.getItem('koala_preview_quality') || '720p',

    // CapCut NLE Multi-Track Timeline
    tracks: [
      { id: 'v1', type: 'video', name: 'V1', visible: true, locked: false, clips: [] },
      { id: 't1', type: 'text', name: 'T1', visible: true, locked: false, clips: [] },
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
    playheadTime: 0.0,
    isPlaying: false,
    isPlayingTrim: false,
    rangeSelection: {
      active: false,
      start: 0,
      end: 0,
    },

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

    // AI Features
    subtitles: {
      id: null,
      segments: [],
      srt_file_path: null,
      burn_subtitles: false,
    },
    subtitleStyle: {
      preset: 'box',
      font: 'Arial',
      fontSize: 22,
      color: '#ffffff',
      position: 'bottom',
    },
    textOverlays: [],
    lastSilenceResult: null,
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
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeIconSun: document.getElementById('theme-icon-sun'),
    themeIconMoon: document.getElementById('theme-icon-moon'),
    btnSaveProject: document.getElementById('btn-save-project'),
    btnLoadProject: document.getElementById('btn-load-project'),
    btnHomeLoadProject: document.getElementById('btn-home-load-project'),
    projectFileInput: document.getElementById('project-file-input'),

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
    selectPreviewQuality: document.getElementById('select-preview-quality'),
    proxyLoadingIndicator: document.getElementById('proxy-loading-indicator'),
    aspectGuideOverlay: document.getElementById('aspect-guide-overlay'),
    videoPreviewWrapper: document.getElementById('video-preview-wrapper'),
    overlayVideoPlayer: document.getElementById('overlay-video-player'),
    transformGizmo: document.getElementById('transform-gizmo'),
    gizmoRotatePin: document.getElementById('gizmo-rotate-pin'),
    gizmoCenterDrag: document.getElementById('gizmo-center-drag'),
    snapGuideX: document.getElementById('snap-guide-x'),
    snapGuideY: document.getElementById('snap-guide-y'),

    // CapCut NLE Timeline Studio Elements
    capcutTimelineStudio: document.getElementById('capcut-timeline-studio'),
    timelineScrollViewport: document.getElementById('timeline-scroll-viewport'),
    timelineCanvas: document.getElementById('timeline-canvas'),
    timelineRuler: document.getElementById('timeline-ruler'),
    rulerCanvas: document.getElementById('ruler-canvas'),
    timelinePlayheadLine: document.getElementById('timeline-playhead-line'),
    timelinePlayheadHead: document.getElementById('timeline-playhead-head'),
    playheadWingLeft: document.getElementById('playhead-wing-left'),
    playheadWingRight: document.getElementById('playhead-wing-right'),
    timelineRangeOverlay: document.getElementById('timeline-range-overlay'),
    timelineRangeToolbar: document.getElementById('timeline-range-toolbar'),
    rangeDurationBadge: document.getElementById('range-duration-badge'),
    btnRangeTrim: document.getElementById('btn-range-trim'),
    btnRangeDelete: document.getElementById('btn-range-delete'),
    btnRangeSplit: document.getElementById('btn-range-split'),
    btnRangeClear: document.getElementById('btn-range-clear'),
    rangeHandleIn: document.getElementById('range-handle-in'),
    rangeHandleOut: document.getElementById('range-handle-out'),
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
    btnAddTextTrack: document.getElementById('btn-add-text-track'),
    btnAddAudioTrack: document.getElementById('btn-add-audio-track'),
    btnImportAudio: document.getElementById('btn-import-audio'),
    btnTabImportAudio: document.getElementById('btn-tab-import-audio'),
    audioFileInput: document.getElementById('audio-file-input'),
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
    sliderClipScale: document.getElementById('slider-clip-scale'),
    inspectorScaleBadge: document.getElementById('inspector-scale-badge'),
    inputClipPosX: document.getElementById('input-clip-pos-x'),
    inputClipPosY: document.getElementById('input-clip-pos-y'),
    sliderClipRotation: document.getElementById('slider-clip-rotation'),
    inspectorRotationBadge: document.getElementById('inspector-rotation-badge'),
    btnResetTransform: document.getElementById('btn-reset-transform'),
    checkClipDenoise: document.getElementById('check-clip-denoise'),
    denoiseLevelContainer: document.getElementById('denoise-level-container'),
    sliderClipOpacity: document.getElementById('slider-clip-opacity'),
    inspectorOpacityBadge: document.getElementById('inspector-opacity-badge'),
    checkClipLoudnorm: document.getElementById('check-clip-loudnorm'),
    loudnormPresetContainer: document.getElementById('loudnorm-preset-container'),
    checkGlobalLoudnorm: document.getElementById('check-global-loudnorm'),
    btnShortcutsOk: document.getElementById('btn-shortcuts-ok'),
    // AI Suite: RNNoise Neural Voice Isolation
    checkClipRnnoise: document.getElementById('check-clip-rnnoise'),
    rnnoiseMixContainer: document.getElementById('rnnoise-mix-container'),
    sliderClipRnnoiseMix: document.getElementById('slider-clip-rnnoise-mix'),
    rnnoiseMixBadge: document.getElementById('rnnoise-mix-badge'),

    // Live Web Audio Preview FX & A/B Controls
    btnAudioAbToggle: document.getElementById('btn-audio-ab-toggle'),
    labelAudioAb: document.getElementById('label-audio-ab'),
    previewVuMeter: document.getElementById('preview-vu-meter'),
    vuMeterBar: document.getElementById('vu-meter-bar'),
    badgeAudioFx: document.getElementById('badge-audio-fx'),
    btnInspectorAudioAb: document.getElementById('btn-inspector-audio-ab'),
    inspectorAudioFxSummary: document.getElementById('inspector-audio-fx-summary'),

    // AI Suite: Smart Silence Removal (Auto Jump Cut)
    btnSmartSilence: document.getElementById('btn-smart-silence'),
    modalSilenceDetector: document.getElementById('modal-silence-detector'),
    btnCloseSilenceModal: document.getElementById('btn-close-silence-modal'),
    sliderSilenceThreshold: document.getElementById('slider-silence-threshold'),
    silenceThresholdBadge: document.getElementById('silence-threshold-badge'),
    selectMinSilence: document.getElementById('select-min-silence'),
    selectSilencePad: document.getElementById('select-silence-pad'),
    btnStartSilenceScan: document.getElementById('btn-start-silence-scan'),
    silenceScanningIndicator: document.getElementById('silence-scanning-indicator'),
    silenceResultsBox: document.getElementById('silence-results-box'),
    silenceCountBadge: document.getElementById('silence-count-badge'),
    silenceSavedBadge: document.getElementById('silence-saved-badge'),
    btnApplySilenceCut: document.getElementById('btn-apply-silence-cut'),
    btnCancelSilenceCut: document.getElementById('btn-cancel-silence-cut'),

    // AI Suite: Faster-Whisper Subtitles
    tabNavSubtitle: document.getElementById('tab-nav-subtitle'),
    tabPanelSubtitle: document.getElementById('tab-panel-subtitle'),
    playerSubtitleOverlay: document.getElementById('player-subtitle-overlay'),
    playerSubtitleText: document.getElementById('player-subtitle-text'),
    selectWhisperModel: document.getElementById('select-whisper-model'),
    selectWhisperLang: document.getElementById('select-whisper-lang'),
    btnGenerateSubtitles: document.getElementById('btn-generate-subtitles'),
    subtitleLoadingBar: document.getElementById('subtitle-loading-bar'),
    subtitleResultsContainer: document.getElementById('subtitle-results-container'),
    checkBurnSubtitles: document.getElementById('check-burn-subtitles'),
    btnDownloadSrt: document.getElementById('btn-download-srt'),
    btnDownloadVtt: document.getElementById('btn-download-vtt'),
    subtitleItemsList: document.getElementById('subtitle-items-list'),

    // Subtitle Typography & Styling
    subtitlePresetsGrid: document.getElementById('subtitle-presets-grid'),
    subtitlePresetBadge: document.getElementById('subtitle-preset-badge'),
    subtitleFontFamily: document.getElementById('subtitle-font-family'),
    subtitleFontSize: document.getElementById('subtitle-font-size'),
    subtitleSizeVal: document.getElementById('subtitle-size-val'),
    subtitleColorPicker: document.getElementById('subtitle-color-picker'),
    subtitlePositionGroup: document.getElementById('subtitle-position-group'),

    // Custom Text Overlays
    tabNavText: document.getElementById('tab-nav-text'),
    tabPanelText: document.getElementById('tab-panel-text'),
    btnAddTextOverlay: document.getElementById('btn-add-text-overlay'),
    textOverlaysList: document.getElementById('text-overlays-list'),
    textOverlaysEmpty: document.getElementById('text-overlays-empty'),
    playerTextOverlaysContainer: document.getElementById('player-text-overlays-container'),

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
      if (dom.btnSaveProject) dom.btnSaveProject.classList.add('hidden');
      dom.uploadProgressCard.classList.add('hidden');
      dom.uploadProgressBar.style.width = '0%';
      dom.videoPlayer.pause();
      dom.outputVideoPlayer.pause();
    } else if (targetView === 'editor') {
      dom.viewEditor.classList.remove('hidden');
      dom.headerStatusBadge.classList.remove('hidden');
      dom.headerFileName.textContent = state.filename;
      dom.btnHeaderNew.classList.remove('hidden');
      if (dom.btnSaveProject) dom.btnSaveProject.classList.remove('hidden');
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

      // Reset AI Subtitles & Silence results for the new media
      state.subtitles = null;
      state.lastSilenceResult = null;
      if (dom.playerSubtitleOverlay) {
        dom.playerSubtitleOverlay.classList.add('hidden');
      }
      if (dom.subtitleResultsContainer) {
        dom.subtitleResultsContainer.classList.add('hidden');
      }
      if (dom.subtitleItemsList) {
        dom.subtitleItemsList.innerHTML = '';
      }

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
      const streamUrl = getPreviewStreamUrl(state.fileId, state.previewQuality);
      dom.videoPlayer.src = streamUrl;
      dom.videoPlayer.load();

      // Automatic fallback if browser hardware decoder struggles with format
      dom.videoPlayer.onerror = () => {
        console.warn('Video element reported playback error, falling back to guaranteed 480p preview proxy...');
        const fallbackUrl = `/api/preview/${state.fileId}?quality=480p`;
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
      state.playheadTime = 0.0;
      currentLoadedFileId = state.fileId;
      const v1 = getV1Track();
      if (v1) {
        v1.clips = [
          createClip(
            'clip-1',
            0.0,
            state.duration,
            0.0,
            1.0,
            1.0,
            state.fileId,
            state.filename,
            streamUrl
          ),
        ];
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
  // NLE Timeline Master Playback & Multi-Video Preview Synchronizer
  // ---------------------------------------------------------------------------
  let currentLoadedFileId = null;
  let currentLoadedOverlayFileId = null;
  let timelinePlaybackRaf = null;
  let lastTimelinePlaybackTime = 0;
  const backgroundAudioPlayers = new Map(); // clipId -> HTMLAudioElement

  function stopAllBackgroundAudio() {
    backgroundAudioPlayers.forEach((player) => {
      try {
        player.pause();
      } catch (_) {}
    });
    backgroundAudioPlayers.clear();
  }

  function syncBackgroundAudio(targetTime, isPlaying, activeVideoClipId = null) {
    const activeAudioIds = new Set();

    (state.tracks || []).forEach((track) => {
      if (track.muted) return; // Muted tracks produce no sound

      (track.clips || []).forEach((clip) => {
        const clipStart = clip.timeline_start || 0;
        const clipDur = getClipDuration(clip);

        if (targetTime >= clipStart && targetTime < clipStart + clipDur) {
          // If this is the active video clip and its video player is unmuted, skip duplicate audio
          if (clip.id === activeVideoClipId && track.type === 'video' && !track.muted) {
            return;
          }

          activeAudioIds.add(clip.id);
          const speed = clip.speed || 1.0;
          const offsetInClip = (targetTime - clipStart) * speed;
          const sourceTime = clip.in_point + offsetInClip;
          const fileId = clip.file_id || state.fileId;
          const streamSrc = clip.preview_url || `/api/media/${fileId}`;
          const vol = Math.max(0, Math.min(1, clip.volume !== undefined ? clip.volume : 1.0));

          let player = backgroundAudioPlayers.get(clip.id);
          if (!player) {
            player = new Audio();
            player.preload = 'auto';
            player.src = streamSrc;
            backgroundAudioPlayers.set(clip.id, player);
          } else if (player.src !== streamSrc && !player.src.endsWith(streamSrc)) {
            player.src = streamSrc;
          }

          player.volume = vol;
          player.playbackRate = speed;

          if (isPlaying && state.isPlaying) {
            if (Math.abs(player.currentTime - sourceTime) > 0.35) {
              player.currentTime = sourceTime;
            }
            if (player.paused) {
              player.play().catch(() => {});
            }
          } else {
            if (!player.paused) {
              player.pause();
            }
            if (Math.abs(player.currentTime - sourceTime) > 0.05) {
              player.currentTime = sourceTime;
            }
          }
        }
      });
    });

    // Pause and clean up any players that are no longer active
    for (const [id, player] of backgroundAudioPlayers.entries()) {
      if (!activeAudioIds.has(id)) {
        try {
          player.pause();
        } catch (_) {}
        backgroundAudioPlayers.delete(id);
      }
    }
  }

  function getActiveVideoClipAtTime(t) {
    const videoTracks = state.tracks
      .filter((trk) => trk.type === 'video' && trk.visible !== false)
      .slice()
      .sort((a, b) => {
        const numA = parseInt(a.id.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.id.replace(/\D/g, '') || '0', 10);
        return numB - numA;
      });

    for (const trk of videoTracks) {
      for (const clip of trk.clips || []) {
        const clipStart = clip.timeline_start || 0;
        const clipDur = getClipDuration(clip);
        if (t >= clipStart && t < clipStart + clipDur) {
          return { clip, track: trk, clipStart, clipDur };
        }
      }
    }
    return null;
  }

  function getActiveVideoLayersAtTime(t) {
    const videoTracks = state.tracks
      .filter((trk) => trk.type === 'video' && trk.visible !== false)
      .slice()
      .sort((a, b) => {
        // En düşük kanal numarası (V1, V2...) en altta, yüksek olan üstte
        const numA = parseInt(a.id.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.id.replace(/\D/g, '') || '0', 10);
        return numA - numB;
      });

    const activeLayers = [];
    for (const trk of videoTracks) {
      for (const clip of trk.clips || []) {
        const s = clip.timeline_start || 0;
        const d = getClipDuration(clip);
        if (t >= s && t < s + d) {
          activeLayers.push({ clip, track: trk, clipStart: s, clipDur: d });
          break;
        }
      }
    }

    if (activeLayers.length === 0) {
      return { base: null, overlay: null };
    }
    if (activeLayers.length === 1) {
      return { base: activeLayers[0], overlay: null };
    }

    // Birden fazla video katmanı çakıştığında:
    // Alttaki kanal = base, üstteki kanal = overlay (PIP)
    return {
      base: activeLayers[0],
      overlay: activeLayers[activeLayers.length - 1],
    };
  }

  function updateTransformGizmoUI() {
    if (!dom.transformGizmo || !dom.videoPreviewWrapper) return;
    const sel = getSelectedClip();
    if (!sel || sel.track.type !== 'video') {
      dom.transformGizmo.classList.add('hidden');
      return;
    }

    const { clip } = sel;
    const clipStart = clip.timeline_start || 0;
    const clipEnd = clipStart + getClipDuration(clip);
    if (state.playheadTime < clipStart - 0.05 || state.playheadTime > clipEnd + 0.05) {
      dom.transformGizmo.classList.add('hidden');
      return;
    }

    const wrapperRect = dom.videoPreviewWrapper.getBoundingClientRect();
    if (wrapperRect.width === 0 || wrapperRect.height === 0) {
      dom.transformGizmo.classList.add('hidden');
      return;
    }

    const vw = wrapperRect.width;
    const vh = wrapperRect.height;
    const scale = clip.scale !== undefined ? clip.scale : 1.0;
    const posX = clip.pos_x || 0;
    const posY = clip.pos_y || 0;
    const rotation = clip.rotation || 0;

    const boxW = Math.max(40, vw * scale * 0.95);
    const boxH = Math.max(30, vh * scale * 0.95);

    const centerX = vw / 2 + (vw * (posX / 100));
    const centerY = vh / 2 + (vh * (posY / 100));

    const left = centerX - boxW / 2;
    const top = centerY - boxH / 2;

    dom.transformGizmo.style.width = `${boxW}px`;
    dom.transformGizmo.style.height = `${boxH}px`;
    dom.transformGizmo.style.left = `${left}px`;
    dom.transformGizmo.style.top = `${top}px`;
    dom.transformGizmo.style.transform = `rotate(${rotation}deg)`;
    dom.transformGizmo.classList.remove('hidden');
  }

  function syncPreviewToTimeline(targetTime, isPlaying = false) {
    state.playheadTime = Math.max(0, Math.min(state.duration, targetTime));

    // Update playhead visual element
    if (dom.timelinePlayheadLine) {
      dom.timelinePlayheadLine.style.left = `${timeToPx(state.playheadTime)}px`;
    }
    if (dom.playerCurrentTime) {
      dom.playerCurrentTime.textContent = formatTime(state.playheadTime);
    }
    updateLiveSubtitleOverlay(state.playheadTime);
    updateLiveTextOverlays(state.playheadTime);

    const { base, overlay } = getActiveVideoLayersAtTime(state.playheadTime);
    let activeVideoClipId = null;

    // 1. Base Video Player Sync
    if (base) {
      const { clip, track } = base;
      activeVideoClipId = clip.id;
      const fileId = clip.file_id || state.fileId;
      const speed = clip.speed || 1.0;
      const offsetInClip = (state.playheadTime - base.clipStart) * speed;
      const sourceTime = clip.in_point + offsetInClip;
      const targetSrc = clip.preview_url || `/api/media/${fileId}`;

      dom.videoPlayer.muted = track.muted || false;
      dom.videoPlayer.volume = Math.max(0, Math.min(1, clip.volume !== undefined ? clip.volume : 1.0));
      updateAudioPreviewFx(clip, track.muted);

      // Apply Base Transform if modified
      const bScale = clip.scale !== undefined ? clip.scale : 1.0;
      const bX = clip.pos_x || 0;
      const bY = clip.pos_y || 0;
      const bRot = clip.rotation || 0;
      if (bScale !== 1.0 || bX !== 0 || bY !== 0 || bRot !== 0) {
        dom.videoPlayer.style.transform = `translate(${bX}%, ${bY}%) scale(${bScale}) rotate(${bRot}deg)`;
      } else {
        dom.videoPlayer.style.transform = '';
      }
      dom.videoPlayer.style.opacity = clip.opacity !== undefined ? clip.opacity : 1.0;

      if (currentLoadedFileId !== fileId) {
        currentLoadedFileId = fileId;
        const wasPlaying = isPlaying || state.isPlaying;

        dom.videoPlayer.src = targetSrc;
        dom.videoPlayer.onloadedmetadata = () => {
          dom.videoPlayer.currentTime = sourceTime;
          dom.videoPlayer.playbackRate = speed;
          if (wasPlaying && state.isPlaying) {
            dom.videoPlayer.play().catch(() => {});
          }
        };
        dom.videoPlayer.load();
      } else {
        dom.videoPlayer.playbackRate = speed;
        if (!isPlaying) {
          dom.videoPlayer.currentTime = sourceTime;
        } else {
          if (Math.abs(dom.videoPlayer.currentTime - sourceTime) > 0.35) {
            dom.videoPlayer.currentTime = sourceTime;
          }
          if (dom.videoPlayer.paused && state.isPlaying) {
            dom.videoPlayer.play().catch(() => {});
          }
        }
      }
    } else {
      if (!dom.videoPlayer.paused && isPlaying) {
        dom.videoPlayer.pause();
      }
      dom.videoPlayer.style.transform = '';
      dom.videoPlayer.style.opacity = '0';
      updateAudioPreviewFx(null);
    }

    // 2. Secondary Overlay Video Player Sync (PIP)
    if (overlay && dom.overlayVideoPlayer) {
      const { clip } = overlay;
      const fileId = clip.file_id || state.fileId;
      const speed = clip.speed || 1.0;
      const offsetInClip = (state.playheadTime - overlay.clipStart) * speed;
      const sourceTime = clip.in_point + offsetInClip;
      const targetSrc = clip.preview_url || `/api/media/${fileId}`;

      dom.overlayVideoPlayer.classList.remove('hidden');

      // Apply PIP Transform (CSS Scale, Position, Rotation)
      const ovScale = clip.scale !== undefined ? clip.scale : 1.0;
      const ovX = clip.pos_x || 0;
      const ovY = clip.pos_y || 0;
      const ovRot = clip.rotation || 0;
      dom.overlayVideoPlayer.style.transform = `translate(${ovX}%, ${ovY}%) scale(${ovScale}) rotate(${ovRot}deg)`;
      dom.overlayVideoPlayer.style.opacity = clip.opacity !== undefined ? clip.opacity : 1.0;

      if (currentLoadedOverlayFileId !== fileId) {
        currentLoadedOverlayFileId = fileId;
        const wasPlaying = isPlaying || state.isPlaying;

        dom.overlayVideoPlayer.src = targetSrc;
        dom.overlayVideoPlayer.onloadedmetadata = () => {
          dom.overlayVideoPlayer.currentTime = sourceTime;
          dom.overlayVideoPlayer.playbackRate = speed;
          if (wasPlaying && state.isPlaying) {
            dom.overlayVideoPlayer.play().catch(() => {});
          }
        };
        dom.overlayVideoPlayer.load();
      } else {
        dom.overlayVideoPlayer.playbackRate = speed;
        if (!isPlaying) {
          dom.overlayVideoPlayer.currentTime = sourceTime;
        } else {
          if (Math.abs(dom.overlayVideoPlayer.currentTime - sourceTime) > 0.35) {
            dom.overlayVideoPlayer.currentTime = sourceTime;
          }
          if (dom.overlayVideoPlayer.paused && state.isPlaying) {
            dom.overlayVideoPlayer.play().catch(() => {});
          }
        }
      }
    } else if (dom.overlayVideoPlayer) {
      dom.overlayVideoPlayer.classList.add('hidden');
      if (!dom.overlayVideoPlayer.paused) {
        dom.overlayVideoPlayer.pause();
      }
    }

    // 3. Update 8-point Transform Gizmo
    updateTransformGizmoUI();

    // 4. Simultaneously sync all background audio
    syncBackgroundAudio(state.playheadTime, isPlaying, activeVideoClipId);
  }

  function startTimelinePlayback() {
    ensureAudioContextActive();
    if (state.playheadTime >= state.duration) {
      state.playheadTime = 0;
    }
    state.isPlaying = true;
    lastTimelinePlaybackTime = performance.now();

    dom.videoCenterBtn.classList.add('opacity-0', 'pointer-events-none');
    dom.transportPlayIcon.setAttribute('data-lucide', 'pause');
    refreshIcons();

    syncPreviewToTimeline(state.playheadTime, true);

    function step(now) {
      if (!state.isPlaying) return;
      const dt = (now - lastTimelinePlaybackTime) / 1000;
      lastTimelinePlaybackTime = now;

      state.playheadTime += dt;
      if (state.playheadTime >= state.duration) {
        stopTimelinePlayback();
        state.playheadTime = state.duration;
        syncPreviewToTimeline(state.playheadTime, false);
        return;
      }

      syncPreviewToTimeline(state.playheadTime, true);
      timelinePlaybackRaf = requestAnimationFrame(step);
    }

    timelinePlaybackRaf = requestAnimationFrame(step);
  }

  function stopTimelinePlayback() {
    state.isPlaying = false;
    if (timelinePlaybackRaf) {
      cancelAnimationFrame(timelinePlaybackRaf);
      timelinePlaybackRaf = null;
    }
    if (!dom.videoPlayer.paused) {
      dom.videoPlayer.pause();
    }
    if (dom.overlayVideoPlayer && !dom.overlayVideoPlayer.paused) {
      dom.overlayVideoPlayer.pause();
    }
    // Pause all background audio players immediately
    backgroundAudioPlayers.forEach((player) => {
      try {
        player.pause();
      } catch (_) {}
    });
    dom.videoCenterBtn.classList.remove('opacity-0', 'pointer-events-none');
    dom.transportPlayIcon.setAttribute('data-lucide', 'play');
    refreshIcons();
  }

  function toggleTimelinePlayback() {
    ensureAudioContextActive();
    if (state.isPlaying) {
      stopTimelinePlayback();
    } else {
      startTimelinePlayback();
    }
  }

  // ---------------------------------------------------------------------------
  // Web Audio API DSP Engine (Live Preview Audio FX & A/B Processing)
  // ---------------------------------------------------------------------------
  const audioEngine = {
    ctx: null,
    sourceNode: null,
    fxInput: null,
    dryGain: null,
    wetGain: null,
    highpassFilter: null,
    lowpassFilter: null,
    notch50Filter: null,
    notch60Filter: null,
    vocalPresenceFilter: null,
    vocalNotchFilter: null,
    loudnormCompressor: null,
    makeupGain: null,
    masterGain: null,
    analyserNode: null,
    analyserDataArray: null,
    isBypassed: false, // false = Enhanced (Wet), true = Original (Dry Bypass)
    isVuRunning: false,
    currentActiveClip: null,
  };

  function initWebAudioEngine() {
    if (audioEngine.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioEngine.ctx = new AudioCtx();

      if (!dom.videoPlayer) return;

      // Single media element source binding
      audioEngine.sourceNode = audioEngine.ctx.createMediaElementSource(dom.videoPlayer);

      // Routing split: Dry (Bypass) and Wet (Enhanced)
      audioEngine.dryGain = audioEngine.ctx.createGain();
      audioEngine.dryGain.gain.value = 0.0;

      audioEngine.fxInput = audioEngine.ctx.createGain();
      audioEngine.fxInput.gain.value = 1.0;

      // 1. Denoise Filters (Highpass, Lowpass, and Peaking hum notches)
      audioEngine.highpassFilter = audioEngine.ctx.createBiquadFilter();
      audioEngine.highpassFilter.type = 'highpass';
      audioEngine.highpassFilter.frequency.value = 10; // Transparent sub-audible pass-through
      audioEngine.highpassFilter.Q.value = 0.707;

      audioEngine.lowpassFilter = audioEngine.ctx.createBiquadFilter();
      audioEngine.lowpassFilter.type = 'lowpass';
      audioEngine.lowpassFilter.frequency.value = 22050; // Transparent ultrasonic pass-through
      audioEngine.lowpassFilter.Q.value = 0.707;

      // Peaking notch filters: gain=0 is mathematically 1.0 (pure wire pass-through)
      audioEngine.notch50Filter = audioEngine.ctx.createBiquadFilter();
      audioEngine.notch50Filter.type = 'peaking';
      audioEngine.notch50Filter.frequency.value = 50;
      audioEngine.notch50Filter.Q.value = 6.0;
      audioEngine.notch50Filter.gain.value = 0.0;

      audioEngine.notch60Filter = audioEngine.ctx.createBiquadFilter();
      audioEngine.notch60Filter.type = 'peaking';
      audioEngine.notch60Filter.frequency.value = 60;
      audioEngine.notch60Filter.Q.value = 6.0;
      audioEngine.notch60Filter.gain.value = 0.0;

      // 2. Vocal / RNNoise Presence & Room Boxiness Shaping
      audioEngine.vocalPresenceFilter = audioEngine.ctx.createBiquadFilter();
      audioEngine.vocalPresenceFilter.type = 'peaking';
      audioEngine.vocalPresenceFilter.frequency.value = 2800;
      audioEngine.vocalPresenceFilter.Q.value = 1.2;
      audioEngine.vocalPresenceFilter.gain.value = 0.0;

      audioEngine.vocalNotchFilter = audioEngine.ctx.createBiquadFilter();
      audioEngine.vocalNotchFilter.type = 'peaking';
      audioEngine.vocalNotchFilter.frequency.value = 350;
      audioEngine.vocalNotchFilter.Q.value = 1.0;
      audioEngine.vocalNotchFilter.gain.value = 0.0;

      // 3. Loudnorm Dynamics Compressor & Makeup Gain
      audioEngine.loudnormCompressor = audioEngine.ctx.createDynamicsCompressor();
      audioEngine.loudnormCompressor.threshold.value = 0;
      audioEngine.loudnormCompressor.ratio.value = 1;
      audioEngine.loudnormCompressor.knee.value = 0;
      audioEngine.loudnormCompressor.attack.value = 0.003;
      audioEngine.loudnormCompressor.release.value = 0.25;

      audioEngine.makeupGain = audioEngine.ctx.createGain();
      audioEngine.makeupGain.gain.value = 1.0;

      audioEngine.wetGain = audioEngine.ctx.createGain();
      audioEngine.wetGain.gain.value = 1.0;

      // Master output & Analyser
      audioEngine.masterGain = audioEngine.ctx.createGain();
      audioEngine.masterGain.gain.value = 1.0;

      audioEngine.analyserNode = audioEngine.ctx.createAnalyser();
      audioEngine.analyserNode.fftSize = 64;
      audioEngine.analyserDataArray = new Uint8Array(audioEngine.analyserNode.frequencyBinCount);

      // Connect FX Graph:
      // Dry path: Source -> Dry -> Master
      audioEngine.sourceNode.connect(audioEngine.dryGain);
      audioEngine.dryGain.connect(audioEngine.masterGain);

      // Wet path: Source -> FX Input -> Filters -> Compressor -> Makeup -> Wet -> Master
      audioEngine.sourceNode.connect(audioEngine.fxInput);
      audioEngine.fxInput.connect(audioEngine.highpassFilter);
      audioEngine.highpassFilter.connect(audioEngine.lowpassFilter);
      audioEngine.lowpassFilter.connect(audioEngine.notch50Filter);
      audioEngine.notch50Filter.connect(audioEngine.notch60Filter);
      audioEngine.notch60Filter.connect(audioEngine.vocalNotchFilter);
      audioEngine.vocalNotchFilter.connect(audioEngine.vocalPresenceFilter);
      audioEngine.vocalPresenceFilter.connect(audioEngine.loudnormCompressor);
      audioEngine.loudnormCompressor.connect(audioEngine.makeupGain);
      audioEngine.makeupGain.connect(audioEngine.wetGain);
      audioEngine.wetGain.connect(audioEngine.masterGain);

      // Output to speakers and analyser simultaneously
      audioEngine.masterGain.connect(audioEngine.ctx.destination);
      audioEngine.masterGain.connect(audioEngine.analyserNode);

      startVuMeterLoop();
    } catch (err) {
      console.warn('Web Audio initialization error:', err);
    }
  }

  function ensureAudioContextActive() {
    if (!audioEngine.ctx) {
      initWebAudioEngine();
    }
    if (audioEngine.ctx && audioEngine.ctx.state !== 'running') {
      audioEngine.ctx.resume().catch(() => {});
    }
  }

  function updateAudioPreviewFx(clip, isMuted) {
    if (!audioEngine.ctx) {
      initWebAudioEngine();
    }
    if (!audioEngine.ctx) return;

    audioEngine.currentActiveClip = clip;
    const now = audioEngine.ctx.currentTime || 0;

    try {
      // 1. Denoise BiquadFilters
      if (clip && clip.denoise) {
        const lvl = clip.denoise_level || 'medium';
        const hpFreq = lvl === 'high' ? 180 : lvl === 'low' ? 80 : 120;
        const lpFreq = lvl === 'high' ? 5500 : lvl === 'low' ? 9000 : 7500;
        audioEngine.highpassFilter.frequency.setValueAtTime(hpFreq, now);
        audioEngine.highpassFilter.Q.setValueAtTime(0.707, now);
        audioEngine.lowpassFilter.frequency.setValueAtTime(lpFreq, now);
        audioEngine.lowpassFilter.Q.setValueAtTime(0.707, now);
        audioEngine.notch50Filter.gain.setValueAtTime(-24.0, now);
        audioEngine.notch60Filter.gain.setValueAtTime(-24.0, now);
      } else {
        audioEngine.highpassFilter.frequency.setValueAtTime(10, now);
        audioEngine.highpassFilter.Q.setValueAtTime(0.707, now);
        audioEngine.lowpassFilter.frequency.setValueAtTime(22050, now);
        audioEngine.lowpassFilter.Q.setValueAtTime(0.707, now);
        audioEngine.notch50Filter.gain.setValueAtTime(0.0, now);
        audioEngine.notch60Filter.gain.setValueAtTime(0.0, now);
      }

      // 2. Vocal Isolation / RNNoise Presence Shaping
      if (clip && clip.neural_voice_isolation) {
        const mix = clip.voice_isolation_mix !== undefined ? clip.voice_isolation_mix : 1.0;
        audioEngine.vocalPresenceFilter.gain.setValueAtTime(4.0 * mix, now);
        audioEngine.vocalNotchFilter.gain.setValueAtTime(-3.5 * mix, now);
      } else {
        audioEngine.vocalPresenceFilter.gain.setValueAtTime(0.0, now);
        audioEngine.vocalNotchFilter.gain.setValueAtTime(0.0, now);
      }

      // 3. Loudnorm / LUFS Dynamics Compression
      if (clip && clip.normalize_audio) {
        const lufs = clip.target_lufs !== undefined ? clip.target_lufs : -14.0;
        if (lufs >= -14.5) {
          audioEngine.loudnormCompressor.threshold.setValueAtTime(-16.0, now);
          audioEngine.loudnormCompressor.ratio.setValueAtTime(4.0, now);
          audioEngine.loudnormCompressor.knee.setValueAtTime(10.0, now);
          audioEngine.makeupGain.gain.setValueAtTime(1.35, now);
        } else if (lufs >= -19.5) {
          audioEngine.loudnormCompressor.threshold.setValueAtTime(-18.0, now);
          audioEngine.loudnormCompressor.ratio.setValueAtTime(3.5, now);
          audioEngine.loudnormCompressor.knee.setValueAtTime(8.0, now);
          audioEngine.makeupGain.gain.setValueAtTime(1.20, now);
        } else {
          audioEngine.loudnormCompressor.threshold.setValueAtTime(-24.0, now);
          audioEngine.loudnormCompressor.ratio.setValueAtTime(2.5, now);
          audioEngine.loudnormCompressor.knee.setValueAtTime(6.0, now);
          audioEngine.makeupGain.gain.setValueAtTime(1.0, now);
        }
      } else {
        audioEngine.loudnormCompressor.threshold.setValueAtTime(0.0, now);
        audioEngine.loudnormCompressor.ratio.setValueAtTime(1.0, now);
        audioEngine.makeupGain.gain.setValueAtTime(1.0, now);
      }

      // 4. Master Volume & Muting
      const effectiveMuted = isMuted !== undefined ? isMuted : (dom.videoPlayer ? dom.videoPlayer.muted : false);
      const vol = effectiveMuted ? 0.0 : Math.max(0, Math.min(1, clip && clip.volume !== undefined ? clip.volume : 1.0));
      audioEngine.masterGain.gain.setValueAtTime(vol, now);

      // 5. Dry / Wet Routing
      if (audioEngine.isBypassed) {
        audioEngine.dryGain.gain.setValueAtTime(1.0, now);
        audioEngine.wetGain.gain.setValueAtTime(0.0, now);
      } else {
        audioEngine.dryGain.gain.setValueAtTime(0.0, now);
        audioEngine.wetGain.gain.setValueAtTime(1.0, now);
      }

      // Update UI Indicators
      updateAudioFxUiIndicators(clip);
    } catch (err) {
      console.warn('Error applying Web Audio preview FX:', err);
    }
  }

  function updateAudioFxUiIndicators(clip) {
    if (!dom.labelAudioAb) return;

    if (audioEngine.isBypassed) {
      dom.labelAudioAb.textContent = 'A/B: Orijinal (Bypass)';
      if (dom.btnAudioAbToggle) {
        dom.btnAudioAbToggle.className = 'flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-mono text-amber-300 transition-colors cursor-pointer select-none';
      }
      if (dom.badgeAudioFx) {
        dom.badgeAudioFx.textContent = 'BYPASS';
        dom.badgeAudioFx.className = 'text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30';
      }
      if (dom.inspectorAudioFxSummary) {
        dom.inspectorAudioFxSummary.textContent = 'Bypass: Orijinal ham ses dinleniyor';
      }
      return;
    }

    // Enhanced Mode
    dom.labelAudioAb.textContent = 'A/B: İyileştirilmiş';
    if (dom.btnAudioAbToggle) {
      dom.btnAudioAbToggle.className = 'flex items-center gap-1 px-2 py-1 rounded bg-[#18181c] hover:bg-[#222226] border border-white/10 text-[11px] font-mono text-emerald-400 transition-colors cursor-pointer select-none';
    }

    const activeFx = [];
    if (clip && clip.denoise) {
      const lvl = clip.denoise_level === 'high' ? 'Yüksek' : clip.denoise_level === 'low' ? 'Düşük' : 'Orta';
      activeFx.push(`Denoise (${lvl})`);
    }
    if (clip && clip.normalize_audio) {
      activeFx.push(`${clip.target_lufs || -14} LUFS`);
    }
    if (clip && clip.neural_voice_isolation) {
      const pct = Math.round((clip.voice_isolation_mix !== undefined ? clip.voice_isolation_mix : 1.0) * 100);
      activeFx.push(`RNNoise (%${pct})`);
    }

    if (activeFx.length === 0) {
      if (dom.badgeAudioFx) {
        dom.badgeAudioFx.textContent = 'FX: KAPALI';
        dom.badgeAudioFx.className = 'text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-400 border border-white/10';
      }
      if (dom.inspectorAudioFxSummary) {
        dom.inspectorAudioFxSummary.textContent = 'Filtreler kapalı (Düz ses)';
      }
    } else {
      if (dom.badgeAudioFx) {
        dom.badgeAudioFx.textContent = `FX: ${activeFx.length}`;
        dom.badgeAudioFx.className = 'text-[9px] font-mono px-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      }
      if (dom.inspectorAudioFxSummary) {
        dom.inspectorAudioFxSummary.textContent = activeFx.join(' • ');
      }
    }
  }

  function toggleAudioAbBypass() {
    audioEngine.isBypassed = !audioEngine.isBypassed;
    ensureAudioContextActive();
    const sel = getSelectedClip();
    updateAudioPreviewFx(sel ? sel.clip : audioEngine.currentActiveClip);

    if (audioEngine.isBypassed) {
      showToast('A/B Karşılaştırma: Orijinal Ham Ses (Filtreler Devre Dışı)', 'info');
    } else {
      showToast('A/B Karşılaştırma: İyileştirilmiş Ses Aktif 🎧', 'success');
    }
  }

  function startVuMeterLoop() {
    if (audioEngine.isVuRunning) return;
    audioEngine.isVuRunning = true;

    function drawVu() {
      if (audioEngine.analyserNode && dom.vuMeterBar) {
        if (dom.videoPlayer && !dom.videoPlayer.paused && !dom.videoPlayer.muted) {
          audioEngine.analyserNode.getByteFrequencyData(audioEngine.analyserDataArray);
          let sum = 0;
          const count = audioEngine.analyserDataArray.length;
          for (let i = 0; i < count; i++) {
            sum += audioEngine.analyserDataArray[i];
          }
          const avg = sum / (count || 1);
          const pct = Math.min(100, Math.round(Math.pow(avg / 128, 0.85) * 100));
          dom.vuMeterBar.style.width = `${pct}%`;
        } else {
          dom.vuMeterBar.style.width = '0%';
        }
      }
      requestAnimationFrame(drawVu);
    }
    requestAnimationFrame(drawVu);
  }

  // ---------------------------------------------------------------------------
  // Video Player Transport Controls
  // ---------------------------------------------------------------------------
  function initPlayerControls() {
    dom.videoCenterBtn.addEventListener('click', () => {
      ensureAudioContextActive();
      toggleTimelinePlayback();
    });
    dom.btnPlayPause.addEventListener('click', () => {
      ensureAudioContextActive();
      toggleTimelinePlayback();
    });
    dom.videoPlayer.addEventListener('click', () => {
      ensureAudioContextActive();
      toggleTimelinePlayback();
    });

    dom.videoPlayer.addEventListener('play', () => {
      ensureAudioContextActive();
      dom.videoCenterBtn.classList.add('opacity-0', 'pointer-events-none');
      dom.transportPlayIcon.setAttribute('data-lucide', 'pause');
      refreshIcons();
    });

    dom.videoPlayer.addEventListener('pause', () => {
      if (!state.isPlaying) {
        dom.videoCenterBtn.classList.remove('opacity-0', 'pointer-events-none');
        dom.transportPlayIcon.setAttribute('data-lucide', 'play');
        refreshIcons();
      }
    });

    dom.videoPlayer.addEventListener('loadedmetadata', () => {
      if (dom.playerTotalDuration) {
        dom.playerTotalDuration.textContent = formatTime(state.duration || dom.videoPlayer.duration);
      }
    });

    // Mute / Unmute
    dom.btnPlayerMute.addEventListener('click', () => {
      dom.videoPlayer.muted = !dom.videoPlayer.muted;
      dom.playerVolumeIcon.setAttribute(
        'data-lucide',
        dom.videoPlayer.muted ? 'volume-x' : 'volume-2'
      );
      updateAudioPreviewFx(audioEngine.currentActiveClip, dom.videoPlayer.muted);
      refreshIcons();
    });

    // A/B Audio Comparison Toggles
    if (dom.btnAudioAbToggle) {
      dom.btnAudioAbToggle.addEventListener('click', toggleAudioAbBypass);
    }
    if (dom.btnInspectorAudioAb) {
      dom.btnInspectorAudioAb.addEventListener('click', toggleAudioAbBypass);
    }

    // Fullscreen
    dom.btnPlayerFs.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        dom.videoPlayer.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Wake up Web Audio on first user interaction anywhere
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach((evtName) => {
      window.addEventListener(evtName, ensureAudioContextActive, { once: true, passive: true });
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

  function createClip(id, in_point, out_point, timeline_start = 0.0, speed = 1.0, volume = 1.0, file_id = null, filename = null, preview_url = null, opts = {}) {
    const fid = file_id || state.fileId;
    return {
      id,
      in_point: Math.round(in_point * 1000) / 1000,
      out_point: Math.round(out_point * 1000) / 1000,
      timeline_start: Math.round(timeline_start * 1000) / 1000,
      speed: speed || 1.0,
      volume: volume !== undefined ? volume : 1.0,
      file_id: fid,
      filename: filename || (state.filename ? state.filename : null),
      preview_url: preview_url || (fid ? `/api/media/${fid}` : null),
      // Phase 2: Audio Suite
      denoise: opts.denoise || false,
      denoise_level: opts.denoise_level || 'medium',
      normalize_audio: opts.normalize_audio || false,
      target_lufs: opts.target_lufs || -14.0,
      // Phase 3: Transform & PIP
      scale: opts.scale !== undefined ? opts.scale : 1.0,
      pos_x: opts.pos_x !== undefined ? opts.pos_x : 0.0,
      pos_y: opts.pos_y !== undefined ? opts.pos_y : 0.0,
      rotation: opts.rotation !== undefined ? opts.rotation : 0.0,
      opacity: opts.opacity !== undefined ? opts.opacity : 1.0,
      // AI Suite: RNNoise Neural Voice Isolation
      neural_voice_isolation: opts.neural_voice_isolation || false,
      voice_isolation_mix: opts.voice_isolation_mix !== undefined ? opts.voice_isolation_mix : 1.0,
      get duration() {
        return getClipDuration(this);
      },
    };
  }

  function extractClipOpts(clip) {
    if (!clip) return {};
    return {
      denoise: clip.denoise || false,
      denoise_level: clip.denoise_level || 'medium',
      normalize_audio: clip.normalize_audio || false,
      target_lufs: clip.target_lufs || -14.0,
      scale: clip.scale !== undefined ? clip.scale : 1.0,
      pos_x: clip.pos_x !== undefined ? clip.pos_x : 0.0,
      pos_y: clip.pos_y !== undefined ? clip.pos_y : 0.0,
      rotation: clip.rotation !== undefined ? clip.rotation : 0.0,
      opacity: clip.opacity !== undefined ? clip.opacity : 1.0,
      neural_voice_isolation: clip.neural_voice_isolation || false,
      voice_isolation_mix: clip.voice_isolation_mix !== undefined ? clip.voice_isolation_mix : 1.0,
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

    const snapPoints = [0, state.playheadTime];
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

    const isLight = document.documentElement.getAttribute('data-theme') === 'light' || document.documentElement.classList.contains('light');
    ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.45)';
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255, 255, 255, 0.2)';
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
      const isText = track.type === 'text';
      const isSelected = state.selectedTrackId === track.id;
      const isBaseTrack = track.id === 'v1' || track.id === 'a1' || track.id === 't1';

      const headerEl = document.createElement('div');
      headerEl.className = `h-[46px] px-3 border-b border-white/5 flex items-center justify-between transition-colors ${
        isSelected
          ? 'bg-[#18181f] border-l-2 border-l-[#3d7eff]'
          : 'bg-[#0e0e11]'
      }`;
      headerEl.dataset.trackId = track.id;

      const iconName = isVideo ? 'film' : (isText ? 'type' : 'volume-2');
      const iconColor = isVideo ? 'text-[#70a5ff]' : (isText ? 'text-indigo-400' : 'text-slate-400');
      const badgeColor = isVideo ? 'text-[#70a5ff]' : (isText ? 'text-indigo-300' : 'text-slate-300');

      headerEl.innerHTML = `
        <div class="flex items-center gap-1.5 min-w-0">
          <i data-lucide="${iconName}" class="w-3.5 h-3.5 ${iconColor} flex-shrink-0"></i>
          <span class="text-xs font-mono font-bold ${badgeColor}">${track.name}</span>
        </div>
        <div class="flex items-center gap-1">
          ${
            isVideo || isText
              ? `
            <button class="btn-track-toggle-vis p-1 rounded hover:bg-white/10 ${track.visible === false ? 'text-slate-600' : (isText ? 'text-indigo-300' : 'text-slate-300')}" title="${track.visible === false ? 'İzi Göster' : 'İzi Gizle'}">
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
          syncPreviewToTimeline(state.playheadTime, false);
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
      const isText = track.type === 'text';
      const laneEl = document.createElement('div');
      laneEl.className = `track-lane-row ${
        track.locked ? 'opacity-60 pointer-events-none' : ''
      }`;
      laneEl.dataset.trackId = track.id;

      (track.clips || []).forEach((clip, index) => {
        const clipDuration = getClipDuration(clip);
        const clipEl = document.createElement('div');
        const isSelected = clip.id === state.selectedClipId;

        if (isVideo) {
          clipEl.className = `timeline-clip-card ${isSelected ? 'selected' : ''}`;
        } else if (isText) {
          clipEl.className = `timeline-text-clip-card ${isSelected ? 'selected' : ''}`;
        } else {
          clipEl.className = `timeline-audio-clip-card ${isSelected ? 'selected' : ''}`;
        }

        clipEl.dataset.clipId = clip.id;
        clipEl.dataset.trackId = track.id;
        clipEl.style.left = `${timeToPx(clip.timeline_start)}px`;
        clipEl.style.width = `${Math.max(28, timeToPx(clipDuration))}px`;

        const durStr = clipDuration.toFixed(1);
        const clipTitle = clip.filename ? clip.filename : `${isVideo ? 'Klip' : (isText ? 'Metin' : 'Ses')} ${index + 1}`;
        const speedBadge =
          clip.speed && clip.speed !== 1.0
            ? `<span class="text-[9px] px-1 py-0.2 rounded bg-black/40 text-amber-300 border border-amber-400/40 font-mono font-bold">${clip.speed}x</span>`
            : '';
        const volBadge =
          !isVideo && !isText && clip.volume !== undefined && clip.volume !== 1.0
            ? `<span class="text-[9px] px-1 py-0.2 rounded bg-black/40 text-cyan-300 border border-cyan-400/40 font-mono font-bold">%${Math.round(clip.volume * 100)}</span>`
            : '';

        if (isVideo) {
          clipEl.innerHTML = `
            <div class="clip-trim-handle clip-trim-handle-left" data-action="trim-left" title="Klibin başını kırp"></div>
            <div class="flex items-center gap-1.5 min-w-0 flex-1 px-1 pointer-events-none select-none">
              <i data-lucide="film" class="w-3.5 h-3.5 text-indigo-200 flex-shrink-0 drop-shadow"></i>
              <span class="text-xs font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">${clipTitle}</span>
              ${speedBadge}
            </div>
            <div class="flex items-center gap-1 text-[10px] font-mono font-bold text-indigo-100 bg-black/40 px-1.5 py-0.5 rounded border border-white/20 pointer-events-none flex-shrink-0 mr-1">
              <span>${durStr}s</span>
            </div>
            <div class="clip-trim-handle clip-trim-handle-right" data-action="trim-right" title="Klibin sonunu kırp"></div>
          `;
        } else if (isText) {
          const textPreview = clip.text ? clip.text : clipTitle;
          clipEl.innerHTML = `
            <div class="clip-trim-handle clip-trim-handle-left" data-action="trim-left" title="Metin başlangıcını ayarla"></div>
            <div class="flex items-center gap-1.5 min-w-0 flex-1 px-1 pointer-events-none select-none">
              <i data-lucide="type" class="w-3.5 h-3.5 text-indigo-300 flex-shrink-0 drop-shadow"></i>
              <span class="text-xs font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">${textPreview}</span>
            </div>
            <div class="flex items-center gap-1 text-[10px] font-mono font-bold text-purple-100 bg-black/40 px-1.5 py-0.5 rounded border border-white/20 pointer-events-none flex-shrink-0 mr-1">
              <span>${durStr}s</span>
            </div>
            <div class="clip-trim-handle clip-trim-handle-right" data-action="trim-right" title="Metin süresini ayarla"></div>
          `;
        } else {
          clipEl.innerHTML = `
            <div class="clip-trim-handle clip-trim-handle-left" data-action="trim-left" title="Sesin başını kırp"></div>
            <div class="flex items-center gap-1.5 min-w-0 flex-1 px-1 pointer-events-none select-none">
              <i data-lucide="volume-2" class="w-3.5 h-3.5 text-cyan-200 flex-shrink-0 drop-shadow"></i>
              <span class="text-xs font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">${clipTitle}</span>
              ${volBadge}
            </div>
            <div class="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-100 bg-black/40 px-1.5 py-0.5 rounded border border-white/20 pointer-events-none flex-shrink-0 mr-1">
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

      if (track.type === 'text') {
        const origDuration = origOut - origIn;
        const origEnd = origTimelineStart + origDuration;
        if (edge === 'left') {
          let newStart = origTimelineStart + dSeconds;
          newStart = Math.max(0, Math.min(origEnd - 0.2, newStart));
          newStart = snapTime(newStart, 0.15);
          clip.timeline_start = Math.round(newStart * 100) / 100;
          clip.in_point = 0.0;
          clip.out_point = Math.round((origEnd - clip.timeline_start) * 100) / 100;
        } else if (edge === 'right') {
          let newDur = Math.max(0.2, origDuration + dSeconds);
          newDur = snapTime(origTimelineStart + newDur, 0.15) - origTimelineStart;
          newDur = Math.max(0.2, newDur);
          clip.in_point = 0.0;
          clip.out_point = Math.round(newDur * 100) / 100;
        }
        const overlay = (state.textOverlays || []).find((o) => o.id === clip.id);
        if (overlay) {
          overlay.start_time = Math.round(clip.timeline_start * 10) / 10;
          overlay.end_time = Math.round((clip.timeline_start + getClipDuration(clip)) * 10) / 10;
          updateTextOverlayInputsFromState(overlay);
          updateLiveTextOverlays(state.playheadTime);
        }
      } else {
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
      }

      renderAllTracks();
      updateTimelineDurationBadge();
      updateClipInspector();
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (track.type !== 'text' && state.isRippleEnabled) {
        rippleAlignClips(track);
      }
      renderAllTracks();
      updateTimelineDurationBadge();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // --- Clip Position Dragging on Track (Horizontal + Vertical Cross-Track) ---
  function initClipDragging(clip, track, downEvent) {
    downEvent.preventDefault();
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    const origTimelineStart = clip.timeline_start;
    let hasMoved = false;
    let currentTargetTrack = track;

    function getLaneUnderPointer(clientY) {
      if (!dom.timelineLanesArea) return null;
      const lanes = dom.timelineLanesArea.querySelectorAll('.track-lane-row');
      for (const lane of lanes) {
        const r = lane.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const tid = lane.dataset.trackId;
          const trk = state.tracks.find((t) => t.id === tid);
          if (trk && trk.type === track.type && !trk.locked) {
            return { laneEl: lane, track: trk };
          }
        }
      }
      return null;
    }

    function clearLaneHighlights() {
      if (!dom.timelineLanesArea) return;
      dom.timelineLanesArea.querySelectorAll('.track-lane-row').forEach((l) => {
        l.classList.remove('lane-drop-hover');
      });
    }

    const onPointerMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if ((Math.abs(dx) > 3 || Math.abs(dy) > 3) && !hasMoved) {
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

      if (track.type === 'text') {
        const overlay = (state.textOverlays || []).find((o) => o.id === clip.id);
        if (overlay) {
          const dur = getClipDuration(clip);
          overlay.start_time = Math.round(clip.timeline_start * 10) / 10;
          overlay.end_time = Math.round((clip.timeline_start + dur) * 10) / 10;
          updateTextOverlayInputsFromState(overlay);
          updateLiveTextOverlays(state.playheadTime);
        }
      }

      // Check vertical track lane under cursor
      const hit = getLaneUnderPointer(e.clientY);
      clearLaneHighlights();
      if (hit) {
        currentTargetTrack = hit.track;
        if (hit.track.id !== track.id) {
          hit.laneEl.classList.add('lane-drop-hover');
        }
      } else {
        currentTargetTrack = track;
      }

      renderTrackLanes();

      // Find dragging element and add is-dragging style
      const draggingEl = dom.timelineLanesArea.querySelector(`[data-clip-id="${clip.id}"]`);
      if (draggingEl) {
        draggingEl.classList.add('is-dragging');
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      clearLaneHighlights();
      if (dom.timelineSnapGuide) {
        dom.timelineSnapGuide.classList.add('hidden');
      }

      if (hasMoved) {
        if (track.type === 'text') {
          const overlay = (state.textOverlays || []).find((o) => o.id === clip.id);
          if (overlay) {
            const dur = getClipDuration(clip);
            overlay.start_time = Math.round(clip.timeline_start * 10) / 10;
            overlay.end_time = Math.round((clip.timeline_start + dur) * 10) / 10;
            updateTextOverlayInputsFromState(overlay);
            updateLiveTextOverlays(state.playheadTime);
          }
        }

        if (currentTargetTrack && currentTargetTrack.id !== track.id) {
          // Move clip across tracks!
          track.clips = track.clips.filter((c) => c.id !== clip.id);
          currentTargetTrack.clips.push(clip);
          currentTargetTrack.clips.sort((a, b) => a.timeline_start - b.timeline_start);
          state.selectedTrackId = currentTargetTrack.id;
          state.selectedClipId = clip.id;
          showToast(`Klip ${currentTargetTrack.name} kanalına taşındı.`, 'info');
        } else {
          track.clips.sort((a, b) => a.timeline_start - b.timeline_start);
          if (track.type !== 'text' && state.isRippleEnabled) {
            rippleAlignClips(track);
          }
        }

        renderAllTracks();
        updateTimelineDurationBadge();
        updateClipInspector();
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

    // If range selection is active, split at the secondary and primary range boundary points!
    if (state.rangeSelection && state.rangeSelection.active) {
      splitAtRangeSelection();
      return;
    }

    const cur = state.playheadTime;

    const track = state.tracks.find((t) => t.id === state.selectedTrackId) || getV1Track();
    if (!track || !track.clips || track.clips.length === 0) return;

    const targetIdx = track.clips.findIndex((c) => {
      const start = c.timeline_start || 0;
      const dur = getClipDuration(c);
      return cur > start + 0.05 && cur < start + dur - 0.05;
    });

    if (targetIdx === -1) {
      showToast('İmleç seçili kanalda bir klibin üzerinde değil veya sınırında. Bölme yapılamaz.', 'info');
      return;
    }

    pushTimelineHistory();
    const targetClip = track.clips[targetIdx];
    const speed = targetClip.speed || 1.0;
    const splitOffsetInSource = (cur - targetClip.timeline_start) * speed;
    const splitSourcePoint = Math.round((targetClip.in_point + splitOffsetInSource) * 100) / 100;
    const clipOpts = extractClipOpts(targetClip);

    const clipA = createClip(
      `clip-${++clipCounter}`,
      targetClip.in_point,
      splitSourcePoint,
      targetClip.timeline_start,
      targetClip.speed,
      targetClip.volume,
      targetClip.file_id,
      targetClip.filename,
      targetClip.preview_url,
      clipOpts
    );
    const clipB = createClip(
      `clip-${++clipCounter}`,
      splitSourcePoint,
      targetClip.out_point,
      Math.round(cur * 100) / 100,
      targetClip.speed,
      targetClip.volume,
      targetClip.file_id,
      targetClip.filename,
      targetClip.preview_url,
      clipOpts
    );

    track.clips.splice(targetIdx, 1, clipA, clipB);
    if (state.isRippleEnabled) rippleAlignClips(track);

    selectClip(clipB.id);
    renderAllTracks();
    updateTimelineDurationBadge();
    showToast(`Klip ${formatTime(cur)} noktasından bölündü (Split) ✂️`, 'success');
  }

  function selectClip(clipId) {
    state.selectedClipId = clipId;
    const sel = getSelectedClip();
    if (sel) {
      state.selectedTrackId = sel.track.id;
      syncPreviewToTimeline(sel.clip.timeline_start, false);

      if (sel.track.type === 'text') {
        activateInspectorTab('text');
        if (dom.textOverlaysList) {
          const card = dom.textOverlaysList.querySelector(`[data-overlay-id="${clipId}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            card.classList.add('ring-2', 'ring-indigo-500');
            setTimeout(() => card.classList.remove('ring-2', 'ring-indigo-500'), 1500);
          }
        }
        if (dom.btnDeleteClip) {
          dom.btnDeleteClip.classList.remove('opacity-50', 'pointer-events-none');
        }
        renderAllTracks();
        return;
      }
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

      if (track.type === 'text') {
        state.textOverlays = (state.textOverlays || []).filter((o) => o.id !== removed.id);
        renderTextOverlaysList();
        updateLiveTextOverlays(state.playheadTime);
      } else if (state.isRippleEnabled) {
        rippleAlignClips(track);
      }

      renderAllTracks();
      updateTimelineDurationBadge();
      updateClipInspector();
      showToast(track.type === 'text' ? 'Metin katmanı silindi 🗑️' : `Klip silindi (${formatTime(removed.in_point)} - ${formatTime(removed.out_point)}) 🗑️`, 'success');
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
      clip.volume,
      clip.file_id,
      clip.filename,
      clip.preview_url,
      extractClipOpts(clip)
    );
    track.clips.push(newClip);
    track.clips.sort((a, b) => a.timeline_start - b.timeline_start);
    selectClip(newId);
    renderAllTracks();
    updateTimelineDurationBadge();
    showToast('Klip çoğaltıldı (Duplicate) 📋', 'success');
  }

  function moveClipToTrack(clipId, targetTrackId) {
    let sourceTrack = null;
    let clip = null;
    for (const t of state.tracks) {
      const c = (t.clips || []).find((x) => x.id === clipId);
      if (c) {
        sourceTrack = t;
        clip = c;
        break;
      }
    }
    if (!clip || !sourceTrack) return;
    if (sourceTrack.id === targetTrackId) return;
    const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) return;

    pushTimelineHistory();
    sourceTrack.clips = sourceTrack.clips.filter((c) => c.id !== clipId);
    targetTrack.clips.push(clip);
    targetTrack.clips.sort((a, b) => a.timeline_start - b.timeline_start);
    state.selectedClipId = clipId;
    state.selectedTrackId = targetTrackId;
    renderAllTracks();
    updateClipInspector();
    showToast(`Klip ${targetTrack.name} kanalına taşındı.`, 'info');
  }

  function getTextTrack() {
    let track = state.tracks.find((t) => t.type === 'text');
    if (!track) {
      track = { id: 't1', type: 'text', name: 'T1', visible: true, locked: false, clips: [] };
      const firstAudioIdx = state.tracks.findIndex((t) => t.type === 'audio');
      if (firstAudioIdx !== -1) {
        state.tracks.splice(firstAudioIdx, 0, track);
      } else {
        state.tracks.push(track);
      }
    }
    return track;
  }

  function syncTextOverlaysToTrack() {
    const track = getTextTrack();
    if (!state.textOverlays) state.textOverlays = [];

    // Filter out clips on text tracks whose overlay was removed
    const overlayIds = new Set(state.textOverlays.map((o) => o.id));
    state.tracks.filter((t) => t.type === 'text').forEach((t) => {
      t.clips = (t.clips || []).filter((c) => overlayIds.has(c.id));
    });

    // Ensure each overlay has a clip
    state.textOverlays.forEach((overlay) => {
      let clip = null;
      for (const t of state.tracks.filter((t) => t.type === 'text')) {
        clip = (t.clips || []).find((c) => c.id === overlay.id);
        if (clip) break;
      }
      const dur = Math.max(0.2, overlay.end_time - overlay.start_time);
      if (!clip) {
        clip = {
          id: overlay.id,
          in_point: 0.0,
          out_point: Math.round(dur * 100) / 100,
          timeline_start: Math.round(overlay.start_time * 100) / 100,
          speed: 1.0,
          volume: 1.0,
          file_id: null,
          filename: overlay.text || 'Metin',
          text: overlay.text || 'Metin',
        };
        track.clips.push(clip);
      } else {
        clip.timeline_start = Math.round(overlay.start_time * 100) / 100;
        clip.in_point = 0.0;
        clip.out_point = Math.round(dur * 100) / 100;
        clip.text = overlay.text || 'Metin';
        clip.filename = overlay.text || 'Metin';
      }
    });
  }

  function updateTextOverlayInputsFromState(overlay) {
    if (!dom.textOverlaysList) return;
    const card = dom.textOverlaysList.querySelector(`[data-overlay-id="${overlay.id}"]`);
    if (!card) return;
    const startIn = card.querySelector('.input-overlay-start');
    const endIn = card.querySelector('.input-overlay-end');
    const badge = card.querySelector('.overlay-timing-badge');
    if (startIn) startIn.value = overlay.start_time;
    if (endIn) endIn.value = overlay.end_time;
    if (badge) badge.textContent = `${formatTime(overlay.start_time)} - ${formatTime(overlay.end_time)}`;
  }

  function addTrack(type) {
    const prefix = type === 'video' ? 'v' : (type === 'text' ? 't' : 'a');
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
    if (type === 'video' || type === 'text') newTrack.visible = true;
    else newTrack.muted = false;

    pushTimelineHistory();
    if (type === 'video') {
      const lastVideoIdx = state.tracks.map((t) => t.type).lastIndexOf('video');
      state.tracks.splice(lastVideoIdx + 1, 0, newTrack);
    } else if (type === 'text') {
      const firstAudioIdx = state.tracks.findIndex((t) => t.type === 'audio');
      if (firstAudioIdx !== -1) {
        state.tracks.splice(firstAudioIdx, 0, newTrack);
      } else {
        state.tracks.push(newTrack);
      }
    } else {
      state.tracks.push(newTrack);
    }

    state.selectedTrackId = id;
    renderAllTracks();
    const typeLabel = type === 'video' ? 'video' : (type === 'text' ? 'metin' : 'ses');
    showToast(`Yeni ${typeLabel} izi eklendi (${name}) 🎬`, 'success');
  }

  function deleteTrack(trackId) {
    if (trackId === 'v1' || trackId === 'a1' || trackId === 't1') {
      showToast('Temel izler (V1, A1, T1) silinemez.', 'info');
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
    const streamUrl = dom.videoPlayer?.src || (state.fileId ? `/api/media/${state.fileId}` : null);
    state.tracks = [
      {
        id: 'v1',
        type: 'video',
        name: 'V1',
        visible: true,
        locked: false,
        clips: [
          createClip(
            'clip-1',
            0.0,
            state.duration,
            0.0,
            1.0,
            1.0,
            state.fileId,
            state.filename,
            streamUrl
          ),
        ],
      },
      { id: 't1', type: 'text', name: 'T1', visible: true, locked: false, clips: [] },
      { id: 'a1', type: 'audio', name: 'A1', muted: false, locked: false, clips: [] },
    ];
    syncTextOverlaysToTrack();
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

    // Transform fields (Phase 3)
    const curScale = clip.scale !== undefined ? clip.scale : 1.0;
    if (dom.sliderClipScale) dom.sliderClipScale.value = Math.round(curScale * 100);
    if (dom.inspectorScaleBadge) dom.inspectorScaleBadge.textContent = `%${Math.round(curScale * 100)}`;
    if (dom.inputClipPosX) dom.inputClipPosX.value = clip.pos_x || 0;
    if (dom.inputClipPosY) dom.inputClipPosY.value = clip.pos_y || 0;
    if (dom.sliderClipRotation) dom.sliderClipRotation.value = clip.rotation || 0;
    if (dom.inspectorRotationBadge) dom.inspectorRotationBadge.textContent = `${clip.rotation || 0}°`;

    // Opacity field (E-5)
    const curOpacity = clip.opacity !== undefined ? clip.opacity : 1.0;
    if (dom.sliderClipOpacity) dom.sliderClipOpacity.value = Math.round(curOpacity * 100);
    if (dom.inspectorOpacityBadge) dom.inspectorOpacityBadge.textContent = `%${Math.round(curOpacity * 100)}`;

    // Audio Suite fields (Phase 2)
    if (dom.checkClipDenoise) dom.checkClipDenoise.checked = !!clip.denoise;
    if (dom.denoiseLevelContainer) {
      dom.denoiseLevelContainer.classList.toggle('hidden', !clip.denoise);
    }
    const currentDenoiseLvl = clip.denoise_level || 'medium';
    document.querySelectorAll('.denoise-level-btn').forEach((b) => {
      if (b.dataset.level === currentDenoiseLvl) {
        b.className = 'denoise-level-btn px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono cursor-pointer';
      } else {
        b.className = 'denoise-level-btn px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono hover:bg-slate-700 cursor-pointer';
      }
    });
    if (dom.checkClipLoudnorm) dom.checkClipLoudnorm.checked = !!clip.normalize_audio;
    if (dom.loudnormPresetContainer) {
      dom.loudnormPresetContainer.classList.toggle('hidden', !clip.normalize_audio);
    }
    const currentTargetLufs = clip.target_lufs !== undefined ? clip.target_lufs : -14.0;
    document.querySelectorAll('.lufs-preset-btn').forEach((b) => {
      if (parseFloat(b.dataset.lufs) === currentTargetLufs) {
        b.className = 'lufs-preset-btn px-1.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-mono cursor-pointer transition-colors';
      } else {
        b.className = 'lufs-preset-btn px-1.5 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-mono hover:bg-slate-700 cursor-pointer transition-colors';
      }
    });

    // AI Suite: RNNoise Neural Voice Isolation
    if (dom.checkClipRnnoise) dom.checkClipRnnoise.checked = !!clip.neural_voice_isolation;
    if (dom.rnnoiseMixContainer) {
      dom.rnnoiseMixContainer.classList.toggle('hidden', !clip.neural_voice_isolation);
    }
    const currentRnnoiseMix = Math.round((clip.voice_isolation_mix !== undefined ? clip.voice_isolation_mix : 1.0) * 100);
    if (dom.sliderClipRnnoiseMix) dom.sliderClipRnnoiseMix.value = currentRnnoiseMix;
    if (dom.rnnoiseMixBadge) dom.rnnoiseMixBadge.textContent = `%${currentRnnoiseMix}${currentRnnoiseMix === 100 ? ' (Tam İzolasyon)' : ''}`;

    updateTransformGizmoUI();
    updateAudioPreviewFx(clip);
  }

  function initTransformGizmo() {
    if (!dom.transformGizmo || !dom.videoPreviewWrapper) return;

    // Center Drag (Move X, Y)
    let isDraggingCenter = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let startPosX = 0;
    let startPosY = 0;

    if (dom.gizmoCenterDrag) {
      dom.gizmoCenterDrag.addEventListener('pointerdown', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingCenter = true;
        startPointerX = e.clientX;
        startPointerY = e.clientY;
        startPosX = sel.clip.pos_x || 0;
        startPosY = sel.clip.pos_y || 0;

        const onMove = (moveEv) => {
          if (!isDraggingCenter) return;
          const wrapperRect = dom.videoPreviewWrapper.getBoundingClientRect();
          const dx = moveEv.clientX - startPointerX;
          const dy = moveEv.clientY - startPointerY;
          let newPosX = Math.round((startPosX + (dx / wrapperRect.width) * 100) * 10) / 10;
          let newPosY = Math.round((startPosY + (dy / wrapperRect.height) * 100) * 10) / 10;

          // Magnetic snapping near center (±2.5%)
          if (Math.abs(newPosX) < 2.5) {
            newPosX = 0;
            if (dom.snapGuideX) dom.snapGuideX.classList.remove('hidden');
          } else {
            if (dom.snapGuideX) dom.snapGuideX.classList.add('hidden');
          }

          if (Math.abs(newPosY) < 2.5) {
            newPosY = 0;
            if (dom.snapGuideY) dom.snapGuideY.classList.remove('hidden');
          } else {
            if (dom.snapGuideY) dom.snapGuideY.classList.add('hidden');
          }

          sel.clip.pos_x = Math.max(-100, Math.min(100, newPosX));
          sel.clip.pos_y = Math.max(-100, Math.min(100, newPosY));

          if (dom.inputClipPosX) dom.inputClipPosX.value = sel.clip.pos_x;
          if (dom.inputClipPosY) dom.inputClipPosY.value = sel.clip.pos_y;

          updateTransformGizmoUI();
          syncPreviewToTimeline(state.playheadTime, false);
        };

        const onUp = () => {
          isDraggingCenter = false;
          if (dom.snapGuideX) dom.snapGuideX.classList.add('hidden');
          if (dom.snapGuideY) dom.snapGuideY.classList.add('hidden');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }

    // Corner Handles (Scale)
    dom.transformGizmo.querySelectorAll('.gizmo-handle[data-handle]').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        e.preventDefault();
        e.stopPropagation();

        const wrapperRect = dom.videoPreviewWrapper.getBoundingClientRect();
        const startScale = sel.clip.scale !== undefined ? sel.clip.scale : 1.0;
        const centerX = wrapperRect.left + wrapperRect.width / 2 + (wrapperRect.width * (sel.clip.pos_x || 0) / 100);
        const centerY = wrapperRect.top + wrapperRect.height / 2 + (wrapperRect.height * (sel.clip.pos_y || 0) / 100);
        const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY) || 1;

        const onMove = (moveEv) => {
          const currentDist = Math.hypot(moveEv.clientX - centerX, moveEv.clientY - centerY);
          const ratio = currentDist / startDist;
          let newScale = Math.round(Math.max(0.1, Math.min(2.0, startScale * ratio)) * 100) / 100;
          sel.clip.scale = newScale;

          if (dom.sliderClipScale) dom.sliderClipScale.value = Math.round(newScale * 100);
          if (dom.inspectorScaleBadge) dom.inspectorScaleBadge.textContent = `%${Math.round(newScale * 100)}`;

          updateTransformGizmoUI();
          syncPreviewToTimeline(state.playheadTime, false);
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });

    // Rotation Pin
    if (dom.gizmoRotatePin) {
      dom.gizmoRotatePin.addEventListener('pointerdown', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        e.preventDefault();
        e.stopPropagation();

        const wrapperRect = dom.videoPreviewWrapper.getBoundingClientRect();
        const centerX = wrapperRect.left + wrapperRect.width / 2 + (wrapperRect.width * (sel.clip.pos_x || 0) / 100);
        const centerY = wrapperRect.top + wrapperRect.height / 2 + (wrapperRect.height * (sel.clip.pos_y || 0) / 100);
        const initialAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        const startRot = sel.clip.rotation || 0;

        const onMove = (moveEv) => {
          const currentAngle = Math.atan2(moveEv.clientY - centerY, moveEv.clientX - centerX) * (180 / Math.PI);
          let newRot = Math.round(startRot + (currentAngle - initialAngle));
          // Snap near 0, 90, -90, 180
          if (Math.abs(newRot) < 3) newRot = 0;
          if (Math.abs(newRot - 90) < 3) newRot = 90;
          if (Math.abs(newRot + 90) < 3) newRot = -90;
          if (Math.abs(Math.abs(newRot) - 180) < 3) newRot = 180;

          sel.clip.rotation = Math.max(-180, Math.min(180, newRot));
          if (dom.sliderClipRotation) dom.sliderClipRotation.value = sel.clip.rotation;
          if (dom.inspectorRotationBadge) dom.inspectorRotationBadge.textContent = `${sel.clip.rotation}°`;

          updateTransformGizmoUI();
          syncPreviewToTimeline(state.playheadTime, false);
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }
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
        updateAudioPreviewFx(sel.clip);
      });
    }

    if (dom.inputClipIn) {
      dom.inputClipIn.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        const val = parseFloat(e.target.value);
        if (isNaN(val) || val < 0) {
          showToast('Başlangıç noktası 0 veya pozitif bir sayı olmalıdır.', 'error');
          dom.inputClipIn.value = sel.clip.in_point.toFixed(1);
          return;
        }
        if (val >= sel.clip.out_point - 0.1) {
          showToast(`Başlangıç zamanı, bitiş zamanından (${sel.clip.out_point.toFixed(1)}s) küçük olmalıdır.`, 'error');
          dom.inputClipIn.value = sel.clip.in_point.toFixed(1);
          return;
        }
        sel.clip.in_point = Math.round(val * 100) / 100;
        if (state.isRippleEnabled) rippleAlignClips(sel.track);
        renderAllTracks();
        updateTimelineDurationBadge();
        updateClipInspector();
      });
    }

    if (dom.inputClipOut) {
      dom.inputClipOut.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        const val = parseFloat(e.target.value);
        if (isNaN(val) || val <= sel.clip.in_point + 0.1) {
          showToast(`Bitiş zamanı, başlangıç zamanından (${sel.clip.in_point.toFixed(1)}s) büyük olmalıdır.`, 'error');
          dom.inputClipOut.value = sel.clip.out_point.toFixed(1);
          return;
        }
        if (state.duration > 0 && val > state.duration + 0.5) {
          showToast(`Bitiş zamanı orijinal video süresini (${formatTime(state.duration)}) aşamaz.`, 'error');
          dom.inputClipOut.value = sel.clip.out_point.toFixed(1);
          return;
        }
        sel.clip.out_point = Math.round(val * 100) / 100;
        if (state.isRippleEnabled) rippleAlignClips(sel.track);
        renderAllTracks();
        updateTimelineDurationBadge();
        updateClipInspector();
      });
    }

    // Scale Slider
    if (dom.sliderClipScale) {
      dom.sliderClipScale.addEventListener('input', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.scale = parseInt(e.target.value, 10) / 100;
        if (dom.inspectorScaleBadge) dom.inspectorScaleBadge.textContent = `%${e.target.value}`;
        updateTransformGizmoUI();
        syncPreviewToTimeline(state.playheadTime, false);
      });
    }

    // Position Inputs
    if (dom.inputClipPosX) {
      dom.inputClipPosX.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.pos_x = parseFloat(e.target.value) || 0;
        updateTransformGizmoUI();
        syncPreviewToTimeline(state.playheadTime, false);
      });
    }
    if (dom.inputClipPosY) {
      dom.inputClipPosY.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.pos_y = parseFloat(e.target.value) || 0;
        updateTransformGizmoUI();
        syncPreviewToTimeline(state.playheadTime, false);
      });
    }

    // Rotation Slider
    if (dom.sliderClipRotation) {
      dom.sliderClipRotation.addEventListener('input', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.rotation = parseInt(e.target.value, 10) || 0;
        if (dom.inspectorRotationBadge) dom.inspectorRotationBadge.textContent = `${sel.clip.rotation}°`;
        updateTransformGizmoUI();
        syncPreviewToTimeline(state.playheadTime, false);
      });
    }

    // Opacity Slider (E-5)
    if (dom.sliderClipOpacity) {
      dom.sliderClipOpacity.addEventListener('input', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.opacity = parseInt(e.target.value, 10) / 100;
        if (dom.inspectorOpacityBadge) dom.inspectorOpacityBadge.textContent = `%${e.target.value}`;
        syncPreviewToTimeline(state.playheadTime, false);
      });
    }

    // Quick PIP Presets
    document.querySelectorAll('.pip-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = getSelectedClip();
        if (!sel) return;
        const preset = btn.dataset.preset;
        if (preset === 'pip-br') {
          sel.clip.scale = 0.35;
          sel.clip.pos_x = 28;
          sel.clip.pos_y = 28;
        } else if (preset === 'pip-tl') {
          sel.clip.scale = 0.35;
          sel.clip.pos_x = -28;
          sel.clip.pos_y = -28;
        } else if (preset === 'pip-center') {
          sel.clip.scale = 1.0;
          sel.clip.pos_x = 0;
          sel.clip.pos_y = 0;
        }
        sel.clip.rotation = 0;
        updateClipInspector();
        syncPreviewToTimeline(state.playheadTime, false);
        showToast('PIP Şablonu uygulandı 📐', 'info');
      });
    });

    // Reset Transform Button
    if (dom.btnResetTransform) {
      dom.btnResetTransform.addEventListener('click', () => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.scale = 1.0;
        sel.clip.pos_x = 0;
        sel.clip.pos_y = 0;
        sel.clip.rotation = 0;
        sel.clip.opacity = 1.0;
        updateClipInspector();
        syncPreviewToTimeline(state.playheadTime, false);
        showToast('Dönüştürme ayarları sıfırlandı 🔄', 'info');
      });
    }

    // Denoise Toggle
    if (dom.checkClipDenoise) {
      dom.checkClipDenoise.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.denoise = e.target.checked;
        if (dom.denoiseLevelContainer) {
          dom.denoiseLevelContainer.classList.toggle('hidden', !sel.clip.denoise);
        }
        updateAudioPreviewFx(sel.clip);
        showToast(sel.clip.denoise ? 'Dip Ses Temizleme aktif edildi 🎙️' : 'Dip Ses Temizleme kapatıldı', 'info');
      });
    }

    // Denoise Level Buttons
    document.querySelectorAll('.denoise-level-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.denoise_level = btn.dataset.level;
        document.querySelectorAll('.denoise-level-btn').forEach((b) => {
          if (b === btn) {
            b.className = 'denoise-level-btn px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono cursor-pointer';
          } else {
            b.className = 'denoise-level-btn px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono hover:bg-slate-700 cursor-pointer';
          }
        });
        updateAudioPreviewFx(sel.clip);
      });
    });

    // Loudnorm Toggle & LUFS Presets (E-6)
    if (dom.checkClipLoudnorm) {
      dom.checkClipLoudnorm.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.normalize_audio = e.target.checked;
        if (dom.loudnormPresetContainer) {
          dom.loudnormPresetContainer.classList.toggle('hidden', !sel.clip.normalize_audio);
        }
        updateAudioPreviewFx(sel.clip);
        showToast(sel.clip.normalize_audio ? `Ses Normalizasyonu (${sel.clip.target_lufs || -14} LUFS) aktif 🔊` : 'Ses Normalizasyonu kapatıldı', 'info');
      });
    }

    document.querySelectorAll('.lufs-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.target_lufs = parseFloat(btn.dataset.lufs);
        document.querySelectorAll('.lufs-preset-btn').forEach((b) => {
          if (b === btn) {
            b.className = 'lufs-preset-btn px-1.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-mono cursor-pointer transition-colors';
          } else {
            b.className = 'lufs-preset-btn px-1.5 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-mono hover:bg-slate-700 cursor-pointer transition-colors';
          }
        });
        updateAudioPreviewFx(sel.clip);
        showToast(`Hedef ses seviyesi: ${sel.clip.target_lufs} LUFS ayarlandı 🎚️`, 'info');
      });
    });

    // RNNoise Neural Voice Isolation Toggle & Slider
    if (dom.checkClipRnnoise) {
      dom.checkClipRnnoise.addEventListener('change', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        sel.clip.neural_voice_isolation = e.target.checked;
        if (dom.rnnoiseMixContainer) {
          dom.rnnoiseMixContainer.classList.toggle('hidden', !sel.clip.neural_voice_isolation);
        }
        updateAudioPreviewFx(sel.clip);
        showToast(sel.clip.neural_voice_isolation ? 'RNNoise Yapay Zeka Ses İzolasyonu aktif 🧠' : 'Ses İzolasyonu kapatıldı', 'info');
      });
    }

    if (dom.sliderClipRnnoiseMix) {
      dom.sliderClipRnnoiseMix.addEventListener('input', (e) => {
        const sel = getSelectedClip();
        if (!sel) return;
        const val = parseInt(e.target.value, 10);
        sel.clip.voice_isolation_mix = val / 100;
        if (dom.rnnoiseMixBadge) {
          dom.rnnoiseMixBadge.textContent = `%${val}${val === 100 ? ' (Tam İzolasyon)' : ''}`;
        }
        updateAudioPreviewFx(sel.clip);
      });
    }

    // Initialize Gizmo Drag & Scale
    initTransformGizmo();
  }

  // --- Playhead & Ruler Scrubber ---
  function updatePlayheadPosition() {
    if (!dom.timelinePlayheadLine) return;
    dom.timelinePlayheadLine.style.left = `${timeToPx(state.playheadTime)}px`;
  }

  function initTimelineRulerScrubber() {
    let isScrubbing = false;

    const seekAtEvent = (e) => {
      if (!dom.timelineCanvas) return;
      const canvasRect = dom.timelineCanvas.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const offsetX = clientX - canvasRect.left;
      const targetTime = Math.max(0, Math.min(state.duration, pxToTime(offsetX)));

      syncPreviewToTimeline(targetTime, false);
    };

    const startScrubbing = (e) => {
      if (state.isPlaying) stopTimelinePlayback();
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

  // --- CapCut Dual-Wing Range Trimmer ---
  function updateRangeOverlayUI() {
    if (!dom.timelineRangeOverlay) return;
    if (!state.rangeSelection || !state.rangeSelection.active) {
      dom.timelineRangeOverlay.classList.add('hidden');
      return;
    }

    const start = Math.min(state.rangeSelection.start, state.rangeSelection.end);
    const end = Math.max(state.rangeSelection.start, state.rangeSelection.end);
    const startPx = timeToPx(start);
    const endPx = timeToPx(end);
    const widthPx = Math.max(2, endPx - startPx);

    dom.timelineRangeOverlay.classList.remove('hidden');
    dom.timelineRangeOverlay.style.left = `${startPx}px`;
    dom.timelineRangeOverlay.style.width = `${widthPx}px`;

    const dur = end - start;
    if (dom.rangeDurationBadge) {
      dom.rangeDurationBadge.textContent = `${formatTime(start)} - ${formatTime(end)} (${dur.toFixed(2)}s)`;
    }
  }

  function setRangeSelection(start, end) {
    const clampedStart = Math.max(0, Math.min(state.duration, start));
    const clampedEnd = Math.max(0, Math.min(state.duration, end));
    state.rangeSelection.active = true;
    state.rangeSelection.start = Math.min(clampedStart, clampedEnd);
    state.rangeSelection.end = Math.max(clampedStart, clampedEnd);
    updateRangeOverlayUI();
  }

  function clearRangeSelection() {
    if (!state.rangeSelection) return;
    state.rangeSelection.active = false;
    state.rangeSelection.start = 0;
    state.rangeSelection.end = 0;
    updateRangeOverlayUI();
  }

  function trimToRangeSelection() {
    if (!state.rangeSelection || !state.rangeSelection.active) {
      showToast('Önce sol ve sağ kanatlarla bir aralık belirleyin.', 'info');
      return;
    }
    const rStart = Math.min(state.rangeSelection.start, state.rangeSelection.end);
    const rEnd = Math.max(state.rangeSelection.start, state.rangeSelection.end);
    if (rEnd - rStart < 0.1) {
      showToast('Kırpma aralığı en az 0.1 saniye olmalıdır.', 'warning');
      return;
    }

    pushTimelineHistory();

    let affectedCount = 0;
    state.tracks.forEach((track) => {
      if (track.locked) return;
      const newClips = [];
      (track.clips || []).forEach((c) => {
        const cStart = c.timeline_start;
        const cEnd = c.timeline_start + getClipDuration(c);
        const speed = c.speed || 1.0;

        if (cEnd > rStart && cStart < rEnd) {
          const overlapStart = Math.max(cStart, rStart);
          const overlapEnd = Math.min(cEnd, rEnd);
          const offsetStart = (overlapStart - cStart) * speed;
          const offsetEnd = (cEnd - overlapEnd) * speed;

          const newIn = c.in_point + offsetStart;
          const newOut = c.out_point - offsetEnd;

          if (newOut - newIn > 0.05) {
            newClips.push({
              ...c,
              id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              in_point: Math.max(0, newIn),
              out_point: newOut,
              timeline_start: Math.max(0, overlapStart - rStart),
            });
            affectedCount++;
          }
        }
      });
      track.clips = newClips;
    });

    const newDur = rEnd - rStart;
    state.duration = Math.max(1, newDur);
    state.playheadTime = 0;
    clearRangeSelection();
    renderAllTracks();
    updateTimelineDurationBadge();
    syncPreviewToTimeline(0, false);
    showToast(`Aralık dışı başarıyla kırpıldı ✂️ (${newDur.toFixed(2)}s tutuldu)`, 'success');
  }

  function deleteRangeSelection() {
    if (!state.rangeSelection || !state.rangeSelection.active) {
      showToast('Silinecek bir aralık seçilmedi.', 'info');
      return;
    }
    const rStart = Math.min(state.rangeSelection.start, state.rangeSelection.end);
    const rEnd = Math.max(state.rangeSelection.start, state.rangeSelection.end);
    const cutDur = rEnd - rStart;
    if (cutDur < 0.05) return;

    pushTimelineHistory();

    state.tracks.forEach((track) => {
      if (track.locked) return;
      const newClips = [];
      (track.clips || []).forEach((c) => {
        const cStart = c.timeline_start;
        const cEnd = c.timeline_start + getClipDuration(c);
        const speed = c.speed || 1.0;

        if (cEnd <= rStart) {
          newClips.push(c);
        } else if (cStart >= rEnd) {
          const shift = state.isRippleEnabled ? cutDur : 0;
          newClips.push({
            ...c,
            timeline_start: Math.max(0, cStart - shift),
          });
        } else if (cStart < rStart && cEnd > rEnd) {
          const leftOut = c.in_point + (rStart - cStart) * speed;
          const rightIn = c.out_point - (cEnd - rEnd) * speed;
          if (leftOut > c.in_point + 0.05) {
            newClips.push({
              ...c,
              out_point: leftOut,
            });
          }
          if (c.out_point > rightIn + 0.05) {
            const shift = state.isRippleEnabled ? cutDur : 0;
            newClips.push({
              ...c,
              id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              in_point: rightIn,
              timeline_start: Math.max(0, state.isRippleEnabled ? rStart : rEnd),
            });
          }
        } else if (cStart >= rStart && cEnd <= rEnd) {
          // Inside cut: removed
        } else if (cStart < rStart && cEnd <= rEnd) {
          const newOut = c.in_point + (rStart - cStart) * speed;
          if (newOut > c.in_point + 0.05) {
            newClips.push({
              ...c,
              out_point: newOut,
            });
          }
        } else if (cStart >= rStart && cEnd > rEnd) {
          const newIn = c.out_point - (cEnd - rEnd) * speed;
          if (c.out_point > newIn + 0.05) {
            const shift = state.isRippleEnabled ? cutDur : 0;
            newClips.push({
              ...c,
              in_point: newIn,
              timeline_start: Math.max(0, state.isRippleEnabled ? rStart : cStart - shift),
            });
          }
        }
      });
      track.clips = newClips;
    });

    clearRangeSelection();
    renderAllTracks();
    updateTimelineDurationBadge();
    syncPreviewToTimeline(Math.min(rStart, state.duration), false);
    showToast(`Seçili aralık silindi 🗑️ (${cutDur.toFixed(2)}s çıkarıldı)`, 'success');
  }

  function seekPreviewWithoutMovingPlayhead(targetTime) {
    if (dom.playerCurrentTime) {
      dom.playerCurrentTime.textContent = formatTime(targetTime);
    }
    const active = getActiveVideoClipAtTime(targetTime);
    if (active) {
      const fileId = active.clip.file_id || state.fileId;
      const speed = active.clip.speed || 1.0;
      const offsetInClip = (targetTime - active.clipStart) * speed;
      const sourceTime = active.clip.in_point + offsetInClip;
      const targetSrc = active.clip.preview_url || `/api/media/${fileId}`;

      if (currentLoadedFileId !== fileId) {
        currentLoadedFileId = fileId;
        dom.videoPlayer.src = targetSrc;
        dom.videoPlayer.onloadedmetadata = () => {
          dom.videoPlayer.currentTime = sourceTime;
        };
        dom.videoPlayer.load();
      } else {
        dom.videoPlayer.currentTime = sourceTime;
      }
    }
  }

  function splitAtRangeSelection() {
    if (!state.rangeSelection || !state.rangeSelection.active) return;
    const rStart = Math.min(state.rangeSelection.start, state.rangeSelection.end);
    const rEnd = Math.max(state.rangeSelection.start, state.rangeSelection.end);

    pushTimelineHistory();

    const targetTrack = state.tracks.find((t) => t.id === state.selectedTrackId);
    const tracksToProcess = targetTrack ? [targetTrack] : state.tracks.filter((t) => !t.locked);

    let anySplit = false;
    let newlySelectedId = null;

    // Process split points in order: rStart first, then rEnd
    const splitPoints = [rStart, rEnd].sort((a, b) => a - b);

    splitPoints.forEach((splitTime) => {
      tracksToProcess.forEach((track) => {
        const clipIdx = (track.clips || []).findIndex((c) => {
          const s = c.timeline_start;
          const e = s + getClipDuration(c);
          return splitTime > s + 0.05 && splitTime < e - 0.05;
        });

        if (clipIdx !== -1) {
          const targetClip = track.clips[clipIdx];
          const speed = targetClip.speed || 1.0;
          const splitOffsetInSource = (splitTime - targetClip.timeline_start) * speed;
          const splitSourcePoint = Math.round((targetClip.in_point + splitOffsetInSource) * 1000) / 1000;

          const clipA = createClip(
            `clip-${++clipCounter}`,
            targetClip.in_point,
            splitSourcePoint,
            targetClip.timeline_start,
            targetClip.speed,
            targetClip.volume,
            targetClip.file_id,
            targetClip.filename,
            targetClip.preview_url
          );

          const clipB = createClip(
            `clip-${++clipCounter}`,
            splitSourcePoint,
            targetClip.out_point,
            splitTime,
            targetClip.speed,
            targetClip.volume,
            targetClip.file_id,
            targetClip.filename,
            targetClip.preview_url
          );

          track.clips.splice(clipIdx, 1, clipA, clipB);
          anySplit = true;
          newlySelectedId = clipB.id;
        }
      });
    });

    if (!anySplit) {
      showToast('İmleçlerin olduğu noktalarda bölünebilecek bir klip bulunamadı.', 'info');
      return;
    }

    if (newlySelectedId) {
      state.selectedClipId = newlySelectedId;
    }

    clearRangeSelection();
    renderAllTracks();
    updateTimelineDurationBadge();
    updateClipInspector();
    showToast('Klip aralık işaretçilerinden başarıyla bölündü ✂️', 'success');
  }

  function initPlayheadDualWingTrimmer() {
    const startDragWingLeft = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (state.isPlaying) stopTimelinePlayback();

      const initialPlayhead = state.playheadTime;
      if (!state.rangeSelection || !state.rangeSelection.active) {
        state.rangeSelection = {
          active: true,
          start: Math.max(0, initialPlayhead - 1.0),
          end: initialPlayhead,
        };
      }
      const fixedEnd = state.rangeSelection.end;

      const onMove = (ev) => {
        const canvasRect = dom.timelineCanvas ? dom.timelineCanvas.getBoundingClientRect() : { left: 0 };
        const clientX = ev.clientX !== undefined ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
        const offsetX = clientX - canvasRect.left;
        const newTime = Math.max(0, Math.min(fixedEnd, pxToTime(offsetX)));
        state.rangeSelection.start = newTime;
        state.rangeSelection.end = fixedEnd;
        updateRangeOverlayUI();
        seekPreviewWithoutMovingPlayhead(newTime);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        updateRangeOverlayUI();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    const startDragWingRight = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (state.isPlaying) stopTimelinePlayback();

      const initialPlayhead = state.playheadTime;
      if (!state.rangeSelection || !state.rangeSelection.active) {
        state.rangeSelection = {
          active: true,
          start: initialPlayhead,
          end: Math.min(state.duration, initialPlayhead + 1.0),
        };
      }
      const fixedStart = state.rangeSelection.start;

      const onMove = (ev) => {
        const canvasRect = dom.timelineCanvas ? dom.timelineCanvas.getBoundingClientRect() : { left: 0 };
        const clientX = ev.clientX !== undefined ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
        const offsetX = clientX - canvasRect.left;
        const newTime = Math.min(state.duration, Math.max(fixedStart, pxToTime(offsetX)));
        state.rangeSelection.start = fixedStart;
        state.rangeSelection.end = newTime;
        updateRangeOverlayUI();
        seekPreviewWithoutMovingPlayhead(newTime);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        updateRangeOverlayUI();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    if (dom.playheadWingLeft) {
      dom.playheadWingLeft.addEventListener('pointerdown', startDragWingLeft);
    }
    if (dom.playheadWingRight) {
      dom.playheadWingRight.addEventListener('pointerdown', startDragWingRight);
    }
    if (dom.rangeHandleIn) {
      dom.rangeHandleIn.addEventListener('pointerdown', startDragWingLeft);
    }
    if (dom.rangeHandleOut) {
      dom.rangeHandleOut.addEventListener('pointerdown', startDragWingRight);
    }

    if (dom.btnRangeTrim) dom.btnRangeTrim.addEventListener('click', trimToRangeSelection);
    if (dom.btnRangeDelete) dom.btnRangeDelete.addEventListener('click', deleteRangeSelection);
    if (dom.btnRangeSplit) dom.btnRangeSplit.addEventListener('click', splitAtRangeSelection);
    if (dom.btnRangeClear) dom.btnRangeClear.addEventListener('click', clearRangeSelection);
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
          syncPreviewToTimeline(contextClickedTime, false);
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

  // --- External Media File Drag & Drop onto Timeline Tracks ---
  function initTimelineFileDrop() {
    const dropArea = dom.timelineCanvas || dom.timelineLanesArea;
    if (!dropArea) return;

    function getTargetLane(clientY) {
      if (!dom.timelineLanesArea) return null;
      const lanes = dom.timelineLanesArea.querySelectorAll('.track-lane-row');
      for (const lane of lanes) {
        const r = lane.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const tid = lane.dataset.trackId;
          const trk = state.tracks.find((t) => t.id === tid);
          return { laneEl: lane, track: trk };
        }
      }
      return null;
    }

    function clearLaneDropHovers() {
      if (!dom.timelineLanesArea) return;
      dom.timelineLanesArea.querySelectorAll('.track-lane-row').forEach((l) => {
        l.classList.remove('lane-drop-hover');
      });
    }

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';

        const hit = getTargetLane(e.clientY);
        clearLaneDropHovers();
        if (hit && hit.track && !hit.track.locked) {
          hit.laneEl.classList.add('lane-drop-hover');
        }
      });
    });

    ['dragleave', 'dragend'].forEach((eventName) => {
      dropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = dropArea.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          clearLaneDropHovers();
        }
      });
    });

    dropArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearLaneDropHovers();

      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      const validMediaExts = [
        '.mp4', '.mov', '.mkv', '.avi', '.webm', '.ts',
        '.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.m4v'
      ];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!validMediaExts.includes(ext)) {
        showToast(`Desteklenmeyen dosya formatı: ${ext}`, 'error');
        return;
      }

      const isAudioFile = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'].includes(ext);

      // Calculate drop timestamp on timeline
      const viewport = dom.timelineScrollViewport;
      let dropTime = 0;
      if (viewport) {
        const vpRect = viewport.getBoundingClientRect();
        const dropPx = e.clientX - vpRect.left + viewport.scrollLeft;
        dropTime = Math.max(0, Math.round(pxToTime(dropPx) * 10) / 10);
      }

      // Determine target track
      const hit = getTargetLane(e.clientY);
      let targetTrack = null;
      if (hit && hit.track && !hit.track.locked) {
        if ((isAudioFile && hit.track.type === 'audio') || (!isAudioFile && hit.track.type === 'video')) {
          targetTrack = hit.track;
        }
      }

      if (!targetTrack) {
        if (isAudioFile) {
          targetTrack = state.tracks.find((t) => t.type === 'audio' && !t.locked);
          if (!targetTrack) {
            addTrack('audio');
            targetTrack = state.tracks.filter((t) => t.type === 'audio').slice(-1)[0];
          }
        } else {
          targetTrack = state.tracks.find((t) => t.type === 'video' && !t.locked);
          if (!targetTrack) {
            addTrack('video');
            targetTrack = state.tracks.filter((t) => t.type === 'video').slice(-1)[0];
          }
        }
      }

      showToast(`"${file.name}" yükleniyor ve inceleniyor... ⏳`, 'info');

      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errRes = await res.json().catch(() => ({ detail: 'Dosya yükleme hatası' }));
          throw new Error(errRes.detail || 'Dosya yüklenemedi');
        }

        const data = await res.json();
        const mediaDuration = (data.metadata && data.metadata.duration) ? data.metadata.duration : 5.0;

        pushTimelineHistory();

        const previewUrl = data.preview_url || `/api/media/${data.file_id}`;
        // Create new clip
        const newClip = createClip(
          `clip-${++clipCounter}`,
          0.0,
          mediaDuration,
          dropTime,
          1.0,
          1.0,
          data.file_id,
          data.filename,
          previewUrl
        );

        targetTrack.clips.push(newClip);
        targetTrack.clips.sort((a, b) => a.timeline_start - b.timeline_start);

        // Adjust project duration if clip exceeds current duration
        const clipEnd = dropTime + mediaDuration;
        if (clipEnd > state.duration) {
          state.duration = Math.ceil(clipEnd);
          if (dom.metaDuration) {
            dom.metaDuration.textContent = formatTime(state.duration);
          }
        }

        selectClip(newClip.id);
        syncPreviewToTimeline(dropTime, false);
        renderAllTracks();
        updateTimelineDurationBadge();
        showToast(`"${data.filename}" başarıyla ${targetTrack.name} kanalına eklendi 🎬`, 'success');
      } catch (err) {
        showToast(`Hata: ${err.message}`, 'error');
      }
    });
  }

  // --- External Audio / Music Import ---
  async function importAudioFile(file) {
    if (!file) return;

    // Find or create target audio track
    let targetTrack = state.tracks.find((t) => t.type === 'audio' && !t.locked);
    if (!targetTrack) {
      addTrack('audio');
      targetTrack = state.tracks.filter((t) => t.type === 'audio').slice(-1)[0];
    }
    if (!targetTrack) {
      showToast('Ses kanalı oluşturulamadı.', 'error');
      return;
    }

    showToast(`"${file.name}" yükleniyor ve inceleniyor... ⏳`, 'info');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errRes = await res.json().catch(() => ({ detail: 'Dosya yükleme hatası' }));
        throw new Error(errRes.detail || 'Ses dosyası yüklenemedi');
      }

      const data = await res.json();
      const mediaDuration = (data.metadata && data.metadata.duration) ? data.metadata.duration : 5.0;

      pushTimelineHistory();

      const dropTime = Math.max(0, state.playheadTime || 0);
      const previewUrl = data.preview_url || `/api/media/${data.file_id}`;

      // Create new clip
      const newClip = createClip(
        `clip-${++clipCounter}`,
        0.0,
        mediaDuration,
        dropTime,
        1.0,
        1.0,
        data.file_id,
        data.filename,
        previewUrl
      );

      targetTrack.clips.push(newClip);
      targetTrack.clips.sort((a, b) => a.timeline_start - b.timeline_start);

      // Adjust project duration if audio clip exceeds current duration
      const clipEnd = dropTime + mediaDuration;
      if (clipEnd > state.duration) {
        state.duration = Math.ceil(clipEnd);
        if (dom.metaDuration) {
          dom.metaDuration.textContent = formatTime(state.duration);
        }
      }

      selectClip(newClip.id);
      syncPreviewToTimeline(dropTime, false);
      renderAllTracks();
      updateTimelineDurationBadge();
      showToast(`"${data.filename}" ses kanalına başarıyla eklendi 🎵`, 'success');

      // Auto-switch to clip inspector tab for instant volume & trim control
      activateInspectorTab('clip');
    } catch (err) {
      showToast(`Hata: ${err.message}`, 'error');
    }
  }

  // --- Toolbar Handlers ---
  function initCapCutTimelineStudio() {
    if (dom.btnSplitClip) dom.btnSplitClip.addEventListener('click', splitClipAtPlayhead);
    if (dom.btnDeleteClip) dom.btnDeleteClip.addEventListener('click', deleteSelectedClip);
    if (dom.btnUndoTimeline) dom.btnUndoTimeline.addEventListener('click', undoTimeline);
    if (dom.btnResetTimeline) dom.btnResetTimeline.addEventListener('click', resetTimeline);
    if (dom.btnAddVideoTrack) dom.btnAddVideoTrack.addEventListener('click', () => addTrack('video'));
    if (dom.btnAddTextTrack) dom.btnAddTextTrack.addEventListener('click', () => addTrack('text'));
    if (dom.btnAddAudioTrack) dom.btnAddAudioTrack.addEventListener('click', () => addTrack('audio'));

    // Audio Import Handlers
    if (dom.btnImportAudio && dom.audioFileInput) {
      dom.btnImportAudio.addEventListener('click', () => dom.audioFileInput.click());
    }
    if (dom.btnTabImportAudio && dom.audioFileInput) {
      dom.btnTabImportAudio.addEventListener('click', () => dom.audioFileInput.click());
    }
    if (dom.audioFileInput) {
      dom.audioFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        await importAudioFile(file);
        dom.audioFileInput.value = '';
      });
    }

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
    initPlayheadDualWingTrimmer();
    initClipInspectorListeners();
    initTimelineContextMenu();
    initTimelineFileDrop();
  }

  // --- Zoom Controls Engine (I-3) ---
  function initZoomControls() {
    const applyZoom = (newZoom) => {
      state.timelineZoom = Math.max(15, Math.min(150, Math.round(newZoom)));
      if (dom.timelineZoomSlider) {
        dom.timelineZoomSlider.value = state.timelineZoom;
      }
      renderAllTracks();
      updatePlayheadPosition();
      updateRangeOverlayUI();
    };

    if (dom.timelineZoomSlider) {
      dom.timelineZoomSlider.addEventListener('input', (e) => {
        applyZoom(parseFloat(e.target.value) || 45);
      });
    }

    if (dom.btnZoomIn) {
      dom.btnZoomIn.addEventListener('click', () => {
        applyZoom(state.timelineZoom + 15);
      });
    }

    if (dom.btnZoomOut) {
      dom.btnZoomOut.addEventListener('click', () => {
        applyZoom(state.timelineZoom - 15);
      });
    }

    if (dom.btnZoomFit) {
      dom.btnZoomFit.addEventListener('click', () => {
        const viewportWidth = dom.timelineScrollViewport ? dom.timelineScrollViewport.clientWidth - 60 : 800;
        const netDur = Math.max(state.duration, calculateNetDuration(), 5);
        const fitZoom = Math.max(15, Math.min(150, Math.round(viewportWidth / netDur)));
        applyZoom(fitZoom);
        showToast('Zaman çizgisi ekrana sığdırıldı 📐', 'info');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard Shortcuts Manager (E-7)
  // ---------------------------------------------------------------------------
  function initKeyboardShortcuts() {
    // Shortcuts Modal open/close listeners
    if (dom.btnOpenShortcuts) {
      dom.btnOpenShortcuts.addEventListener('click', () => {
        if (dom.shortcutsModal) {
          dom.shortcutsModal.classList.remove('hidden');
          refreshIcons();
        }
      });
    }

    if (dom.btnCloseShortcuts) {
      dom.btnCloseShortcuts.addEventListener('click', () => {
        if (dom.shortcutsModal) dom.shortcutsModal.classList.add('hidden');
      });
    }

    if (dom.btnShortcutsOk) {
      dom.btnShortcutsOk.addEventListener('click', () => {
        if (dom.shortcutsModal) dom.shortcutsModal.classList.add('hidden');
      });
    }

    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable)) {
        return;
      }

      // Ctrl+S: Save Project (.koalaproject)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        if (state.view === 'editor') {
          e.preventDefault();
          exportProject();
          return;
        }
      }

      // Ctrl+D: Duplicate Clip
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        if (state.selectedClipId) {
          e.preventDefault();
          duplicateClip(state.selectedClipId);
          return;
        }
      }

      if (e.key === 'Escape') {
        if (dom.shortcutsModal && !dom.shortcutsModal.classList.contains('hidden')) {
          dom.shortcutsModal.classList.add('hidden');
          return;
        }
        if (state.rangeSelection && state.rangeSelection.active) {
          clearRangeSelection();
          return;
        }
      }

      // I: Set In-Point at playhead
      if (e.code === 'KeyI' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const cur = state.playheadTime;
        const end = (state.rangeSelection && state.rangeSelection.active) ? state.rangeSelection.end : Math.min(state.duration, cur + 2.0);
        setRangeSelection(cur, end);
        showToast(`Aralık Başlangıcı (In) [ ${formatTime(cur)} ] 🚩`, 'info');
        return;
      }

      // O: Set Out-Point at playhead
      if (e.code === 'KeyO' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const cur = state.playheadTime;
        const start = (state.rangeSelection && state.rangeSelection.active) ? state.rangeSelection.start : Math.max(0, cur - 2.0);
        setRangeSelection(start, cur);
        showToast(`Aralık Bitişi (Out) [ ${formatTime(cur)} ] 🏁`, 'info');
        return;
      }

      // X: Mark Clip Range (Set In/Out to cover selected clip)
      if (e.code === 'KeyX' && !e.ctrlKey && !e.metaKey) {
        const sel = getSelectedClip();
        if (sel) {
          e.preventDefault();
          const s = sel.clip.timeline_start;
          const end = s + getClipDuration(sel.clip);
          setRangeSelection(s, end);
          showToast(`Klip aralığı seçildi [ ${formatTime(s)} - ${formatTime(end)} ] 🎯`, 'info');
          return;
        }
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimelinePlayback();
        return;
      }

      // S or C: Split clip at playhead
      if (e.code === 'KeyS' || e.code === 'KeyC') {
        e.preventDefault();
        splitClipAtPlayhead();
        return;
      }

      // Delete or Backspace: Delete selected clip or range selection
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (state.selectedClipId) {
          e.preventDefault();
          deleteSelectedClip();
          return;
        } else if (state.rangeSelection && state.rangeSelection.active) {
          e.preventDefault();
          deleteRangeSelection();
          return;
        }
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
        if (state.isPlaying) stopTimelinePlayback();
        const fps = (state.metadata && state.metadata.video && state.metadata.video.fps) || 30;
        syncPreviewToTimeline(Math.max(0, state.playheadTime - (1 / fps)), false);
        return;
      }

      // Period (.): Step 1 frame forward
      if (e.code === 'Period') {
        e.preventDefault();
        if (state.isPlaying) stopTimelinePlayback();
        const fps = (state.metadata && state.metadata.video && state.metadata.video.fps) || 30;
        syncPreviewToTimeline(Math.min(state.duration, state.playheadTime + (1 / fps)), false);
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
        if (state.isPlaying) stopTimelinePlayback();
        const step = e.shiftKey ? 5 : 1;
        syncPreviewToTimeline(Math.max(0, state.playheadTime - step), false);
        return;
      }

      // ArrowRight: Step forward 1s (or 5s with Shift)
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (state.isPlaying) stopTimelinePlayback();
        const step = e.shiftKey ? 5 : 1;
        syncPreviewToTimeline(Math.min(state.duration, state.playheadTime + step), false);
        return;
      }

      // J: Step back 3s
      if (e.code === 'KeyJ') {
        e.preventDefault();
        if (state.isPlaying) stopTimelinePlayback();
        syncPreviewToTimeline(Math.max(0, state.playheadTime - 3), false);
        return;
      }

      // K: Pause
      if (e.code === 'KeyK') {
        e.preventDefault();
        stopTimelinePlayback();
        return;
      }

      // L: Step forward 3s
      if (e.code === 'KeyL') {
        e.preventDefault();
        if (state.isPlaying) stopTimelinePlayback();
        syncPreviewToTimeline(Math.min(state.duration, state.playheadTime + 3), false);
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
      { key: 'subtitle', nav: dom.tabNavSubtitle, panel: dom.tabPanelSubtitle },
      { key: 'text', nav: dom.tabNavText, panel: dom.tabPanelText },
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
      { key: 'subtitle', nav: dom.tabNavSubtitle },
      { key: 'text', nav: dom.tabNavText },
    ];

    tabs.forEach(({ key, nav }) => {
      if (!nav) return;
      nav.addEventListener('click', () => {
        activateInspectorTab(key);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Inspector Akordiyon Kartları (Collapsible Accordions)
  // ---------------------------------------------------------------------------
  function initAccordions() {
    const headers = document.querySelectorAll('.accordion-header');
    headers.forEach((header) => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const targetId = header.dataset.target;
        if (!targetId) return;
        const body = document.getElementById(targetId);
        const chevron = header.querySelector('.accordion-chevron');
        if (body) {
          const isHidden = body.classList.toggle('hidden');
          if (chevron) {
            chevron.classList.toggle('rotate-180', !isHidden);
          }
          refreshIcons();
        }
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
        muted: !!t.muted,
        clips: t.clips.map((c) => ({
          id: c.id,
          in_point: Math.round(c.in_point * 1000) / 1000,
          out_point: Math.round(c.out_point * 1000) / 1000,
          timeline_start: Math.round(c.timeline_start * 1000) / 1000,
          speed: c.speed || 1.0,
          volume: c.volume !== undefined ? c.volume : 1.0,
          file_id: c.file_id || state.fileId,
          denoise: !!c.denoise,
          denoise_level: c.denoise_level || 'medium',
          normalize_audio: !!c.normalize_audio,
          target_lufs: c.target_lufs || -14.0,
          neural_voice_isolation: !!c.neural_voice_isolation,
          voice_isolation_mix: c.voice_isolation_mix !== undefined ? c.voice_isolation_mix : 1.0,
          scale: c.scale !== undefined ? c.scale : 1.0,
          pos_x: c.pos_x || 0.0,
          pos_y: c.pos_y || 0.0,
          rotation: c.rotation || 0.0,
          opacity: c.opacity !== undefined ? c.opacity : 1.0,
        })),
      }));
    }

    if (dom.checkGlobalLoudnorm && dom.checkGlobalLoudnorm.checked) {
      config.normalize_audio = true;
      config.target_lufs = -14.0;
    }

    // AI Suite: Burn-in Subtitles
    if (dom.checkBurnSubtitles && dom.checkBurnSubtitles.checked && state.subtitles && state.subtitles.srt_file_path) {
      config.burn_subtitles = true;
      config.subtitle_file_path = state.subtitles.srt_file_path;
      if (state.subtitleStyle) {
        config.subtitle_font = state.subtitleStyle.font || 'Arial';
        config.subtitle_font_size = Number(state.subtitleStyle.fontSize) || 22;
        config.subtitle_color = state.subtitleStyle.color || '#ffffff';
        config.subtitle_style_preset = state.subtitleStyle.preset || 'box';
        config.subtitle_position = state.subtitleStyle.position || 'bottom';
      }
    }

    // Custom Text Overlays
    if (state.textOverlays && state.textOverlays.length > 0) {
      config.text_overlays = state.textOverlays.map((to) => ({
        id: to.id,
        text: to.text,
        start_time: Number(to.start_time) || 0.0,
        end_time: Number(to.end_time) || 5.0,
        pos_x: Number(to.pos_x) !== undefined ? Number(to.pos_x) : 50.0,
        pos_y: Number(to.pos_y) !== undefined ? Number(to.pos_y) : 40.0,
        font_family: to.font_family || 'Arial',
        font_size: Number(to.font_size) || 28,
        color: to.color || '#ffffff',
        box_enabled: to.box_enabled !== false,
        bg_color: to.bg_color || '#000000',
        box_border_width: Number(to.box_border_width) || 0,
        shadow: to.shadow !== false,
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
      if (event.status === 'failed' && event.error) {
        console.error('FFmpeg Transcoding Error Details:', event.error);
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

    if (dom.btnCopyLink) {
      dom.btnCopyLink.onclick = () => {
        const fullUrl = `${window.location.origin}${downloadUrl}`;
        navigator.clipboard.writeText(fullUrl).then(() => {
          if (dom.copyLinkText) dom.copyLinkText.textContent = 'Kopyalandı!';
          showToast('İndirme bağlantısı panoya kopyalandı.', 'success');
          setTimeout(() => {
            if (dom.copyLinkText) dom.copyLinkText.textContent = 'Bağlantıyı Kopyala';
          }, 2000);
        });
      };
    }

    switchView('complete');

    // Automatically ask user where to save the video
    setTimeout(() => {
      if (dom.saveLocationModal) {
        dom.saveLocationModal.classList.remove('hidden');
        refreshIcons();
      }
    }, 350);

    showToast('Video başarıyla işlendi! 🎉', 'success');
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
      dom.updateProgressStatus.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-indigo-400"></i> İndirme başlatılıyor...';
      dom.updateProgressBar.style.width = '0%';
      dom.updateProgressPct.textContent = '0%';
      refreshIcons();

      try {
        const res = await fetch('/api/updates/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ download_url: pendingDownloadUrl }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Güncelleme başlatılamadı');

        // Poll progress
        const pollInterval = setInterval(async () => {
          try {
            const pRes = await fetch('/api/updates/progress');
            if (!pRes.ok) return;
            const progress = await pRes.json();

            if (progress.status === 'downloading') {
              const pct = progress.percent || 0;
              dom.updateProgressBar.style.width = `${pct}%`;
              if (progress.total_bytes > 0) {
                const dlMb = (progress.downloaded_bytes / (1024 * 1024)).toFixed(1);
                const totMb = (progress.total_bytes / (1024 * 1024)).toFixed(1);
                dom.updateProgressPct.textContent = `${pct}% (${dlMb} / ${totMb} MB)`;
              } else {
                dom.updateProgressPct.textContent = `${pct}%`;
              }
              dom.updateProgressStatus.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-indigo-400"></i> Yeni sürüm indiriliyor...';
              refreshIcons();
            } else if (progress.status === 'installing' || progress.status === 'completed') {
              clearInterval(pollInterval);
              dom.updateProgressBar.style.width = '100%';
              dom.updateProgressPct.textContent = '100%';
              dom.updateProgressStatus.innerHTML = '<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i> Güncelleme kuruluyor! Yeniden başlıyor...';
              refreshIcons();
              showToast('Güncelleme uygulanıyor! koala-cut yeniden başlatılıyor... 🐨', 'success');

              setTimeout(() => {
                window.location.reload();
              }, 4000);
            } else if (progress.status === 'error') {
              clearInterval(pollInterval);
              throw new Error(progress.error || 'İndirme hatası oluştu');
            }
          } catch (pollErr) {
            // Ignore temporary network hiccups during poll
          }
        }, 600);
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

    // Sync version string on startup
    fetch('/api/updates/status')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.current_version && dom.headerVersionText) {
          dom.headerVersionText.textContent = `v${data.current_version}`;
        }
      })
      .catch(() => {});

    // Check silently 2.5 seconds after app startup
    setTimeout(() => checkForUpdates(false), 2500);
  }

  // ---------------------------------------------------------------------------
  // AI Suite: Live Subtitle Overlay Preview
  // ---------------------------------------------------------------------------
  function updateLiveSubtitleOverlay(curTime) {
    if (!dom.playerSubtitleOverlay || !dom.playerSubtitleText) return;
    if (!state.subtitles || !state.subtitles.segments || state.subtitles.segments.length === 0) {
      dom.playerSubtitleOverlay.classList.add('hidden');
      return;
    }
    const seg = state.subtitles.segments.find((s) => curTime >= s.start && curTime <= s.end);
    if (seg && seg.text && seg.text.trim()) {
      dom.playerSubtitleText.textContent = seg.text.trim();
      dom.playerSubtitleOverlay.classList.remove('hidden');
    } else {
      dom.playerSubtitleOverlay.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // AI Suite: Smart Silence Removal & Auto Jump Cut
  // ---------------------------------------------------------------------------
  function initSilenceDetector() {
    if (!dom.btnSmartSilence || !dom.modalSilenceDetector) return;

    dom.btnSmartSilence.addEventListener('click', () => {
      if (!state.fileId) {
        showToast('Lütfen önce bir video yükleyin.', 'error');
        return;
      }
      dom.modalSilenceDetector.classList.remove('hidden');
      refreshIcons();
    });

    const closeModal = () => {
      dom.modalSilenceDetector.classList.add('hidden');
      if (dom.silenceResultsBox) dom.silenceResultsBox.classList.add('hidden');
      if (dom.silenceScanningIndicator) dom.silenceScanningIndicator.classList.add('hidden');
    };

    if (dom.btnCloseSilenceModal) dom.btnCloseSilenceModal.addEventListener('click', closeModal);
    if (dom.btnCancelSilenceCut) dom.btnCancelSilenceCut.addEventListener('click', closeModal);

    if (dom.sliderSilenceThreshold && dom.silenceThresholdBadge) {
      dom.sliderSilenceThreshold.addEventListener('input', (e) => {
        dom.silenceThresholdBadge.textContent = `${e.target.value} dB`;
      });
    }

    if (dom.btnStartSilenceScan) {
      dom.btnStartSilenceScan.addEventListener('click', async () => {
        if (!state.fileId) return;

        dom.btnStartSilenceScan.disabled = true;
        if (dom.silenceScanningIndicator) dom.silenceScanningIndicator.classList.remove('hidden');
        if (dom.silenceResultsBox) dom.silenceResultsBox.classList.add('hidden');

        try {
          const res = await fetch('/api/ai/silence-detect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_id: state.fileId,
              noise_threshold_db: parseFloat(dom.sliderSilenceThreshold ? dom.sliderSilenceThreshold.value : -35),
              min_silence_sec: parseFloat(dom.selectMinSilence ? dom.selectMinSilence.value : 0.5),
              padding_sec: parseFloat(dom.selectSilencePad ? dom.selectSilencePad.value : 0.1),
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || 'Sessizlik taraması başarısız oldu');
          }

          const result = await res.json();
          state.lastSilenceResult = result;

          if (dom.silenceCountBadge) {
            dom.silenceCountBadge.textContent = `🎯 ${result.silence_count} sessizlik bulundu`;
          }
          if (dom.silenceSavedBadge) {
            dom.silenceSavedBadge.textContent = `${result.total_silence_duration}s (%${result.saved_percent}) Tasarruf`;
          }

          if (dom.silenceResultsBox) dom.silenceResultsBox.classList.remove('hidden');
          showToast(`Tarama tamamlandı! ${result.silence_count} sessizlik aralığı tespit edildi. 🎯`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          if (dom.silenceScanningIndicator) dom.silenceScanningIndicator.classList.add('hidden');
          dom.btnStartSilenceScan.disabled = false;
        }
      });
    }

    if (dom.btnApplySilenceCut) {
      dom.btnApplySilenceCut.addEventListener('click', () => {
        if (!state.lastSilenceResult || !state.lastSilenceResult.speech_segments || state.lastSilenceResult.speech_segments.length === 0) {
          showToast('Kırpılacak konuşma segmenti bulunamadı.', 'error');
          return;
        }

        pushTimelineHistory();

        const v1 = getV1Track();
        if (!v1) return;

        let cumulativeTime = 0.0;
        const newClips = state.lastSilenceResult.speech_segments.map((seg, idx) => {
          const clipId = `clip_${Date.now()}_${idx}`;
          const clip = createClip(
            clipId,
            seg.start,
            seg.end,
            cumulativeTime,
            1.0,
            1.0,
            state.fileId,
            state.filename,
            `/api/media/${state.fileId}`
          );
          cumulativeTime += (seg.end - seg.start);
          return clip;
        });

        v1.clips = newClips;
        state.selectedClipId = newClips[0] ? newClips[0].id : null;

        renderAllTracks();
        updateTimelineDurationBadge();
        updateClipInspector();
        syncPreviewToTimeline(0, false);
        closeModal();

        showToast(`Auto Jump-Cut uygulandı! ${newClips.length} konuşma klibi bağlandı ✂️`, 'success');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // AI Suite: Faster-Whisper Subtitle Studio
  // ---------------------------------------------------------------------------
  function initSubtitleStudio() {
    if (!dom.btnGenerateSubtitles) return;

    dom.btnGenerateSubtitles.addEventListener('click', async () => {
      if (!state.fileId) {
        showToast('Lütfen önce bir video yükleyin.', 'error');
        return;
      }

      dom.btnGenerateSubtitles.disabled = true;
      if (dom.subtitleLoadingBar) dom.subtitleLoadingBar.classList.remove('hidden');
      if (dom.subtitleResultsContainer) dom.subtitleResultsContainer.classList.add('hidden');

      try {
        const modelSize = dom.selectWhisperModel ? dom.selectWhisperModel.value : 'base';
        const language = dom.selectWhisperLang ? dom.selectWhisperLang.value : 'tr';

        const res = await fetch('/api/ai/subtitles/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_id: state.fileId,
            model_size: modelSize,
            language: language,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Altyazı oluşturulamadı');
        }

        const data = await res.json();
        state.subtitles = data;

        renderSubtitleItems(data.segments);
        if (dom.subtitleResultsContainer) dom.subtitleResultsContainer.classList.remove('hidden');

        showToast(`Yapay zeka ${data.segments.length} satır altyazıyı çıkardı! 📝`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (dom.subtitleLoadingBar) dom.subtitleLoadingBar.classList.add('hidden');
        dom.btnGenerateSubtitles.disabled = false;
      }
    });

    function renderSubtitleItems(segments) {
      if (!dom.subtitleItemsList) return;
      dom.subtitleItemsList.innerHTML = '';

      if (!segments || segments.length === 0) {
        dom.subtitleItemsList.innerHTML = '<div class="p-3 text-center text-xs text-slate-500">Konuşma metni bulunamadı.</div>';
        return;
      }

      segments.forEach((seg) => {
        const item = document.createElement('div');
        item.className = 'subtitle-item flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-white/5 hover:border-amber-500/30 transition-colors text-xs gap-2 cursor-pointer';
        item.dataset.start = seg.start;
        item.dataset.end = seg.end;

        item.innerHTML = `
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span class="font-mono text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-500/10">${formatTime(seg.start)}</span>
            <span class="text-slate-500 text-[10px]">→</span>
            <span class="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">${formatTime(seg.end)}</span>
          </div>
          <input type="text" class="subtitle-text-input flex-1 bg-transparent border-b border-transparent hover:border-slate-600 focus:border-amber-400 text-slate-200 text-xs px-1 py-0.5 outline-none font-medium truncate" value="${seg.text.replace(/"/g, '&quot;')}">
        `;

        item.querySelector('.flex-shrink-0').addEventListener('click', () => {
          syncPreviewToTimeline(seg.start, false);
        });

        const input = item.querySelector('.subtitle-text-input');
        input.addEventListener('input', (e) => {
          seg.text = e.target.value;
          updateLiveSubtitleOverlay(state.playheadTime);
        });

        dom.subtitleItemsList.appendChild(item);
      });
    }

    if (dom.btnDownloadSrt) {
      dom.btnDownloadSrt.addEventListener('click', () => {
        if (!state.subtitles || !state.subtitles.id) {
          showToast('Önce altyazı oluşturmalısınız.', 'error');
          return;
        }
        window.location.href = `/api/ai/subtitles/${state.subtitles.id}/download?format=srt`;
      });
    }

    if (dom.btnDownloadVtt) {
      dom.btnDownloadVtt.addEventListener('click', () => {
        if (!state.subtitles || !state.subtitles.id) {
          showToast('Önce altyazı oluşturmalısınız.', 'error');
          return;
        }
        window.location.href = `/api/ai/subtitles/${state.subtitles.id}/download?format=vtt`;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Subtitle Typography & Styling Module
  // ---------------------------------------------------------------------------
  function applySubtitleStyleToPreview() {
    if (!dom.playerSubtitleOverlay || !dom.playerSubtitleText) return;
    const style = state.subtitleStyle || {
      preset: 'box',
      font: 'Arial',
      fontSize: 22,
      color: '#ffffff',
      position: 'bottom',
    };

    // 1. Font, Size, Color
    dom.playerSubtitleText.style.fontFamily = style.font;
    dom.playerSubtitleText.style.fontSize = `${style.fontSize}px`;
    dom.playerSubtitleText.style.color = style.color;

    // 2. Position
    dom.playerSubtitleOverlay.classList.remove('bottom-6', 'top-6', 'top-1/2', '-translate-y-1/2');
    if (style.position === 'top') {
      dom.playerSubtitleOverlay.classList.add('top-6');
    } else if (style.position === 'middle') {
      dom.playerSubtitleOverlay.classList.add('top-1/2', '-translate-y-1/2');
    } else {
      dom.playerSubtitleOverlay.classList.add('bottom-6');
    }

    // 3. Preset / Form styling
    dom.playerSubtitleText.style.maxWidth = '85%';
    dom.playerSubtitleText.style.width = 'auto';

    if (style.preset === 'outline') {
      dom.playerSubtitleText.style.backgroundColor = 'transparent';
      dom.playerSubtitleText.style.border = 'none';
      dom.playerSubtitleText.style.boxShadow = 'none';
      dom.playerSubtitleText.style.backdropFilter = 'none';
      dom.playerSubtitleText.style.fontWeight = 'bold';
      dom.playerSubtitleText.style.textShadow = '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 2px 0 #000, 2px 0 0 #000, 0 -2px 0 #000, -2px 0 0 #000';
      dom.playerSubtitleText.style.padding = '2px 8px';
      dom.playerSubtitleText.style.borderRadius = '0px';
    } else if (style.preset === 'yellow_pop') {
      dom.playerSubtitleText.style.backgroundColor = 'transparent';
      dom.playerSubtitleText.style.border = 'none';
      dom.playerSubtitleText.style.boxShadow = 'none';
      dom.playerSubtitleText.style.backdropFilter = 'none';
      dom.playerSubtitleText.style.color = '#FFE81F';
      dom.playerSubtitleText.style.fontWeight = '900';
      dom.playerSubtitleText.style.textShadow = '3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000';
      dom.playerSubtitleText.style.padding = '2px 8px';
      dom.playerSubtitleText.style.borderRadius = '0px';
    } else if (style.preset === 'shadow') {
      dom.playerSubtitleText.style.backgroundColor = 'transparent';
      dom.playerSubtitleText.style.border = 'none';
      dom.playerSubtitleText.style.boxShadow = 'none';
      dom.playerSubtitleText.style.backdropFilter = 'none';
      dom.playerSubtitleText.style.fontWeight = 'bold';
      dom.playerSubtitleText.style.textShadow = '0 3px 8px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)';
      dom.playerSubtitleText.style.padding = '2px 8px';
      dom.playerSubtitleText.style.borderRadius = '0px';
    } else if (style.preset === 'bar') {
      dom.playerSubtitleText.style.backgroundColor = 'rgba(0,0,0,0.75)';
      dom.playerSubtitleText.style.border = 'none';
      dom.playerSubtitleText.style.boxShadow = 'none';
      dom.playerSubtitleText.style.backdropFilter = 'blur(4px)';
      dom.playerSubtitleText.style.fontWeight = 'bold';
      dom.playerSubtitleText.style.textShadow = 'none';
      dom.playerSubtitleText.style.padding = '8px 24px';
      dom.playerSubtitleText.style.borderRadius = '0px';
      dom.playerSubtitleText.style.width = '100%';
      dom.playerSubtitleText.style.maxWidth = '100%';
    } else {
      // Default: box
      dom.playerSubtitleText.style.backgroundColor = 'rgba(0,0,0,0.85)';
      dom.playerSubtitleText.style.border = '1px solid rgba(255,255,255,0.15)';
      dom.playerSubtitleText.style.boxShadow = '0 8px 16px rgba(0,0,0,0.5)';
      dom.playerSubtitleText.style.backdropFilter = 'blur(4px)';
      dom.playerSubtitleText.style.fontWeight = 'bold';
      dom.playerSubtitleText.style.textShadow = 'none';
      dom.playerSubtitleText.style.padding = '6px 14px';
      dom.playerSubtitleText.style.borderRadius = '6px';
    }
  }

  function initSubtitleTypography() {
    if (!dom.subtitlePresetsGrid) return;

    // Preset buttons
    const presetButtons = dom.subtitlePresetsGrid.querySelectorAll('.subtitle-preset-btn');
    const presetLabels = {
      box: 'Kutucuklu',
      outline: 'Konturlu',
      yellow_pop: 'TikTok Sarı',
      shadow: 'Gölge',
      bar: 'Sinematik Şerit',
    };

    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        state.subtitleStyle.preset = preset;

        presetButtons.forEach((b) => {
          b.classList.remove('active', 'bg-amber-500/20', 'border-amber-500/40', 'text-white');
          b.classList.add('bg-slate-800', 'border-white/5', 'text-slate-300');
        });
        btn.classList.remove('bg-slate-800', 'border-white/5', 'text-slate-300');
        btn.classList.add('active', 'bg-amber-500/20', 'border-amber-500/40', 'text-white');

        if (dom.subtitlePresetBadge) {
          dom.subtitlePresetBadge.textContent = presetLabels[preset] || preset;
        }

        applySubtitleStyleToPreview();
      });
    });

    // Font Family
    if (dom.subtitleFontFamily) {
      dom.subtitleFontFamily.addEventListener('change', (e) => {
        state.subtitleStyle.font = e.target.value;
        applySubtitleStyleToPreview();
      });
    }

    // Font Size
    if (dom.subtitleFontSize) {
      dom.subtitleFontSize.addEventListener('input', (e) => {
        const sz = parseInt(e.target.value, 10);
        state.subtitleStyle.fontSize = sz;
        if (dom.subtitleSizeVal) dom.subtitleSizeVal.textContent = `${sz}px`;
        applySubtitleStyleToPreview();
      });
    }

    // Color Picker & Quick Palette
    if (dom.subtitleColorPicker) {
      dom.subtitleColorPicker.addEventListener('input', (e) => {
        state.subtitleStyle.color = e.target.value;
        applySubtitleStyleToPreview();
      });
    }

    const quickColors = document.querySelectorAll('.subtitle-color-quick');
    quickColors.forEach((btn) => {
      btn.addEventListener('click', () => {
        const clr = btn.dataset.color;
        state.subtitleStyle.color = clr;
        if (dom.subtitleColorPicker) dom.subtitleColorPicker.value = clr;
        applySubtitleStyleToPreview();
      });
    });

    // Vertical Position
    if (dom.subtitlePositionGroup) {
      const posButtons = dom.subtitlePositionGroup.querySelectorAll('.subtitle-pos-btn');
      posButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const pos = btn.dataset.pos;
          state.subtitleStyle.position = pos;

          posButtons.forEach((b) => {
            b.classList.remove('active', 'bg-amber-500/20', 'border-amber-500/40', 'text-white');
            b.classList.add('bg-slate-800', 'text-slate-300');
          });
          btn.classList.remove('bg-slate-800', 'text-slate-300');
          btn.classList.add('active', 'bg-amber-500/20', 'border-amber-500/40', 'text-white');

          applySubtitleStyleToPreview();
        });
      });
    }

    applySubtitleStyleToPreview();
  }

  // ---------------------------------------------------------------------------
  // Custom Video Text Overlays Module
  // ---------------------------------------------------------------------------
  function updateLiveTextOverlays(curTime) {
    if (!dom.playerTextOverlaysContainer) return;
    dom.playerTextOverlaysContainer.innerHTML = '';

    if (!state.textOverlays || state.textOverlays.length === 0) return;

    // Check text track visibility (eye toggle on timeline header)
    const textTrack = state.tracks.find((t) => t.type === 'text');
    if (textTrack && textTrack.visible === false) return;

    const activeList = state.textOverlays.filter(
      (to) => curTime >= to.start_time && curTime <= to.end_time
    );

    activeList.forEach((to) => {
      const div = document.createElement('div');
      div.className = 'absolute inline-block pointer-events-none select-none text-center transition-all';
      div.style.left = `${to.pos_x}%`;
      div.style.top = `${to.pos_y}%`;
      div.style.transform = 'translate(-50%, -50%)';
      div.style.fontFamily = to.font_family || 'Arial';
      div.style.fontSize = `${to.font_size || 28}px`;
      div.style.color = to.color || '#ffffff';
      div.style.fontWeight = 'bold';
      div.style.whiteSpace = 'pre-wrap';
      div.style.maxWidth = '90%';

      if (to.box_enabled) {
        const bg = to.bg_color || '#000000';
        div.style.backgroundColor = bg.startsWith('#') ? `${bg}b3` : bg;
        div.style.padding = '4px 12px';
        div.style.borderRadius = '4px';
      }

      if (to.shadow) {
        div.style.textShadow = '2px 2px 4px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.5)';
      }

      div.textContent = to.text || '';
      dom.playerTextOverlaysContainer.appendChild(div);
    });
  }

  function initTextOverlayModule() {
    if (!dom.btnAddTextOverlay) return;

    dom.btnAddTextOverlay.addEventListener('click', () => {
      const curTime = Math.round((state.playheadTime || 0) * 10) / 10;
      const dur = state.duration || 10;
      const endTime = Math.round(Math.min(dur, curTime + 4.0) * 10) / 10;

      const newOverlay = {
        id: 'txt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        text: 'Yeni Başlık / Metin',
        start_time: curTime,
        end_time: endTime > curTime ? endTime : curTime + 2.0,
        pos_x: 50.0,
        pos_y: 40.0,
        font_family: 'Montserrat',
        font_size: 28,
        color: '#ffffff',
        box_enabled: true,
        bg_color: '#000000',
        box_border_width: 0,
        shadow: true,
      };

      state.textOverlays.push(newOverlay);
      syncTextOverlaysToTrack();
      renderTextOverlaysList();
      renderAllTracks();
      selectClip(newOverlay.id);
      updateLiveTextOverlays(state.playheadTime);
      showToast('Yeni metin katmanı timeline izine eklendi ✍️', 'success');
    });

    renderTextOverlaysList();
  }

  function renderTextOverlaysList() {
    if (!dom.textOverlaysList) return;
    dom.textOverlaysList.innerHTML = '';

    if (!state.textOverlays || state.textOverlays.length === 0) {
      if (dom.textOverlaysEmpty) {
        dom.textOverlaysList.appendChild(dom.textOverlaysEmpty);
        dom.textOverlaysEmpty.classList.remove('hidden');
      }
      return;
    }

    if (dom.textOverlaysEmpty) {
      dom.textOverlaysEmpty.classList.add('hidden');
    }

    state.textOverlays.forEach((overlay, idx) => {
      const card = document.createElement('div');
      card.className = 'p-3 rounded-xl bg-slate-900/90 border border-white/5 space-y-2.5';
      card.dataset.overlayId = overlay.id;

      card.innerHTML = `
        <!-- Card Header -->
        <div class="flex items-center justify-between pb-1 border-b border-white/5">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-indigo-400">#${idx + 1}</span>
            <span class="text-xs font-medium text-slate-200 truncate max-w-[130px] overlay-title-label">${overlay.text || 'Başlık'}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-mono text-slate-400 overlay-timing-badge">${formatTime(overlay.start_time)} - ${formatTime(overlay.end_time)}</span>
            <button type="button" class="btn-delete-overlay p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer" title="Metni Sil">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Text Content Input -->
        <div>
          <label class="text-[10px] text-slate-400 block mb-1">Metin İçeriği:</label>
          <input type="text" class="input-overlay-text w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-400" value="${(overlay.text || '').replace(/"/g, '&quot;')}">
        </div>

        <!-- Timing Row -->
        <div class="grid grid-cols-2 gap-2 items-end">
          <div>
            <label class="text-[10px] text-slate-400 block mb-1">Başlangıç (sn):</label>
            <input type="number" step="0.1" min="0" class="input-overlay-start w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none font-mono" value="${overlay.start_time}">
          </div>
          <div>
            <label class="text-[10px] text-slate-400 block mb-1">Bitiş (sn):</label>
            <input type="number" step="0.1" min="0" class="input-overlay-end w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none font-mono" value="${overlay.end_time}">
          </div>
        </div>

        <!-- Position Controls (X % / Y %) -->
        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="flex items-center justify-between mb-0.5">
              <label class="text-[10px] text-slate-400">Yatay (X):</label>
              <span class="text-[10px] font-mono text-indigo-400 overlay-x-val">${overlay.pos_x}%</span>
            </div>
            <input type="range" min="0" max="100" step="1" value="${overlay.pos_x}" class="input-overlay-x w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg">
          </div>
          <div>
            <div class="flex items-center justify-between mb-0.5">
              <label class="text-[10px] text-slate-400">Dikey (Y):</label>
              <span class="text-[10px] font-mono text-indigo-400 overlay-y-val">${overlay.pos_y}%</span>
            </div>
            <input type="range" min="0" max="100" step="1" value="${overlay.pos_y}" class="input-overlay-y w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg">
          </div>
        </div>

        <!-- Font Family, Size & Color -->
        <div class="grid grid-cols-3 gap-2 items-end">
          <div>
            <label class="text-[10px] text-slate-400 block mb-1">Font:</label>
            <select class="select-overlay-font w-full bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-1 text-xs text-white outline-none cursor-pointer">
              <option value="Arial" ${overlay.font_family === 'Arial' ? 'selected' : ''}>Arial</option>
              <option value="Montserrat" ${overlay.font_family === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
              <option value="Impact" ${overlay.font_family === 'Impact' ? 'selected' : ''}>Impact</option>
              <option value="Roboto" ${overlay.font_family === 'Roboto' ? 'selected' : ''}>Roboto</option>
              <option value="Poppins" ${overlay.font_family === 'Poppins' ? 'selected' : ''}>Poppins</option>
            </select>
          </div>
          <div>
            <div class="flex items-center justify-between mb-0.5">
              <label class="text-[10px] text-slate-400">Boyut:</label>
              <span class="text-[10px] font-mono text-indigo-400 overlay-size-val">${overlay.font_size}px</span>
            </div>
            <input type="range" min="14" max="72" step="1" value="${overlay.font_size}" class="input-overlay-size w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg">
          </div>
          <div>
            <label class="text-[10px] text-slate-400 block mb-1">Renk:</label>
            <input type="color" class="input-overlay-color w-full h-7 rounded border border-white/10 bg-transparent cursor-pointer" value="${overlay.color || '#ffffff'}">
          </div>
        </div>

        <!-- Styling Options: Box & Shadow -->
        <div class="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] text-slate-300">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" class="check-overlay-box accent-indigo-500 rounded cursor-pointer" ${overlay.box_enabled ? 'checked' : ''}>
            <span>Kutulu Arka Plan</span>
          </label>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" class="check-overlay-shadow accent-indigo-500 rounded cursor-pointer" ${overlay.shadow ? 'checked' : ''}>
              <span>Gölge</span>
            </label>
            <input type="color" class="input-overlay-bgcolor w-5 h-5 rounded border border-white/10 bg-transparent cursor-pointer ${overlay.box_enabled ? '' : 'opacity-40 pointer-events-none'}" value="${overlay.bg_color || '#000000'}" title="Kutu Rengi">
          </div>
        </div>
      `;

      // Event Listeners for this card
      const textInput = card.querySelector('.input-overlay-text');
      const startInput = card.querySelector('.input-overlay-start');
      const endInput = card.querySelector('.input-overlay-end');
      const xInput = card.querySelector('.input-overlay-x');
      const yInput = card.querySelector('.input-overlay-y');
      const fontSelect = card.querySelector('.select-overlay-font');
      const sizeInput = card.querySelector('.input-overlay-size');
      const colorInput = card.querySelector('.input-overlay-color');
      const boxCheck = card.querySelector('.check-overlay-box');
      const shadowCheck = card.querySelector('.check-overlay-shadow');
      const bgColorInput = card.querySelector('.input-overlay-bgcolor');
      const deleteBtn = card.querySelector('.btn-delete-overlay');
      const titleLabel = card.querySelector('.overlay-title-label');
      const timingBadge = card.querySelector('.overlay-timing-badge');
      const xVal = card.querySelector('.overlay-x-val');
      const yVal = card.querySelector('.overlay-y-val');
      const sizeVal = card.querySelector('.overlay-size-val');

      textInput.addEventListener('input', (e) => {
        overlay.text = e.target.value;
        titleLabel.textContent = overlay.text || 'Başlık';
        syncTextOverlaysToTrack();
        renderAllTracks();
        updateLiveTextOverlays(state.playheadTime);
      });

      startInput.addEventListener('change', (e) => {
        overlay.start_time = Math.max(0, parseFloat(e.target.value) || 0);
        timingBadge.textContent = `${formatTime(overlay.start_time)} - ${formatTime(overlay.end_time)}`;
        syncTextOverlaysToTrack();
        renderAllTracks();
        updateLiveTextOverlays(state.playheadTime);
      });

      endInput.addEventListener('change', (e) => {
        overlay.end_time = Math.max(overlay.start_time + 0.2, parseFloat(e.target.value) || 0);
        timingBadge.textContent = `${formatTime(overlay.start_time)} - ${formatTime(overlay.end_time)}`;
        syncTextOverlaysToTrack();
        renderAllTracks();
        updateLiveTextOverlays(state.playheadTime);
      });

      xInput.addEventListener('input', (e) => {
        overlay.pos_x = parseFloat(e.target.value);
        xVal.textContent = `${overlay.pos_x}%`;
        updateLiveTextOverlays(state.playheadTime);
      });

      yInput.addEventListener('input', (e) => {
        overlay.pos_y = parseFloat(e.target.value);
        yVal.textContent = `${overlay.pos_y}%`;
        updateLiveTextOverlays(state.playheadTime);
      });

      fontSelect.addEventListener('change', (e) => {
        overlay.font_family = e.target.value;
        updateLiveTextOverlays(state.playheadTime);
      });

      sizeInput.addEventListener('input', (e) => {
        overlay.font_size = parseInt(e.target.value, 10);
        sizeVal.textContent = `${overlay.font_size}px`;
        updateLiveTextOverlays(state.playheadTime);
      });

      colorInput.addEventListener('input', (e) => {
        overlay.color = e.target.value;
        updateLiveTextOverlays(state.playheadTime);
      });

      boxCheck.addEventListener('change', (e) => {
        overlay.box_enabled = e.target.checked;
        if (overlay.box_enabled) {
          bgColorInput.classList.remove('opacity-40', 'pointer-events-none');
        } else {
          bgColorInput.classList.add('opacity-40', 'pointer-events-none');
        }
        updateLiveTextOverlays(state.playheadTime);
      });

      shadowCheck.addEventListener('change', (e) => {
        overlay.shadow = e.target.checked;
        updateLiveTextOverlays(state.playheadTime);
      });

      bgColorInput.addEventListener('input', (e) => {
        overlay.bg_color = e.target.value;
        updateLiveTextOverlays(state.playheadTime);
      });

      deleteBtn.addEventListener('click', () => {
        state.textOverlays = state.textOverlays.filter((o) => o.id !== overlay.id);
        syncTextOverlaysToTrack();
        renderTextOverlaysList();
        renderAllTracks();
        updateLiveTextOverlays(state.playheadTime);
      });

      dom.textOverlaysList.appendChild(card);
    });

    refreshIcons();
  }

  // ---------------------------------------------------------------------------
  // Dark / Light Theme Controller
  // ---------------------------------------------------------------------------
  function applyTheme(theme) {
    state.theme = theme;
    try {
      localStorage.setItem('koala_theme', theme);
    } catch (_) {}

    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
      if (dom.themeIconSun) dom.themeIconSun.classList.remove('hidden');
      if (dom.themeIconMoon) dom.themeIconMoon.classList.add('hidden');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      if (dom.themeIconSun) dom.themeIconSun.classList.add('hidden');
      if (dom.themeIconMoon) dom.themeIconMoon.classList.remove('hidden');
    }

    renderTimelineRuler();
    refreshIcons();
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    showToast(nextTheme === 'light' ? 'Açık tema aktifleştirildi' : 'Karanlık tema aktifleştirildi', 'info');
  }

  function initThemeController() {
    applyTheme(state.theme);
    if (dom.btnThemeToggle) {
      dom.btnThemeToggle.addEventListener('click', toggleTheme);
    }
  }

  // ---------------------------------------------------------------------------
  // Preview Proxy Quality Controller (N-3)
  // ---------------------------------------------------------------------------
  function getPreviewStreamUrl(fileId, quality = state.previewQuality) {
    if (!fileId) return '';
    const q = quality || '720p';
    return `/api/preview/${fileId}?quality=${q}`;
  }

  function setPreviewQuality(quality) {
    state.previewQuality = quality;
    try {
      localStorage.setItem('koala_preview_quality', quality);
    } catch (_) {}

    if (dom.selectPreviewQuality && dom.selectPreviewQuality.value !== quality) {
      dom.selectPreviewQuality.value = quality;
    }

    if (!state.fileId || !dom.videoPlayer) return;

    const currentTime = dom.videoPlayer.currentTime || state.playheadTime || 0;
    const wasPlaying = !dom.videoPlayer.paused && state.isPlaying;

    if (dom.proxyLoadingIndicator) {
      dom.proxyLoadingIndicator.classList.remove('hidden');
    }

    currentLoadedFileId = null;
    const newUrl = getPreviewStreamUrl(state.fileId, quality);
    dom.videoPlayer.src = newUrl;

    const onLoaded = () => {
      dom.videoPlayer.currentTime = currentTime;
      if (wasPlaying) {
        dom.videoPlayer.play().catch(() => {});
      }
      if (dom.proxyLoadingIndicator) {
        dom.proxyLoadingIndicator.classList.add('hidden');
      }
      dom.videoPlayer.removeEventListener('loadeddata', onLoaded);
    };

    dom.videoPlayer.addEventListener('loadeddata', onLoaded, { once: true });
    setTimeout(() => {
      if (dom.proxyLoadingIndicator) {
        dom.proxyLoadingIndicator.classList.add('hidden');
      }
    }, 4000);

    const qualityLabels = {
      original: 'Orijinal',
      '1080p': '1080p Full HD',
      '720p': '720p HD (Önerilen)',
      '480p': '480p SD',
      '360p': '360p Ultra Hafif',
    };
    showToast(`Önizleme kalitesi: ${qualityLabels[quality] || quality}`, 'info');
  }

  function initPreviewQualityControls() {
    if (dom.selectPreviewQuality) {
      dom.selectPreviewQuality.value = state.previewQuality || '720p';
      dom.selectPreviewQuality.addEventListener('change', (e) => {
        setPreviewQuality(e.target.value);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Project Save & Load Controller (N-4: .koalaproject)
  // ---------------------------------------------------------------------------
  function syncExportUIFromState() {
    const aspectCards = document.querySelectorAll('.aspect-card');
    aspectCards.forEach((card) => {
      if (card.dataset.aspect === state.aspectRatio) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    const fitRadio = document.querySelector(`input[name="fit_mode"][value="${state.fitMode}"]`);
    if (fitRadio) fitRadio.checked = true;

    if (dom.selectResolution) dom.selectResolution.value = state.resolution;
    if (dom.selectFps) dom.selectFps.value = state.fps;

    if (state.compressionMode === 'crf') {
      if (dom.tabModeCrf) dom.tabModeCrf.click();
    } else {
      if (dom.tabModeTarget) dom.tabModeTarget.click();
    }
    if (dom.inputTargetMb) dom.inputTargetMb.value = state.targetSizeMb;
    if (dom.sliderTargetMb) dom.sliderTargetMb.value = state.targetSizeMb;
    if (dom.sliderCrf) dom.sliderCrf.value = state.crf;
    if (dom.selectCodec) dom.selectCodec.value = state.codec;
    if (dom.selectPreset) dom.selectPreset.value = state.preset;
    if (dom.checkRemoveAudio) dom.checkRemoveAudio.checked = state.removeAudio;
    if (dom.selectAudioBitrate) dom.selectAudioBitrate.value = state.audioBitrate;

    updateExportSummary();
    updateSavingsEstimate();
  }

  function exportProject() {
    if (!state.tracks || state.tracks.length === 0) {
      showToast('Kaydedilecek proje veya zaman çizgisi bulunamadı.', 'error');
      return;
    }

    const netDur = calculateNetDuration();
    const projectName = (state.filename || 'koala_project').replace(/\.[^/.]+$/, '');

    const projectData = {
      format_version: '1.0',
      app: 'koala-cut',
      created_at: new Date().toISOString(),
      project_name: projectName,
      source_media: {
        file_id: state.fileId,
        filename: state.filename,
        metadata: state.metadata,
        duration: state.duration,
        size_bytes: state.originalSize,
      },
      timeline: {
        tracks: state.tracks,
        playhead_time: state.playheadTime || 0,
        duration: netDur,
      },
      export_settings: {
        aspect_ratio: state.aspectRatio,
        fit_mode: state.fitMode,
        resolution: state.resolution,
        fps: state.fps,
        compression_mode: state.compressionMode,
        target_size_mb: state.targetSizeMb,
        crf: state.crf,
        codec: state.codec,
        preset: state.preset,
        remove_audio: state.removeAudio,
        audio_bitrate: state.audioBitrate,
      },
      subtitles: state.subtitles ? {
        segments: state.subtitles.segments || [],
      } : null,
      subtitle_style: state.subtitleStyle || null,
      text_overlays: state.textOverlays || [],
    };

    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeName = projectName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${safeName}.koalaproject`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast(`Proje başarıyla kaydedildi: ${filename} 💾`, 'success');
  }

  function importProjectFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData = JSON.parse(e.target.result);
        loadProjectIntoStudio(projectData);
      } catch (err) {
        showToast('Proje dosyası okunamadı veya bozuk: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function loadProjectIntoStudio(projectData) {
    if (!projectData) return;

    // Restore Media Metadata
    if (projectData.source_media) {
      state.fileId = projectData.source_media.file_id || null;
      state.filename = projectData.source_media.filename || `${projectData.project_name || 'proje'}.mp4`;
      state.metadata = projectData.source_media.metadata || null;
      state.duration = projectData.source_media.duration || projectData.timeline.duration || 0;
      state.originalSize = projectData.source_media.size_bytes || 0;
    }

    // Restore timeline with defensive sanitization
    state.tracks = (projectData.timeline.tracks || []).map((trk) => ({
      id: trk.id || 'v1',
      type: trk.type === 'audio' ? 'audio' : 'video',
      name: trk.name || (trk.type === 'audio' ? 'A1' : 'V1'),
      visible: trk.visible !== false,
      muted: Boolean(trk.muted),
      locked: Boolean(trk.locked),
      clips: Array.isArray(trk.clips) ? trk.clips.map((c) => ({
        ...c,
        in_point: typeof c.in_point === 'number' ? c.in_point : 0,
        out_point: typeof c.out_point === 'number' ? c.out_point : 1,
        timeline_start: typeof c.timeline_start === 'number' ? c.timeline_start : 0,
        speed: c.speed && c.speed > 0 ? c.speed : 1.0,
        volume: c.volume !== undefined ? c.volume : 1.0,
      })) : [],
    }));
    state.playheadTime = projectData.timeline.playhead_time || 0.0;
    state.selectedClipId = null;
    state.timelineHistory = [];

    // Restore export settings
    if (projectData.export_settings) {
      const s = projectData.export_settings;
      if (s.aspect_ratio) state.aspectRatio = s.aspect_ratio;
      if (s.fit_mode) state.fitMode = s.fit_mode;
      if (s.resolution) state.resolution = s.resolution;
      if (s.fps) state.fps = s.fps;
      if (s.compression_mode) state.compressionMode = s.compression_mode;
      if (s.target_size_mb) state.targetSizeMb = s.target_size_mb;
      if (s.crf) state.crf = s.crf;
      if (s.codec) state.codec = s.codec;
      if (s.preset) state.preset = s.preset;
      if (s.remove_audio !== undefined) state.removeAudio = Boolean(s.remove_audio);
      if (s.audio_bitrate) state.audioBitrate = s.audio_bitrate;
    }

    // Restore subtitles
    if (projectData.subtitles && projectData.subtitles.segments) {
      state.subtitles = {
        id: 'restored',
        segments: projectData.subtitles.segments,
        burn_subtitles: false,
      };
      if (dom.subtitleResultsContainer) dom.subtitleResultsContainer.classList.remove('hidden');
      if (dom.subtitleCountBadge) dom.subtitleCountBadge.textContent = `${state.subtitles.segments.length} segment`;
      renderSubtitleList();
    }

    // Restore subtitle styling
    if (projectData.subtitle_style) {
      state.subtitleStyle = Object.assign(state.subtitleStyle || {}, projectData.subtitle_style);
      if (dom.subtitleFontFamily) dom.subtitleFontFamily.value = state.subtitleStyle.font;
      if (dom.subtitleFontSize) {
        dom.subtitleFontSize.value = state.subtitleStyle.fontSize;
        if (dom.subtitleSizeVal) dom.subtitleSizeVal.textContent = `${state.subtitleStyle.fontSize}px`;
      }
      if (dom.subtitleColorPicker) dom.subtitleColorPicker.value = state.subtitleStyle.color;
      applySubtitleStyleToPreview();
    }

    // Restore text overlays
    if (projectData.text_overlays && Array.isArray(projectData.text_overlays)) {
      state.textOverlays = projectData.text_overlays;
      syncTextOverlaysToTrack();
      renderTextOverlaysList();
      updateLiveTextOverlays(state.playheadTime);
    }

    // Update UI Elements
    if (dom.metaFilename) {
      dom.metaFilename.textContent = state.filename;
      dom.metaFilename.title = state.filename;
    }
    if (dom.metaDuration) dom.metaDuration.textContent = formatTime(state.duration);
    if (dom.metaSize) dom.metaSize.textContent = formatBytes(state.originalSize);

    syncExportUIFromState();
    renderAllTracks();
    updateTimelineDurationBadge();

    if (state.fileId) {
      const streamUrl = getPreviewStreamUrl(state.fileId, state.previewQuality);
      currentLoadedFileId = state.fileId;
      dom.videoPlayer.src = streamUrl;
      dom.videoPlayer.load();
      syncPreviewToTimeline(state.playheadTime, false);
    }

    switchView('editor');
    showToast(`Proje yüklendi: ${projectData.project_name || state.filename} 📂`, 'success');
  }

  function initProjectHandlers() {
    if (dom.btnSaveProject) {
      dom.btnSaveProject.addEventListener('click', exportProject);
    }

    if (dom.btnLoadProject) {
      dom.btnLoadProject.addEventListener('click', () => {
        if (dom.projectFileInput) dom.projectFileInput.click();
      });
    }

    if (dom.btnHomeLoadProject) {
      dom.btnHomeLoadProject.addEventListener('click', () => {
        if (dom.projectFileInput) dom.projectFileInput.click();
      });
    }

    if (dom.projectFileInput) {
      dom.projectFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          importProjectFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Bootstrapping
  // ---------------------------------------------------------------------------
  function init() {
    initThemeController();
    initPreviewQualityControls();
    initProjectHandlers();
    initUploadHandlers();
    initPlayerControls();
    initCapCutTimelineStudio();
    initKeyboardShortcuts();
    initInspectorTabs();
    initAccordions();
    initSilenceDetector();
    initSubtitleStudio();
    initSubtitleTypography();
    initTextOverlayModule();
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
