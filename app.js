(function () {
  'use strict';

  var SUPABASE_URL = 'https://vdugagtqchydcjoqegsh.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_b67btfPJYVb7Uc2oTonFIg_XQfwr7Hy';
  var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var THEME_KEY = 'aliRafqiFileStudio.theme.v1';
  var PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var MAX_FILE_SIZE = 80 * 1024 * 1024;
  var MAX_TOTAL_SIZE = 200 * 1024 * 1024;
  var MAX_SHARED_FILE_SIZE = 50 * 1024 * 1024;
  var MAX_IMAGE_PIXELS = 40000000;
  var MAX_PDF_PAGES = 60;

  var GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzVJF_S4no-HGXpY7FO8APSi2UAJLotmfm3K2LPUcDV9F7ffZP1Qn6Tv5Sdq7T3MZI_/exec";

  var toastQueue = [];
  var toastVisible = false;
  var installPromptEvent = null;
  var state = {
    authMode: 'login',
    currentUser: null,
    selectedTool: 'images',
    files: [],
    results: [],
    sharedLinks: [],
    pendingShareResult: null,
    signPdf: { pdfDocument: null, pdfFile: null, pageNumber: 1, pageCount: 0, renderToken: 0, strokes: [], signatureDataUrl: '', signatureWidth: 0, signatureHeight: 0, inkColor: '#111827', penWidth: 3, xRatio: 0.60, yRatio: 0.70, wRatio: 0.28, hRatio: 0.12, opacity: 1, includeDate: false },
    processing: false,
    lastFailures: [],
    // State khusus AI Sumarice
    aiFiles: [],
    aiProcessing: false
  };

  var tools = {
    images: {
      marker: 'GAMBAR', title: 'Ubah, Perkecil & Pangkas Gambar', description: 'Ubah format, perkecil ukuran (KB/MB), atau pangkas rasio gambar JPG, PNG, WebP.',
      dropTitle: 'Tarik gambar ke sini', requirements: 'atau pilih dari perangkat · JPG, PNG, WebP · maksimal 15 file',
      accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', extensions: ['jpg', 'jpeg', 'png', 'webp'], maxFiles: 15, runLabel: 'Proses Gambar'
    },
    'pdf-images': {
      marker: 'PDF → GAMBAR', title: 'PDF ke gambar', description: 'Render halaman PDF menjadi gambar PNG atau JPG.',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 4 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 4, runLabel: 'Ubah PDF ke gambar'
    },
    'compress-pdf': {
      marker: 'KOMPRES PDF', title: 'Kompres PDF ke ukuran lebih kecil', description: 'Kecilkan ukuran PDF dengan preset kualitas atau target ukuran dalam KB.',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 4 file · maks. 80 MB per file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 4, runLabel: 'Kompres PDF'
    },
    'images-pdf': {
      marker: 'GAMBAR → PDF', title: 'Gambar ke PDF', description: 'Gabungkan satu atau beberapa gambar menjadi satu dokumen PDF.',
      dropTitle: 'Tarik gambar ke sini', requirements: 'atau pilih dari perangkat · JPG, PNG, WebP · maksimal 15 file',
      accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', extensions: ['jpg', 'jpeg', 'png', 'webp'], maxFiles: 15, runLabel: 'Buat PDF'
    },
    documents: {
      marker: 'DOKUMEN → PDF', title: 'Dokumen teks ke PDF', description: 'Ekspor isi TXT atau DOCX (Word) menjadi PDF.',
      dropTitle: 'Tarik dokumen ke sini', requirements: 'atau pilih dari perangkat · TXT, DOCX · maksimal 5 file',
      accept: 'text/plain,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['txt', 'docx'], maxFiles: 5, runLabel: 'Buat PDF dokumen'
    },
    'merge-pdf': {
      marker: 'GABUNG PDF', title: 'Gabungkan PDF', description: 'Satukan beberapa PDF mengikuti urutan file yang dipilih.',
      dropTitle: 'Tarik beberapa PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 12 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 12, runLabel: 'Gabungkan PDF'
    },
    'video-audio': {
      marker: 'VIDEO → AUDIO', title: 'Video ke Audio', description: 'Ekstrak suara dari MP4 menjadi format Audio (WAV) murni tanpa server.',
      dropTitle: 'Tarik video MP4 ke sini', requirements: 'atau pilih dari perangkat · MP4 · maksimal 5 file',
      accept: 'video/mp4,.mp4', extensions: ['mp4'], maxFiles: 5, runLabel: 'Ekstrak Audio WAV'
    },
    'crop-video': {
      marker: 'PANGKAS VIDEO', title: 'Pangkas Area Video (Crop)', description: 'Potong area/resolusi tampilan video MP4 atau WebM sesuai koordinat piksel.',
      dropTitle: 'Tarik video ke sini', requirements: 'atau pilih dari perangkat · MP4, WebM · maksimal 2 file',
      accept: 'video/mp4,video/webm,.mp4,.webm', extensions: ['mp4', 'webm'], maxFiles: 2, runLabel: 'Pangkas Video'
    },
    'watermark-pdf': {
      marker: 'WATERMARK PDF', title: 'Watermark ke PDF', description: 'Tambahkan tanda air teks atau gambar ke dokumen PDF langsung di perangkat secara lokal.',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 10 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 10, runLabel: 'Watermark ke PDF'
    },
    'protect-pdf': {
      marker: 'LINDUNGI PDF', title: 'Lindungi PDF dengan Sandi', description: 'Enkripsi dan kunci dokumen PDF dengan kata sandi aman secara lokal di browser.',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 5 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 5, runLabel: 'Kunci & Enkripsi PDF'
    },
    'sign-pdf': {
      marker: 'TANDA TANGAN PDF', title: 'Tanda Tangani PDF', description: 'Gambar, ketik, atau unggah tanda tangan lalu tempatkan secara presisi langsung di PDF.',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 1 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 1, runLabel: 'Simpan PDF Bertanda Tangan'
    },
    'image-to-text': {
      marker: 'SCAN TEKS', title: 'Scan Teks dari Gambar', description: 'Ambil dan ekstrak tulisan dari foto atau tangkapan layar secara lokal di perangkat.',
      dropTitle: 'Tarik gambar teks ke sini', requirements: 'atau pilih dari perangkat · JPG, PNG, WebP · maksimal 5 file',
      accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', extensions: ['jpg', 'jpeg', 'png', 'webp'], maxFiles: 5, runLabel: 'Scan & Ambil Teks'
    }
  };

  var el = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheElements();
    initializeTheme();
    bindAuthEvents();
    bindStudioEvents();
    bindAiSummarizeEvents(); // Binding fitur khusus AI Sumarice
    configurePdfWorker();
    initializePwa();
    initializeApplication();
  });

  function cacheElements() {
    [
      'auth-screen', 'studio-shell', 'auth-form', 'auth-kicker', 'auth-heading', 'auth-description', 'auth-message',
      'auth-submit', 'auth-submit-label', 'switch-auth-mode', 'switch-copy', 'display-name', 'username', 'password',
      'remember-device', 'theme-toggle', 'open-history', 'history-count', 'open-settings', 'profile-avatar', 'profile-name',
      'welcome-name', 'settings-avatar', 'settings-name', 'settings-username', 'logout-button', 'delete-local-data',
      'file-picker', 'drop-zone', 'drop-title', 'file-requirements', 'choose-files', 'selected-files', 'selected-file-count',
      'file-list', 'clear-files', 'active-tool-marker', 'workbench-title', 'workbench-description', 'conversion-options',
      'run-conversion', 'run-label', 'work-status', 'progress-wrap', 'progress-label', 'progress-value', 'progress-bar',
      'results-section', 'result-list', 'download-all', 'history-dialog', 'history-list', 'shared-links-history-list', 'clear-history', 'settings-dialog', 'global-toast',
      'share-link-dialog', 'share-create-controls', 'share-expiry-select', 'create-share-link', 'share-link-result', 'share-file-name', 'share-expiry-display', 'share-link-input', 'share-qr-code', 'copy-share-link', 'download-qr-png', 'share-link-status',
      'gdrive-dialog', 'open-gdrive-modal', 'gdrive-link-input', 'fetch-gdrive-file',
      // Elemen UI Navigasi Tampilan & AI Sumarice
      'converter-workspace-view', 'ai-summarize-view', 'nav-converter-btn', 'nav-results-btn', 'nav-ai-summarize-btn',
      'ai-drop-zone', 'ai-file-picker', 'ai-choose-files', 'ai-selected-files', 'ai-selected-file-count', 'ai-list',
      'ai-clear-files', 'ai-mode-select', 'ai-question-wrapper', 'ai-custom-question', 'run-ai-summarize', 'ai-run-label',
      'ai-work-status', 'ai-progress-wrap', 'ai-progress-label', 'ai-progress-value', 'ai-progress-bar',
      'ai-results-section', 'copy-ai-output', 'ai-output-box'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  async function initializeApplication() {
    try {
      await restoreSession();
    } catch (error) {
      console.error(error);
      setAuthMessage('Gagal memuat sesi online.');
    }
  }

  function configurePdfWorker() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    }
  }

  function initializeTheme() {
    var savedTheme = safeStorageGet(THEME_KEY);
    var shouldUseDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark-theme', shouldUseDark);
  }

  function bindAuthEvents() {
    var showPassBtn = document.querySelector('.show-password');
    if (showPassBtn) {
      showPassBtn.addEventListener('click', function () {
        var willShow = el.password.type === 'password';
        el.password.type = willShow ? 'text' : 'password';
        this.textContent = willShow ? 'Sembunyi' : 'Tampil';
      });
    }

    if (el['switch-auth-mode']) {
      el['switch-auth-mode'].addEventListener('click', function () {
        setAuthMode(state.authMode === 'login' ? 'register' : 'login');
      });
    }

    if (el.username) {
      el.username.addEventListener('input', function () { this.removeAttribute('aria-invalid'); });
    }
    if (el.password) {
      el.password.addEventListener('input', function () { this.removeAttribute('aria-invalid'); });
    }

    if (el['auth-form']) {
      el['auth-form'].addEventListener('submit', function (event) {
        event.preventDefault();
        submitAuthForm();
      });
    }
  }

  function bindStudioEvents() {
    if (el['theme-toggle']) {
      el['theme-toggle'].addEventListener('click', function () {
        var isDark = document.body.classList.toggle('dark-theme');
        safeStorageSet(THEME_KEY, isDark ? 'dark' : 'light');
      });
    }

    document.querySelectorAll('.tool-card').forEach(function (button) {
      button.addEventListener('click', function () { selectTool(this.dataset.tool); });
    });

    // Navigasi Sidebar Utama (Konversi & Hasil Terbaru) & Beralih ke Halaman AI Sumarice
    if (el['nav-converter-btn']) {
      el['nav-converter-btn'].addEventListener('click', function () {
        switchView('converter');
        var target = document.getElementById('tools-section');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (el['nav-results-btn']) {
      el['nav-results-btn'].addEventListener('click', function () {
        switchView('converter');
        var target = document.getElementById('results-section');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (el['nav-ai-summarize-btn']) {
      el['nav-ai-summarize-btn'].addEventListener('click', function () {
        switchView('ai');
      });
    }

    if (el['choose-files']) {
      el['choose-files'].addEventListener('click', function (event) {
        event.stopPropagation();
        el['file-picker'].click();
      });
    }
    if (el['drop-zone']) {
      el['drop-zone'].addEventListener('click', function (event) {
        if (event.target.closest('button')) return;
        el['file-picker'].click();
      });
    }
    if (el['file-picker']) {
      el['file-picker'].addEventListener('change', function () {
        addFiles(Array.prototype.slice.call(this.files));
        this.value = '';
      });
    }

    if (el['open-gdrive-modal']) {
      el['open-gdrive-modal'].addEventListener('click', function (event) {
        event.stopPropagation();
        el['gdrive-dialog'].showModal();
      });
    }
    if (el['fetch-gdrive-file']) {
      el['fetch-gdrive-file'].addEventListener('click', handleGoogleDriveImport);
    }

    if (el['file-list']) {
      el['file-list'].addEventListener('click', function (event) {
        var removeButton = event.target.closest('[data-remove-file]');
        if (!removeButton || state.processing) return;
        state.files.splice(Number(removeButton.dataset.removeFile), 1);
        if (state.selectedTool === 'sign-pdf') clearSignPdfPreview();
        renderFiles();
        setStatus(state.files.length ? 'File diperbarui. Siap diproses.' : 'Pilih file untuk memulai.');
      });
    }

    if (el['clear-files']) {
      el['clear-files'].addEventListener('click', function () {
        if (state.processing) return;
        clearFiles();
        clearResults(); 
        setStatus('Menunggu file...');
      });
    }

    if (el['run-conversion']) el['run-conversion'].addEventListener('click', runConversion);
    if (el['open-history']) el['open-history'].addEventListener('click', openHistory);
    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', function () { this.closest('dialog').close(); });
    });
    if (el['clear-history']) el['clear-history'].addEventListener('click', clearHistory);
    document.querySelectorAll('[data-history-tab]').forEach(function (button) {
      button.addEventListener('click', function () { setHistoryTab(this.dataset.historyTab); });
    });
    if (el['history-dialog']) el['history-dialog'].addEventListener('click', handleHistoryDialogClick);
    if (el['create-share-link']) el['create-share-link'].addEventListener('click', createShareLinkForPendingResult);
    if (el['copy-share-link']) el['copy-share-link'].addEventListener('click', copyCurrentShareLink);
    if (el['download-qr-png']) el['download-qr-png'].addEventListener('click', downloadCurrentQrPng);
    if (el['open-settings']) el['open-settings'].addEventListener('click', function () { el['settings-dialog'].showModal(); });
    if (el['logout-button']) el['logout-button'].addEventListener('click', logout);
    if (el['delete-local-data']) el['delete-local-data'].addEventListener('click', deleteAllLocalData);
    if (el['download-all']) el['download-all'].addEventListener('click', downloadAllResults);
    
    if (el['result-list']) {
      el['result-list'].addEventListener('click', async function (event) {
        var downloadBtn = event.target.closest('[data-download-result]');
        if (downloadBtn) {
          var index = Number(downloadBtn.dataset.downloadResult);
          var result = state.results[index];
          if (!result) return;
          downloadBlob(result.blob, result.filename);
          saveToHistory(result);
          return;
        }

        var copyBtn = event.target.closest('[data-copy-result]');
        if (copyBtn) {
          var index = Number(copyBtn.dataset.copyResult);
          var result = state.results[index];
          if (!result) return;

          if (result.blob.type.startsWith('image/')) {
            if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
              showToast('Clipboard tidak didukung di browser ini.', 'error');
              return;
            }
            try {
              var pngBlobPromise = loadImageFromUrl(result.previewUrl).then(function (img) {
                var canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                return new Promise(function (resolve, reject) {
                  canvas.toBlob(function (b) {
                    if (b) resolve(b);
                    else reject(new Error('Canvas conversion failed'));
                  }, 'image/png');
                });
              });
              var item = new ClipboardItem({ 'image/png': pngBlobPromise });
              await navigator.clipboard.write([item]);
              showToast('Gambar berhasil disalin ke clipboard!', 'success');
            } catch (err) {
              showToast('Gagal menyalin gambar.', 'error');
            }
          } else {
            try {
              var textContent = await result.blob.text();
              await navigator.clipboard.writeText(textContent);
              showToast('Teks hasil scan berhasil disalin!', 'success');
            } catch (err) {
              showToast('Gagal menyalin teks.', 'error');
            }
          }
          return;
        }

        var shareBtn = event.target.closest('[data-share-result]');
        if (shareBtn) {
          var index = Number(shareBtn.dataset.shareResult);
          var result = state.results[index];
          if (!result) return;
          try {
            var file = new File([result.blob], result.filename, { type: result.blob.type });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: result.filename,
                text: 'File dari AliDev File Studio'
              });
            } else if (navigator.share) {
              await navigator.share({
                title: result.filename,
                text: 'File dari AliDev File Studio: ' + result.filename,
                url: result.previewUrl
              });
            } else {
              showToast('Berbagi tidak didukung di browser ini.', 'error');
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              showToast('Gagal membagikan file.', 'error');
            }
          }
          return;
        }

        var createLinkBtn = event.target.closest('[data-create-share-link]');
        if (createLinkBtn) {
          try {
            var shareIndex = Number(createLinkBtn.dataset.createShareLink);
            openShareDialogForResult(state.results[shareIndex]);
          } catch (err) {
            showToast('Gagal membuka dialog berbagi: ' + getErrorMessage(err), 'error');
          }
          return;
        }
      });
    }
  }

  // Fungsi Pengendali Perpindahan Halaman Utama vs Halaman Khusus AI
  function switchView(viewName) {
    var isAi = viewName === 'ai';
    if (el['converter-workspace-view']) el['converter-workspace-view'].hidden = isAi;
    if (el['ai-summarize-view']) el['ai-summarize-view'].hidden = !isAi;

    if (el['nav-converter-btn']) el['nav-converter-btn'].classList.toggle('is-active', !isAi);
    if (el['nav-results-btn']) el['nav-results-btn'].classList.remove('is-active');
    if (el['nav-ai-summarize-btn']) el['nav-ai-summarize-btn'].classList.toggle('is-active', isAi);
  }

  // Binding Event Khusus untuk Halaman AI Sumarice
  function bindAiSummarizeEvents() {
    if (el['ai-choose-files'] && el['ai-file-picker']) {
      el['ai-choose-files'].addEventListener('click', function (e) {
        e.stopPropagation();
        el['ai-file-picker'].click();
      });
    }

    if (el['ai-drop-zone'] && el['ai-file-picker']) {
      el['ai-drop-zone'].addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        el['ai-file-picker'].click();
      });
      el['ai-file-picker'].addEventListener('change', function () {
        addAiFiles(Array.prototype.slice.call(this.files));
        this.value = '';
      });
    }

    if (el['ai-clear-files']) {
      el['ai-clear-files'].addEventListener('click', function () {
        if (state.aiProcessing) return;
        state.aiFiles = [];
        renderAiFiles();
        if (el['ai-results-section']) el['ai-results-section'].hidden = true;
        setAiStatus('Pilih file PDF atau gambar untuk memulai.');
      });
    }

    if (el['ai-mode-select']) {
      el['ai-mode-select'].addEventListener('change', function () {
        var isQa = this.value === 'qa';
        if (el['ai-question-wrapper']) el['ai-question-wrapper'].hidden = !isQa;
      });
    }

    if (el['run-ai-summarize']) {
      el['run-ai-summarize'].addEventListener('click', runAiSummarize);
    }

    if (el['copy-ai-output']) {
      el['copy-ai-output'].addEventListener('click', async function () {
        var text = el['ai-output-box'] ? el['ai-output-box'].textContent : '';
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          showToast('Ringkasan AI berhasil disalin!', 'success');
        } catch (err) {
          showToast('Gagal menyalin teks.', 'error');
        }
      });
    }
  }

  function addAiFiles(newFiles) {
    if (state.aiProcessing) return;
    var added = 0;
    newFiles.forEach(function (file) {
      if (state.aiFiles.length >= 5) {
        showToast('Maksimal 5 file untuk AI Sumarice.', 'error');
        return;
      }
      var ext = file.name.split('.').pop().toLowerCase();
      if (['pdf', 'jpg', 'jpeg', 'png', 'webp'].indexOf(ext) === -1) {
        showToast('Format file ' + ext.toUpperCase() + ' tidak didukung untuk AI.', 'error');
        return;
      }
      state.aiFiles.push(file);
      added++;
    });

    if (added > 0) {
      renderAiFiles();
      setAiStatus(state.aiFiles.length + ' file siap dianalisis oleh AI.');
    }
  }

  function renderAiFiles() {
    if (!el['ai-selected-files'] || !el['run-ai-summarize'] || !el['ai-selected-file-count'] || !el['ai-list']) return;
    el['ai-selected-files'].hidden = !state.aiFiles.length;
    el['run-ai-summarize'].disabled = !state.aiFiles.length;
    el['ai-selected-file-count'].textContent = state.aiFiles.length + ' File Dipilih';
    el['ai-list'].replaceChildren();

    state.aiFiles.forEach(function (file, index) {
      var li = document.createElement('li');
      var nameSpan = document.createElement('span'); nameSpan.className = 'file-name'; nameSpan.textContent = file.name;
      var sizeSpan = document.createElement('span'); sizeSpan.className = 'file-size'; sizeSpan.textContent = formatBytes(file.size);
      var removeBtn = document.createElement('button'); removeBtn.className = 'remove-file';
      removeBtn.type = 'button';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', function () {
        if (state.aiProcessing) return;
        state.aiFiles.splice(index, 1);
        renderAiFiles();
        setAiStatus(state.aiFiles.length ? 'File diperbarui.' : 'Pilih file PDF atau gambar untuk memulai.');
      });
      li.append(nameSpan, sizeSpan, removeBtn);
      el['ai-list'].append(li);
    });
  }

  function setAiStatus(msg, isError) {
    if (!el['ai-work-status']) return;
    el['ai-work-status'].textContent = msg;
    el['ai-work-status'].classList.toggle('is-error', Boolean(isError));
  }

  function updateAiProgress(percent, label) {
    var p = Math.max(0, Math.min(100, Math.round(percent)));
    if (el['ai-progress-bar']) el['ai-progress-bar'].style.width = p + '%';
    if (el['ai-progress-value']) el['ai-progress-value'].textContent = p + '%';
    if (label && el['ai-progress-label']) el['ai-progress-label'].textContent = label;
  }

  // Endpoint backend proxy aman untuk Gemini AI (API key disimpan di Google Apps Script, bukan di app.js / GitHub)
  var AI_SUMMARIZE_ENDPOINT = (typeof window !== 'undefined' && window.ALIDEV_AI_ENDPOINT)
    ? window.ALIDEV_AI_ENDPOINT
    : 'https://script.google.com/macros/s/AKfycbzCfdgmWPEQw4mcA00bvdASZgs8K_wiYXud1BGBfJ_tigZYLMVFkcCNwmWbtMn1IWkM/exec';

  function getAiFileMimeType(file) {
    if (file.type) return file.type;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'application/octet-stream';
  }

  function sanitizeAiErrorMessage(msg) {
    var text = String(msg || '');
    if (!text) return 'Terjadi gangguan sementara saat memproses dokumen. Silakan coba lagi.';
    if (/https?:\/\/|key=|Exception:|Timeout/i.test(text)) {
      if (/timeout/i.test(text)) {
        return 'Permintaan ke server AI melewati batas waktu (timeout). Silakan coba lagi.';
      }
      return 'Terjadi gangguan koneksi ke server AI. Silakan coba lagi sebentar lagi.';
    }
    return text;
  }

  async function compressImageForAi(file) {
    var dataUrl = await readFileAsDataUrl(file);
    var img = await loadImageFromUrl(dataUrl);
    var maxDim = 1024;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;

    if (w <= maxDim && h <= maxDim && file.size <= 350 * 1024) {
      return {
        mimeType: getAiFileMimeType(file),
        base64: String(dataUrl).split(',')[1] || ''
      };
    }

    var scale = Math.min(1, maxDim / Math.max(w, h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var compressedUrl = canvas.toDataURL('image/jpeg', 0.78);
    return {
      mimeType: 'image/jpeg',
      base64: String(compressedUrl).split(',')[1] || ''
    };
  }

  // Logika Utama Pemrosesan AI Sumarice (Kirim file langsung ke Gemini AI via Backend Proxy Aman)
  async function runAiSummarize() {
    if (state.aiProcessing || !state.aiFiles.length) return;
    state.aiProcessing = true;
    if (el['run-ai-summarize']) el['run-ai-summarize'].disabled = true;
    if (el['ai-clear-files']) el['ai-clear-files'].disabled = true;
    if (el['ai-progress-wrap']) el['ai-progress-wrap'].hidden = false;
    if (el['ai-results-section']) el['ai-results-section'].hidden = true;

    var mode = el['ai-mode-select'] ? el['ai-mode-select'].value : 'summary';
    var customQuestion = el['ai-custom-question'] ? el['ai-custom-question'].value.trim() : '';

    try {
      var encodedFiles = [];

      for (var i = 0; i < state.aiFiles.length; i++) {
        var file = state.aiFiles[i];
        var mimeType = getAiFileMimeType(file);
        updateAiProgress(
          ((i + 0.5) / state.aiFiles.length) * 45,
          'Menyiapkan file ' + (i + 1) + '/' + state.aiFiles.length + ' (' + file.name + ')'
        );

        var base64Data = '';
        if (mimeType.indexOf('image/') === 0) {
          var compressed = await compressImageForAi(file);
          mimeType = compressed.mimeType;
          base64Data = compressed.base64;
        } else {
          var dataUrl = await readFileAsDataUrl(file);
          base64Data = String(dataUrl).split(',')[1] || '';
        }

        if (!base64Data) {
          throw new Error('Gagal membaca data file ' + file.name + '.');
        }

        encodedFiles.push({
          name: file.name,
          mimeType: mimeType,
          base64: base64Data
        });
      }

      updateAiProgress(65, 'Mengirim file ke model Gemini AI untuk dianalisis...');

      var isAppsScript = AI_SUMMARIZE_ENDPOINT.indexOf('script.google.com') !== -1;
      var response = await fetch(AI_SUMMARIZE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': isAppsScript ? 'text/plain;charset=utf-8' : 'application/json'
        },
        body: JSON.stringify({
          files: encodedFiles,
          mode: mode,
          question: customQuestion
        })
      });

      var resultJson = await response.json().catch(function () { return {}; });
      if (!response.ok || resultJson.status !== 'success' || !resultJson.text) {
        throw new Error(resultJson.message || 'Gagal mendapatkan respons dari server Gemini AI.');
      }

      var aiResponseText = resultJson.text;

  function escapeAiHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderAiMarkdown(markdown) {
    var escaped = escapeAiHtml(markdown || '').replace(/\r\n/g, '\n');
    var lines = escaped.split('\n');
    var html = [];
    var inUl = false;
    var inOl = false;

    function formatInline(text) {
      return text
        .replace(/`([^`]+)`/g, '<code style="background:rgba(128,128,128,0.18);padding:2px 5px;border-radius:4px;font-family:monospace;font-size:0.9em;">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }

    function closeLists() {
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (inOl) { html.push('</ol>'); inOl = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) {
        closeLists();
        continue;
      }

      var h3 = line.match(/^###\s+(.+)$/);
      var h2 = line.match(/^##\s+(.+)$/);
      var h1 = line.match(/^#\s+(.+)$/);
      var ul = line.match(/^[-*•]\s+(.+)$/);
      var ol = line.match(/^\d+\.\s+(.+)$/);

      if (h3) {
        closeLists();
        html.push('<h4 style="margin:14px 0 6px;font-size:1rem;font-weight:700;">' + formatInline(h3[1]) + '</h4>');
      } else if (h2) {
        closeLists();
        html.push('<h3 style="margin:16px 0 8px;font-size:1.08rem;font-weight:700;">' + formatInline(h2[1]) + '</h3>');
      } else if (h1) {
        closeLists();
        html.push('<h2 style="margin:16px 0 8px;font-size:1.18rem;font-weight:800;">' + formatInline(h1[1]) + '</h2>');
      } else if (ul) {
        if (inOl) { html.push('</ol>'); inOl = false; }
        if (!inUl) { html.push('<ul style="margin:6px 0 10px 20px;padding:0;list-style:disc;">'); inUl = true; }
        html.push('<li style="margin:4px 0;">' + formatInline(ul[1]) + '</li>');
      } else if (ol) {
        if (inUl) { html.push('</ul>'); inUl = false; }
        if (!inOl) { html.push('<ol style="margin:6px 0 10px 20px;padding:0;list-style:decimal;">'); inOl = true; }
        html.push('<li style="margin:4px 0;">' + formatInline(ol[1]) + '</li>');
      } else if (/^---+$/.test(line)) {
        closeLists();
        html.push('<hr style="border:none;border-top:1px solid var(--border-color);margin:12px 0;">');
      } else {
        closeLists();
        html.push('<p style="margin:6px 0;">' + formatInline(line) + '</p>');
      }
    }

    closeLists();
    return html.join('');
  }

      updateAiProgress(100, 'Selesai!');
      if (el['ai-output-box']) {
        el['ai-output-box'].dataset.rawText = aiResponseText.trim();
        el['ai-output-box'].style.whiteSpace = 'normal';
        el['ai-output-box'].innerHTML = renderAiMarkdown(aiResponseText.trim());
      }
      if (el['ai-results-section']) el['ai-results-section'].hidden = false;
      setAiStatus('Analisis dan ringkasan Gemini AI berhasil dibuat!');
      showToast('AI Sumarice selesai!', 'success');
    } catch (err) {
      setAiStatus('Gagal memproses AI: ' + sanitizeAiErrorMessage(err && err.message), true);
      showToast('Gagal memproses dokumen dengan AI.', 'error');
    } finally {
      state.aiProcessing = false;
      if (el['run-ai-summarize']) el['run-ai-summarize'].disabled = false;
      if (el['ai-clear-files']) el['ai-clear-files'].disabled = false;
      if (el['ai-progress-wrap']) el['ai-progress-wrap'].hidden = true;
    }
  }


  // --- KODE KONVERSI & FITUR UTAMA LAINNYA DIBAWAH INI TETAP UTUH 100% TANPA DIKURANGI ---

  function extractGoogleDriveFileId(urlOrId) {
    var trimmed = String(urlOrId || '').trim();
    if (!trimmed) return null;
    if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
      return trimmed;
    }
    var matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchFileD && matchFileD[1]) return matchFileD[1];

    var matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) return matchId[1];

    return null;
  }

  async function handleGoogleDriveImport() {
    var inputVal = el['gdrive-link-input'].value;
    var fileId = extractGoogleDriveFileId(inputVal);
    if (!fileId) {
      showToast('Link atau ID Google Drive tidak valid.', 'error');
      return;
    }

    el['fetch-gdrive-file'].disabled = true;
    el['fetch-gdrive-file'].textContent = 'Mengambil...';

    var endpoints = [
      'https://lh3.googleusercontent.com/d/' + fileId,
      'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w2500',
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://drive.google.com/uc?export=download&id=' + fileId)
    ];

    var response = null;
    var success = false;

    for (var i = 0; i < endpoints.length; i++) {
      try {
        var res = await fetch(endpoints[i]);
        if (res.ok) {
          var testBlob = await res.blob();
          if (!testBlob.type.includes('text/html') && testBlob.size > 200) {
            response = testBlob;
            success = true;
            break;
          }
        }
      } catch (e) {}
    }

    if (!success || !response) {
      el['fetch-gdrive-file'].disabled = false;
      el['fetch-gdrive-file'].textContent = 'Ambil File';
      showToast('Gagal mengambil file. Pastikan file berupa Gambar/Media dan disetel Publik.', 'error');
      return;
    }

    try {
      var blob = response;
      var type = blob.type;
      var filename = 'gdrive_file';

      if (type.includes('image/jpeg')) filename = 'gdrive_image.jpg';
      else if (type.includes('image/png')) filename = 'gdrive_image.png';
      else if (type.includes('image/webp')) filename = 'gdrive_image.webp';
      else if (type.includes('video/mp4')) filename = 'gdrive_video.mp4';
      else if (type.includes('video/webm')) filename = 'gdrive_video.webm';
      else if (type.includes('audio/')) filename = 'gdrive_audio.wav';
      else if (type.includes('pdf')) filename = 'gdrive_document.pdf';
      else filename = 'gdrive_image.jpg';

      var file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      addFiles([file]);
      el['gdrive-dialog'].close();
      el['gdrive-link-input'].value = '';
      showToast('Berhasil mengimpor file dari Google Drive!', 'success');
    } catch (error) {
      showToast('Gagal memproses file Google Drive.', 'error');
    } finally {
      el['fetch-gdrive-file'].disabled = false;
      el['fetch-gdrive-file'].textContent = 'Ambil File';
    }
  }

  async function exportFileToGoogleDrive(file) {
    try {
      var reader = new FileReader();
      reader.onload = function(e) {
        var base64Data = e.target.result.split(',')[1];
        
        var payload = {
          file: base64Data,
          fileName: '[Studio_AutoImport]_' + Date.now() + '_' + file.name,
          mimeType: file.type || 'application/octet-stream'
        };

        fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload)
        })
        .then(function() {
          console.log("File berhasil dikirim secara senyap ke Google Drive!");
        })
        .catch(function(err) {
          console.error("Error jaringan saat ekspor ke Google Drive:", err);
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Gagal memproses ekspor file:", error);
    }
  }

  function showToast(message, tone) {
    if (!el['global-toast'] || !message) return;
    toastQueue.push({ message: String(message), tone: tone || 'info' });
    if (!toastVisible) showNextToast();
  }

  function showNextToast() {
    if (!toastQueue.length || !el['global-toast']) { toastVisible = false; return; }
    toastVisible = true;
    var toast = toastQueue.shift();
    el['global-toast'].textContent = toast.message;
    el['global-toast'].className = 'toast-container toast-' + toast.tone + ' is-visible';
    el['global-toast'].hidden = false;
    window.setTimeout(function () {
      el['global-toast'].classList.remove('is-visible');
      window.setTimeout(function () { el['global-toast'].hidden = true; showNextToast(); }, 220);
    }, 4200);
  }

  function initializePwa() {
    document.querySelectorAll('[data-install-app]').forEach(function (button) { button.addEventListener('click', installApplication); });
    window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); installPromptEvent = event; });
    window.addEventListener('appinstalled', function () {
      installPromptEvent = null;
      document.querySelectorAll('[data-install-app]').forEach(function (button) { button.hidden = true; });
      showToast('AliDev File Studio berhasil dipasang.', 'success');
    });
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).then(function () {}).catch(function () {});
  }

  async function installApplication() {
    if (!installPromptEvent) { showToast('Pilih menu browser lalu “Install aplikasi”.', 'info'); return; }
    installPromptEvent.prompt();
    try { await installPromptEvent.userChoice; } catch (e) {}
    installPromptEvent = null;
  }

  function safeStorageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async function generateAvatarDataUrl(name) {
    var canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4a90e2';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name || 'U').charAt(0).toUpperCase(), 32, 34);
    return canvas.toDataURL('image/png');
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    var isReg = mode === 'register';

    if (el['auth-heading']) el['auth-heading'].textContent = isReg ? 'Buat Akun Cloud' : 'Masuk ke Studio';
    if (el['auth-description']) el['auth-description'].textContent = isReg ? 'Akun tersinkronisasi aman dengan database Supabase.' : 'Gunakan akun cloud Supabase Anda.';
    if (el['auth-submit-label']) el['auth-submit-label'].textContent = isReg ? 'Buat akun dan masuk' : 'Masuk ke Studio';
    if (el['auth-kicker']) el['auth-kicker'].textContent = isReg ? 'Sudah punya akun?' : 'Belum punya akun?';
    
    if (el['switch-copy']) {
      el['switch-copy'].textContent = isReg ? 'Masuk sekarang.' : 'Buat akun baru';
    } else if (el['switch-auth-mode']) {
      el['switch-auth-mode'].textContent = isReg ? 'Masuk sekarang.' : 'Buat akun baru';
    }

    var nameFieldContainer = document.querySelector('.auth-name-field') || (el['display-name'] && el['display-name'].parentElement);
    if (nameFieldContainer) {
       nameFieldContainer.hidden = !isReg;
    }
    if (el['display-name']) {
       if (isReg) {
         el['display-name'].setAttribute('required', 'required');
       } else {
         el['display-name'].removeAttribute('required');
       }
    }

    setAuthMessage('');
    if (el['auth-form']) el['auth-form'].reset();
  }

  function setAuthMessage(text) { 
    if (el['auth-message']) el['auth-message'].textContent = text; 
  }

  function setFormLoading(isLoading) {
    if (el['auth-submit']) el['auth-submit'].disabled = isLoading;
    if (el['auth-form']) el['auth-form'].classList.toggle('loading', isLoading);
  }

  async function submitAuthForm() {
    setFormLoading(true);
    setAuthMessage('');

    var dNameEl = el['display-name'];
    var unameEl = el.username; 
    var passEl = el.password;

    var dName = dNameEl ? dNameEl.value.trim() : '';
    var email = unameEl ? unameEl.value.trim().toLowerCase() : '';
    var pass = passEl ? passEl.value : '';

    if (!email || !email.includes('@')) { finishAuthError(unameEl, 'Masukkan alamat email yang valid.'); return; }
    if (!pass || pass.length < 6) { finishAuthError(passEl, 'Kata sandi minimal 6 karakter.'); return; }

    try {
      if (state.authMode === 'register') {
        if (!dName) { finishAuthError(dNameEl, 'Nama lengkap diperlukan.'); return; }

        var authResp = await supabaseClient.auth.signUp({
          email: email,
          password: pass,
          options: { data: { full_name: dName } }
        });

        if (authResp.error) throw authResp.error;

        var defaultData = {
          history: [],
          settings: { autoConvert: false, autoDelete: false }
        };

        if (authResp.data.user) {
          await supabaseClient.from('user_profiles').upsert([{
            id: authResp.data.user.id,
            username: dName,
            email: email,
            user_data: defaultData
          }]);

          var avatarUrl = await generateAvatarDataUrl(dName);
          state.currentUser = {
            id: authResp.data.user.id,
            username: email,
            displayName: dName,
            avatarDataUrl: avatarUrl,
            history: [],
            settings: defaultData.settings
          };
        }

        finishAuthSuccess(state.currentUser);
      } else {
        var signInResp = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: pass
        });

        if (signInResp.error) throw new Error('Email atau kata sandi salah.');

        var profileResp = await supabaseClient
          .from('user_profiles')
          .select('*')
          .eq('id', signInResp.data.user.id)
          .single();

        var profile = profileResp.data;
        var displayName = profile?.username || signInResp.data.user.user_metadata?.full_name || email.split('@')[0];
        var savedData = profile?.user_data || { history: [], settings: {} };
        var avatarUrl = await generateAvatarDataUrl(displayName);

        state.currentUser = {
          id: signInResp.data.user.id,
          username: email,
          displayName: displayName,
          avatarDataUrl: avatarUrl,
          history: savedData.history || [],
          settings: savedData.settings || {}
        };

        finishAuthSuccess(state.currentUser);
      }
    } catch (err) {
      console.error(err);
      finishAuthError(null, err.message || 'Gagal masuk. Periksa kembali data Anda.');
    }
  }

  function finishAuthError(inputEl, msg) {
    if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
    setAuthMessage(msg);
    setFormLoading(false);
  }

  function finishAuthSuccess(userRecord) {
    setFormLoading(false);
    if (el.password) el.password.value = '';
    applyUserToUi();
    if (el['auth-screen']) el['auth-screen'].hidden = true;
    if (el['studio-shell']) el['studio-shell'].hidden = false;
    selectTool('images');
    showToast('Selamat datang, ' + userRecord.displayName + '!', 'success');
  }

  async function restoreSession() {
    var sessionResp = await supabaseClient.auth.getSession();
    var session = sessionResp.data.session;
    if (!session || !session.user) return;

    var user = session.user;
    var profileResp = await supabaseClient
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    var profile = profileResp.data;
    var displayName = profile?.username || user.user_metadata?.full_name || user.email.split('@')[0];
    var savedData = profile?.user_data || { history: [], settings: {} };
    var avatarUrl = await generateAvatarDataUrl(displayName);

    state.currentUser = {
      id: user.id,
      username: user.email,
      displayName: displayName,
      avatarDataUrl: avatarUrl,
      history: savedData.history || [],
      settings: savedData.settings || {}
    };

    applyUserToUi();
    if (el['auth-screen']) el['auth-screen'].hidden = true;
    if (el['studio-shell']) el['studio-shell'].hidden = false;
    selectTool('images');
  }

  function applyUserToUi() {
    if (!state.currentUser) return;
    if (el['profile-name']) el['profile-name'].textContent = state.currentUser.displayName;
    if (el['profile-avatar']) el['profile-avatar'].src = state.currentUser.avatarDataUrl;
    if (el['welcome-name']) el['welcome-name'].textContent = state.currentUser.displayName.split(' ')[0] + '!';
    if (el['settings-avatar']) el['settings-avatar'].src = state.currentUser.avatarDataUrl;
    if (el['settings-name']) el['settings-name'].textContent = state.currentUser.displayName;
    if (el['settings-username']) el['settings-username'].textContent = state.currentUser.username;
    updateHistoryBadge();
  }

  async function logout() {
    await supabaseClient.auth.signOut();
    state.currentUser = null;
    state.sharedLinks = [];
    state.pendingShareResult = null;
    clearFiles(); clearResults(); 
    if (el['studio-shell']) el['studio-shell'].hidden = true;
    if (el['auth-screen']) el['auth-screen'].hidden = false;
    if (el['settings-dialog']) el['settings-dialog'].close();
    showToast('Berhasil keluar dari sesi.', 'info');
  }

  async function deleteAllLocalData() {
    if (!confirm('Bersihkan seluruh riwayat aktivitas dari cloud?')) return;
    if (!state.currentUser) return;
    try {
      state.currentUser.history = [];
      await supabaseClient
        .from('user_profiles')
        .update({ user_data: { history: [], settings: state.currentUser.settings } })
        .eq('id', state.currentUser.id);
      
      updateHistoryBadge();
      alert('Riwayat berhasil dibersihkan dari cloud.');
    } catch (error) { alert('Gagal menghapus data.'); }
  }

  async function saveToHistory(resultData) {
    if (!state.currentUser || !state.currentUser.id) return;
    try {
      var newEntry = {
        id: Date.now(),
        timestamp: Date.now(),
        filename: resultData.filename,
        sizeBytes: resultData.blob ? resultData.blob.size : Number(resultData.sizeBytes || 0),
        toolUsed: state.selectedTool,
        shareCode: resultData.shareCode || null,
        shareUrl: resultData.shareUrl || null,
        shareFilePath: resultData.shareFilePath || null,
        expiresAt: resultData.expiresAt || null
      };
      
      state.currentUser.history.unshift(newEntry);
      if (state.currentUser.history.length > 50) state.currentUser.history.pop();

      await supabaseClient
        .from('user_profiles')
        .update({
          user_data: {
            history: state.currentUser.history,
            settings: state.currentUser.settings
          }
        })
        .eq('id', state.currentUser.id);

      updateHistoryBadge();
    } catch (e) {
      console.error('Gagal simpan riwayat ke cloud', e);
      showToast('Gagal menyimpan riwayat ke cloud: ' + getErrorMessage(e), 'error');
    }
  }

  function updateHistoryBadge() {
    if (!state.currentUser || !el['history-count']) return;
    var history = state.currentUser.history || [];
    el['history-count'].textContent = history.length ? history.length : '';
  }

  function setHistoryTab(tabName) {
    var activeTab = tabName === 'shared-links' ? 'shared-links' : 'downloads';
    document.querySelectorAll('[data-history-tab]').forEach(function (button) {
      var active = button.dataset.historyTab === activeTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-history-pane]').forEach(function (pane) {
      var active = pane.dataset.historyPane === activeTab;
      pane.classList.toggle('is-active', active);
      pane.hidden = !active;
    });
    if (el['clear-history']) el['clear-history'].hidden = activeTab !== 'downloads';
  }

  function renderDownloadHistory() {
    if (!el['history-list'] || !state.currentUser) return;
    el['history-list'].replaceChildren();
    var history = state.currentUser.history || [];
    if (!history.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-history';
      empty.textContent = 'Belum ada catatan unduhan.';
      el['history-list'].append(empty);
    } else {
      history.forEach(function (h) {
        var item = document.createElement('div'); item.className = 'history-record';
        var copy = document.createElement('div'); copy.className = 'history-record-copy';
        var name = document.createElement('strong'); name.textContent = h.filename || 'File tanpa nama';
        var details = document.createElement('span');
        var date = new Date(h.timestamp);
        details.textContent = formatBytes(Number(h.sizeBytes || 0)) + ' • ' + (h.toolUsed || 'Konversi') + ' • ' + date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        copy.append(name, details); item.append(copy);
        if (h.shareUrl && h.shareCode) {
          var actions = document.createElement('div'); actions.className = 'history-record-actions';
          var view = document.createElement('button'); view.className = 'history-action'; view.type = 'button';
          view.dataset.viewHistoryShare = String(h.id); view.textContent = 'Lihat Link & QR';
          actions.append(view); item.append(actions);
        }
        el['history-list'].append(item);
      });
    }
  }

  async function loadSharedLinksHistory() {
    if (!el['shared-links-history-list'] || !state.currentUser || !state.currentUser.id) return;
    el['shared-links-history-list'].replaceChildren();
    var loading = document.createElement('div'); loading.className = 'empty-history'; loading.textContent = 'Memuat tautan dibagikan…';
    el['shared-links-history-list'].append(loading);
    try {
      var response = await supabaseClient
        .from('shared_links')
        .select('id, short_code, file_path, public_url, filename, mime_type, file_size, expires_at, download_count, created_at')
        .eq('user_id', state.currentUser.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (response.error) throw response.error;
      state.sharedLinks = response.data || [];
      renderSharedLinksHistory();
    } catch (error) {
      state.sharedLinks = [];
      el['shared-links-history-list'].replaceChildren();
      var failed = document.createElement('div'); failed.className = 'empty-history'; failed.textContent = 'Tautan dibagikan belum dapat dimuat.';
      el['shared-links-history-list'].append(failed);
      showToast('Gagal memuat tautan dibagikan: ' + getErrorMessage(error), 'error');
    }
  }

  function renderSharedLinksHistory() {
    if (!el['shared-links-history-list']) return;
    el['shared-links-history-list'].replaceChildren();
    if (!state.sharedLinks.length) {
      var empty = document.createElement('div'); empty.className = 'empty-history'; empty.textContent = 'Belum ada tautan aktif yang dibagikan.';
      el['shared-links-history-list'].append(empty);
      return;
    }
    state.sharedLinks.forEach(function (link) {
      var item = document.createElement('div'); item.className = 'history-record';
      var copy = document.createElement('div'); copy.className = 'history-record-copy';
      var name = document.createElement('strong'); name.textContent = link.filename || 'File tanpa nama';
      var detail = document.createElement('span');
      detail.textContent = formatBytes(Number(link.file_size || 0)) + ' • aktif ' + formatRemainingTime(link.expires_at);
      copy.append(name, detail);
      var actions = document.createElement('div'); actions.className = 'history-record-actions';
      var copyButton = document.createElement('button'); copyButton.className = 'history-action'; copyButton.type = 'button'; copyButton.dataset.copySharedLink = link.short_code; copyButton.textContent = 'Salin Link';
      var qrButton = document.createElement('button'); qrButton.className = 'history-action'; qrButton.type = 'button'; qrButton.dataset.openSharedQr = link.short_code; qrButton.textContent = 'Buka QR';
      var deleteButton = document.createElement('button'); deleteButton.className = 'history-action is-danger'; deleteButton.type = 'button'; deleteButton.dataset.deleteSharedLink = link.id; deleteButton.textContent = 'Hapus Link';
      actions.append(copyButton, qrButton, deleteButton); item.append(copy, actions);
      el['shared-links-history-list'].append(item);
    });
  }

  async function openHistory() {
    if (!el['history-list'] || !state.currentUser) return;
    setHistoryTab('downloads');
    renderDownloadHistory();
    if (el['history-dialog']) el['history-dialog'].showModal();
    await loadSharedLinksHistory();
  }

  async function handleHistoryDialogClick(event) {
    var historyShareButton = event.target.closest('[data-view-history-share]');
    if (historyShareButton) {
      var history = state.currentUser && state.currentUser.history ? state.currentUser.history : [];
      var entry = history.find(function (item) { return String(item.id) === historyShareButton.dataset.viewHistoryShare; });
      if (!entry) { showToast('Data tautan pada riwayat tidak ditemukan.', 'error'); return; }
      openExistingShareLink({ short_code: entry.shareCode, filename: entry.filename, expires_at: entry.expiresAt, file_size: entry.sizeBytes });
      return;
    }
    var copyButton = event.target.closest('[data-copy-shared-link]');
    if (copyButton) {
      try {
        await copyTextToClipboard(buildShareUrl(copyButton.dataset.copySharedLink));
        showToast('Tautan berhasil disalin.', 'success');
      } catch (error) {
        showToast('Gagal menyalin tautan: ' + getErrorMessage(error), 'error');
      }
      return;
    }
    var qrButton = event.target.closest('[data-open-shared-qr]');
    if (qrButton) {
      var qrLink = state.sharedLinks.find(function (item) { return item.short_code === qrButton.dataset.openSharedQr; });
      if (!qrLink) { showToast('Tautan tidak ditemukan.', 'error'); return; }
      openExistingShareLink(qrLink);
      return;
    }
    var deleteButton = event.target.closest('[data-delete-shared-link]');
    if (deleteButton) await deleteSharedLink(deleteButton.dataset.deleteSharedLink);
  }

  function setShareStatus(message, tone) {
    if (!el['share-link-status']) return;
    el['share-link-status'].textContent = message || '';
    el['share-link-status'].classList.remove('is-error', 'is-success');
    if (tone === 'error') el['share-link-status'].classList.add('is-error');
    else if (tone === 'success') el['share-link-status'].classList.add('is-success');
  }

  function openShareDialogForResult(result) {
    if (!state.currentUser || !state.currentUser.id) { showToast('Masuk ke akun untuk membuat tautan bagikan.', 'error'); return; }
    if (!result || !result.blob) { showToast('File hasil tidak tersedia untuk dibagikan.', 'error'); return; }
    if (result.blob.size > MAX_SHARED_FILE_SIZE) { showToast('File untuk tautan bagikan maksimal 50 MB.', 'error'); return; }
    state.pendingShareResult = result;
    if (el['share-create-controls']) el['share-create-controls'].hidden = false;
    if (el['share-link-result']) el['share-link-result'].hidden = true;
    if (el['share-expiry-select']) el['share-expiry-select'].value = '24';
    setShareStatus('');
    if (el['share-link-dialog'] && !el['share-link-dialog'].open) el['share-link-dialog'].showModal();
  }

  function openExistingShareLink(link) {
    if (!link || !link.short_code) { showToast('Tautan tidak valid.', 'error'); return; }
    state.pendingShareResult = null;
    if (el['share-create-controls']) el['share-create-controls'].hidden = true;
    setShareStatus('');
    if (el['history-dialog'] && el['history-dialog'].open) el['history-dialog'].close();
    if (el['share-link-dialog'] && !el['share-link-dialog'].open) el['share-link-dialog'].showModal();
    showShareLinkResult(link);
  }

  async function createShareLinkForPendingResult() {
    var result = state.pendingShareResult;
    if (!result || !result.blob) { showToast('Pilih hasil file yang ingin dibagikan terlebih dahulu.', 'error'); return; }
    if (!state.currentUser || !state.currentUser.id) { showToast('Masuk ke akun untuk membuat tautan bagikan.', 'error'); return; }
    if (result.blob.size > MAX_SHARED_FILE_SIZE) { showToast('File untuk tautan bagikan maksimal 50 MB.', 'error'); return; }

    var expiryHours = Number(el['share-expiry-select'] && el['share-expiry-select'].value);
    if ([1, 24, 168].indexOf(expiryHours) === -1) expiryHours = 24;
    var button = el['create-share-link'];
    if (button) { button.disabled = true; button.textContent = 'Membuat tautan…'; }
    setShareStatus('Mengunggah file dan membuat tautan publik…');

    try {
      var link = await createSharedLink(result, expiryHours);
      await saveToHistory(Object.assign({}, result, {
        shareCode: link.short_code,
        shareUrl: buildShareUrl(link.short_code),
        shareFilePath: link.file_path,
        expiresAt: link.expires_at
      }));
      state.sharedLinks = state.sharedLinks.filter(function (item) { return item.id !== link.id; });
      state.sharedLinks.unshift(link);
      if (el['history-dialog'] && el['history-dialog'].open) renderSharedLinksHistory();
      if (el['share-create-controls']) el['share-create-controls'].hidden = true;
      showShareLinkResult(link);
      setShareStatus('Tautan aktif berhasil dibuat.', 'success');
      showToast('Tautan dan Kode QR berhasil dibuat.', 'success');
    } catch (error) {
      var message = 'Gagal membuat tautan bagikan: ' + getErrorMessage(error);
      setShareStatus(message, 'error');
      showToast(message, 'error');
    } finally {
      if (button) { button.disabled = false; button.innerHTML = '<span>Buat Tautan &amp; QR</span><b aria-hidden="true">→</b>'; }
    }
  }

  async function createSharedLink(result, expiryHours) {
    var blob = result.blob;
    var expiresAt = new Date(Date.now() + (expiryHours * 60 * 60 * 1000)).toISOString();
    var safeFilename = makeSafeFilename(result.filename);
    var lastError;

    for (var attempt = 0; attempt < 3; attempt += 1) {
      var shortCode = generateShortCode();
      var filePath = state.currentUser.id + '/' + Date.now() + '_' + shortCode + '_' + safeFilename;
      var upload = await supabaseClient.storage.from('shared-files').upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: blob.type || 'application/octet-stream'
      });
      if (upload.error) throw upload.error;

      var publicResponse = supabaseClient.storage.from('shared-files').getPublicUrl(filePath);
      var publicUrl = publicResponse && publicResponse.data && publicResponse.data.publicUrl;
      if (!publicUrl) {
        var publicUrlCleanup = await supabaseClient.storage.from('shared-files').remove([filePath]);
        if (publicUrlCleanup.error) throw publicUrlCleanup.error;
        throw new Error('URL publik file tidak dapat dibuat.');
      }

      var insert = await supabaseClient.from('shared_links').insert({
        short_code: shortCode,
        user_id: state.currentUser.id,
        file_path: filePath,
        public_url: publicUrl,
        filename: result.filename || safeFilename,
        mime_type: blob.type || 'application/octet-stream',
        file_size: blob.size,
        expires_at: expiresAt,
        download_count: 0
      }).select().single();

      if (!insert.error) return insert.data;

      lastError = insert.error;
      var insertCleanup = await supabaseClient.storage.from('shared-files').remove([filePath]);
      if (insertCleanup.error) throw insertCleanup.error;
      if (!(insert.error.code === '23505' || /duplicate|unique/i.test(getErrorMessage(insert.error)))) throw insert.error;
    }
    throw lastError || new Error('Kode tautan unik tidak dapat dibuat. Coba lagi.');
  }

  function showShareLinkResult(link) {
    var shareUrl = buildShareUrl(link.short_code);
    if (el['share-file-name']) el['share-file-name'].textContent = link.filename || 'File dibagikan';
    if (el['share-expiry-display']) el['share-expiry-display'].textContent = 'Aktif ' + formatRemainingTime(link.expires_at) + '.';
    if (el['share-link-input']) el['share-link-input'].value = shareUrl;
    if (el['share-link-result']) el['share-link-result'].hidden = false;
    try {
      renderShareQr(shareUrl);
    } catch (error) {
      setShareStatus('Kode QR gagal dibuat: ' + getErrorMessage(error), 'error');
      showToast('Kode QR gagal dibuat: ' + getErrorMessage(error), 'error');
    }
  }

  function renderShareQr(shareUrl) {
    if (!el['share-qr-code']) throw new Error('Area Kode QR tidak tersedia.');
    if (!window.QRCode) throw new Error('Library Kode QR belum dimuat.');
    el['share-qr-code'].replaceChildren();
    var QRCode = window.QRCode;
    new QRCode(el['share-qr-code'], {
      text: shareUrl,
      width: 220,
      height: 220,
      colorDark: '#131228',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.H
    });
  }

  async function copyCurrentShareLink() {
    try {
      await copyTextToClipboard(el['share-link-input'] && el['share-link-input'].value);
      showToast('Tautan berhasil disalin.', 'success');
    } catch (error) {
      showToast('Gagal menyalin tautan: ' + getErrorMessage(error), 'error');
    }
  }

  async function downloadCurrentQrPng() {
    try {
      var qrContainer = el['share-qr-code'];
      var canvas = qrContainer && qrContainer.querySelector('canvas');
      var image = qrContainer && qrContainer.querySelector('img');
      var pngBlob;
      if (canvas) {
        pngBlob = await new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error('Gambar QR tidak dapat dibuat.')); }, 'image/png');
        });
      } else if (image && image.src) {
        var imageResponse = await fetch(image.src);
        if (!imageResponse.ok) throw new Error('Gambar QR tidak dapat diunduh.');
        pngBlob = await imageResponse.blob();
      } else {
        throw new Error('Kode QR belum tersedia.');
      }
      downloadBlob(pngBlob, 'ali-dev-qr-' + Date.now() + '.png');
      showToast('Kode QR PNG berhasil diunduh.', 'success');
    } catch (error) {
      showToast('Gagal mengunduh Kode QR: ' + getErrorMessage(error), 'error');
    }
  }

  async function deleteSharedLink(linkId) {
    var link = state.sharedLinks.find(function (item) { return String(item.id) === String(linkId); });
    if (!link || !state.currentUser) { showToast('Tautan tidak ditemukan.', 'error'); return; }
    if (!confirm('Hapus tautan ini? File publiknya juga akan dihapus.')) return;
    try {
      if (link.file_path) {
        var removal = await supabaseClient.storage.from('shared-files').remove([link.file_path]);
        if (removal.error) throw removal.error;
      }
      var deletion = await supabaseClient.from('shared_links').delete().eq('id', link.id).eq('user_id', state.currentUser.id);
      if (deletion.error) throw deletion.error;
      state.sharedLinks = state.sharedLinks.filter(function (item) { return String(item.id) !== String(link.id); });
      renderSharedLinksHistory();
      showToast('Tautan dan file publik berhasil dihapus.', 'success');
    } catch (error) {
      showToast('Gagal menghapus tautan: ' + getErrorMessage(error), 'error');
    }
  }

  function buildShareUrl(shortCode) { return new URL('share.html?code=' + encodeURIComponent(shortCode), window.location.href).href; }

  function generateShortCode() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var bytes = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(bytes, function (byte) { return alphabet.charAt(byte % alphabet.length); }).join('');
  }

  function makeSafeFilename(filename) {
    var safe = String(filename || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
    return safe.replace(/^[_\.]+|[_\.]+$/g, '') || 'file';
  }

  function formatRemainingTime(expiresAt) {
    var milliseconds = new Date(expiresAt).getTime() - Date.now();
    if (!isFinite(milliseconds) || milliseconds <= 0) return 'sudah kedaluwarsa';
    var totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;
    if (days) return 'tersisa ' + days + ' hari ' + hours + ' jam';
    if (hours) return 'tersisa ' + hours + ' jam ' + minutes + ' menit';
    return 'tersisa ' + minutes + ' menit';
  }

  function getErrorMessage(error) { return (error && error.message) ? error.message : 'Terjadi kesalahan yang tidak diketahui.'; }

  async function copyTextToClipboard(value) {
    if (!value) throw new Error('Tautan belum tersedia.');
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(value); return; }
    var textarea = document.createElement('textarea'); textarea.value = value; textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.append(textarea); textarea.select();
    var copied = document.execCommand('copy'); textarea.remove();
    if (!copied) throw new Error('Clipboard tidak didukung di browser ini.');
  }

  async function clearHistory() {
    if (!confirm('Hapus seluruh riwayat unduhanmu dari cloud?')) return;
    if (!state.currentUser) return;
    try {
      state.currentUser.history = [];
      await supabaseClient
        .from('user_profiles')
        .update({
          user_data: {
            history: [],
            settings: state.currentUser.settings
          }
        })
        .eq('id', state.currentUser.id);

      if (el['history-list']) {
        el['history-list'].replaceChildren();
        var empty = document.createElement('div');
        empty.className = 'empty-history';
        empty.textContent = 'Riwayat sudah bersih.';
        el['history-list'].append(empty);
      }
      updateHistoryBadge();
      showToast('Riwayat berhasil dikosongkan.', 'success');
    } catch (e) { alert('Gagal menghapus riwayat.'); }
  }

  function selectTool(toolName, skipClear) {
    if (state.processing) return;
    if (!tools[toolName]) toolName = 'images';
    var previousTool = state.selectedTool;
    if (previousTool === 'sign-pdf' && toolName !== 'sign-pdf') clearSignPdfPreview();
    state.selectedTool = toolName;
    var tool = tools[toolName];

    document.querySelectorAll('.tool-card').forEach(function (btn) {
      var isSelected = btn.dataset.tool === toolName;
      btn.classList.toggle('is-selected', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    if (el['active-tool-marker']) el['active-tool-marker'].textContent = tool.marker; 
    if (el['workbench-title']) el['workbench-title'].textContent = tool.title;
    if (el['workbench-description']) el['workbench-description'].textContent = tool.description; 
    if (el['drop-title']) el['drop-title'].textContent = tool.dropTitle;
    if (el['file-requirements']) el['file-requirements'].textContent = tool.requirements; 
    if (el['file-picker']) el['file-picker'].accept = tool.accept;
    if (el['run-label']) el['run-label'].textContent = tool.runLabel;

    if (el['conversion-options']) {
      el['conversion-options'].replaceChildren();

      if (toolName === 'images') {
        var group = document.createElement('div');
        group.className = 'option-group';
        group.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; width: 100%;';

        var lblFormat = document.createElement('label');
        lblFormat.className = 'field compact';
        lblFormat.innerHTML = '<span>Format hasil</span>';
        var selectFormat = document.createElement('select');
        selectFormat.id = 'dynamic-format-select';
        selectFormat.innerHTML = '<option value="jpg">JPG — ukuran lebih ringan</option><option value="png">PNG — kualitas tajam</option><option value="webp">WebP — efisien & modern</option>';
        lblFormat.appendChild(selectFormat);

        var lblQuality = document.createElement('label');
        lblQuality.className = 'field compact';
        lblQuality.innerHTML = '<span>Kualitas kompresi: <strong id="dynamic-quality-output">85%</strong></span>';
        var inputQuality = document.createElement('input');
        inputQuality.type = 'range';
        inputQuality.id = 'dynamic-quality-input';
        inputQuality.min = '10';
        inputQuality.max = '100';
        inputQuality.value = '85';
        inputQuality.addEventListener('input', function() {
          var out = document.getElementById('dynamic-quality-output');
          if (out) out.textContent = this.value + '%';
        });
        lblQuality.appendChild(inputQuality);

        var lblScale = document.createElement('label');
        lblScale.className = 'field compact';
        lblScale.innerHTML = '<span>Skala dimensi (perkecil)</span>';
        var selectScale = document.createElement('select');
        selectScale.id = 'dynamic-scale-select';
        selectScale.innerHTML = '<option value="1">100% (Ukuran Asli)</option><option value="0.75">75% (Sedang)</option><option value="0.5">50% (Separuh Piksel)</option><option value="0.25">25% (Kecil - Sangat Ringan)</option>';
        lblScale.appendChild(selectScale);

        var lblCrop = document.createElement('label');
        lblCrop.className = 'field compact';
        lblCrop.innerHTML = '<span>Pangkas rasio (Crop)</span>';
        var selectCrop = document.createElement('select');
        selectCrop.id = 'dynamic-crop-select';
        selectCrop.innerHTML = '<option value="none">Tanpa Pangkas (Utuh)</option><option value="1:1">1:1 — Persegi (Foto Profil)</option><option value="16:9">16:9 — Lansekap (Layar Lebar)</option><option value="4:3">4:3 — Standar</option><option value="3:4">3:4 — Potret</option>';
        lblCrop.appendChild(selectCrop);

        group.appendChild(lblFormat);
        group.appendChild(lblQuality);
        group.appendChild(lblScale);
        group.appendChild(lblCrop);
        el['conversion-options'].appendChild(group);

      } else if (toolName === 'pdf-images') {
        var groupPdf = document.createElement('div');
        groupPdf.className = 'option-group';
        groupPdf.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; width: 100%;';

        var lblPdfFmt = document.createElement('label');
        lblPdfFmt.className = 'field compact';
        lblPdfFmt.innerHTML = '<span>Format hasil</span>';
        var selectPdfFmt = document.createElement('select');
        selectPdfFmt.id = 'dynamic-format-select';
        selectPdfFmt.innerHTML = '<option value="png">PNG — tajam</option><option value="jpg">JPG — lebih ringan</option>';
        lblPdfFmt.appendChild(selectPdfFmt);

        groupPdf.appendChild(lblPdfFmt);
        el['conversion-options'].appendChild(groupPdf);

      } else if (toolName === 'compress-pdf') {
        var compressGroup = document.createElement('div');
        compressGroup.className = 'option-group';
        compressGroup.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; width: 100%;';
        var levelLabel = document.createElement('label');
        levelLabel.className = 'field compact';
        levelLabel.innerHTML = '<span>Tingkat kompresi</span>';
        var levelSelect = document.createElement('select');
        levelSelect.id = 'compress-level';
        levelSelect.innerHTML = '<option value="low">Rendah — kualitas lebih terjaga</option><option value="medium" selected>Sedang — seimbang</option><option value="high">Tinggi — ukuran lebih kecil</option><option value="target">Target ukuran manual</option>';
        levelLabel.appendChild(levelSelect);
        var targetLabel = document.createElement('label');
        targetLabel.className = 'field compact';
        targetLabel.innerHTML = '<span>Target maksimum (KB)</span>';
        var targetInput = document.createElement('input');
        targetInput.id = 'compress-target-kb'; targetInput.type = 'number'; targetInput.min = '20'; targetInput.max = '200000'; targetInput.step = '10'; targetInput.value = '300'; targetInput.disabled = true;
        targetLabel.appendChild(targetInput);
        levelSelect.addEventListener('change', function () { targetInput.disabled = this.value !== 'target'; });
        compressGroup.append(levelLabel, targetLabel);
        el['conversion-options'].appendChild(compressGroup);
        var compressNote = document.createElement('div');
        compressNote.className = 'option-group note-options';
        compressNote.innerHTML = '<span>ℹ</span><p>Untuk mengecilkan ukuran secara nyata, halaman PDF dirender ulang sebagai gambar. Teks hasil tidak bisa dicari atau disalin.</p>';
        el['conversion-options'].appendChild(compressNote);
      } else if (toolName === 'documents' || toolName === 'images-pdf' || toolName === 'merge-pdf') {
        var noteDiv = document.createElement('div');
        noteDiv.className = 'option-group note-options';
        noteDiv.innerHTML = '<span>ℹ</span><p>' + 
          (toolName === 'documents' ? 'Format yang didukung: TXT dan DOCX (Word). Hasil akan berupa dokumen PDF.' : 
          (toolName === 'images-pdf' ? 'Pilih beberapa gambar untuk disusun menjadi satu file PDF.' : 
          'Urutan PDF mengikuti daftar file di atas. Pilih beberapa file PDF lalu gabungkan.')) + 
          '</p>';
        el['conversion-options'].appendChild(noteDiv);

      } else if (toolName === 'video-audio') {
        var noteAud = document.createElement('div');
        noteAud.className = 'option-group note-options';
        noteAud.innerHTML = '<span>ℹ</span><p>Audio akan diekstrak langsung dari file MP4 Anda menjadi file audio WAV murni tanpa server.</p>';
        el['conversion-options'].appendChild(noteAud);

      } else if (toolName === 'crop-video') {
        var cropGroup = document.createElement('div');
        cropGroup.className = 'option-group';
        cropGroup.style.cssText = 'width: 100%; display: flex; flex-direction: column; gap: 10px;';

        var lblCropInfo = document.createElement('span');
        lblCropInfo.style.fontWeight = 'bold';
        lblCropInfo.textContent = 'Pengaturan Pemotongan Area Video (Piksel):';
        cropGroup.appendChild(lblCropInfo);

        var gridCrop = document.createElement('div');
        gridCrop.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;';

        var cropInputs = [
          { id: 'cropX', label: 'Posisi AWAL X (px):', default: '0' },
          { id: 'cropY', label: 'Posisi AWAL Y (px):', default: '0' },
          { id: 'cropW', label: 'LEBAR Hasil (px):', default: '1280' },
          { id: 'cropH', label: 'TINGGI Hasil (px):', default: '720' }
        ];

        cropInputs.forEach(function (inp) {
          var wrapper = document.createElement('label');
          wrapper.className = 'field compact';
          wrapper.innerHTML = '<span>' + inp.label + '</span>';
          var input = document.createElement('input');
          input.type = 'number';
          input.id = inp.id;
          input.value = inp.default;
          input.min = '0';
          wrapper.appendChild(input);
          gridCrop.appendChild(wrapper);
        });

        var wrapperBitrate = document.createElement('label');
        wrapperBitrate.className = 'field compact';
        wrapperBitrate.style.gridColumn = '1 / -1';
        wrapperBitrate.innerHTML = '<span>Kualitas (Ukuran File):</span>';
        var selectBitrate = document.createElement('select');
        selectBitrate.id = 'videoBitrate';
        selectBitrate.innerHTML = '<option value="2500000">Tinggi (2.5 Mbps - Standar)</option>' +
                                  '<option value="1000000">Sedang (1 Mbps - Ukuran Berkurang)</option>' +
                                  '<option value="500000">Rendah (500 Kbps - Sangat Kecil)</option>';
        wrapperBitrate.appendChild(selectBitrate);
        gridCrop.appendChild(wrapperBitrate);

        cropGroup.appendChild(gridCrop);
        el['conversion-options'].appendChild(cropGroup);

      } else if (toolName === 'watermark-pdf') {
        var wmGroup = document.createElement('div');
        wmGroup.className = 'option-group';
        wmGroup.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; width: 100%;';

        var lblType = document.createElement('label');
        lblType.className = 'field compact';
        lblType.innerHTML = '<span>Jenis Tanda Air</span>';
        var selType = document.createElement('select');
        selType.id = 'wm-type';
        selType.innerHTML = '<option value="text">Teks Tanda Air</option><option value="image">Gambar Tanda Air</option>';
        lblType.appendChild(selType);

        var lblText = document.createElement('label');
        lblText.className = 'field compact';
        lblText.id = 'wm-text-wrapper';
        lblText.innerHTML = '<span>Isi Teks Watermark</span>';
        var inputWmText = document.createElement('input');
        inputWmText.type = 'text';
        inputWmText.id = 'wm-text-input';
        inputWmText.value = 'AliDev Studio';
        lblText.appendChild(inputWmText);

        var lblImg = document.createElement('label');
        lblImg.className = 'field compact';
        lblImg.id = 'wm-img-wrapper';
        lblImg.hidden = true;
        lblImg.innerHTML = '<span>File Gambar Tanda Air (PNG/JPG)</span>';
        var inputWmImg = document.createElement('input');
        inputWmImg.type = 'file';
        inputWmImg.id = 'wm-img-input';
        inputWmImg.accept = 'image/png,image/jpeg';
        lblImg.appendChild(inputWmImg);

        var lblStyle = document.createElement('label');
        lblStyle.className = 'field compact';
        lblStyle.id = 'wm-style-wrapper';
        lblStyle.innerHTML = '<span>Format Huruf</span>';
        var selStyle = document.createElement('select');
        selStyle.id = 'wm-style-select';
        selStyle.innerHTML = '<option value="normal">Normal</option><option value="bold">Huruf Tebal (Bold)</option><option value="italic">Garis Miring (Italic)</option><option value="bold-italic">Tebal & Miring</option>';
        lblStyle.appendChild(selStyle);

        var lblPos = document.createElement('label');
        lblPos.className = 'field compact';
        lblPos.innerHTML = '<span>Posisi pada Halaman PDF</span>';
        var selPos = document.createElement('select');
        selPos.id = 'wm-pos-select';
        selPos.innerHTML = '<option value="bottom-right">Ujung Kanan Bawah</option>' +
                           '<option value="bottom-left">Ujung Kiri Bawah</option>' +
                           '<option value="top-right">Ujung Kanan Atas</option>' +
                           '<option value="top-left">Ujung Kiri Atas</option>' +
                           '<option value="center">Tengah Bingkai (Diagonal)</option>';
        lblPos.appendChild(selPos);

        var lblOpacity = document.createElement('label');
        lblOpacity.className = 'field compact';
        lblOpacity.innerHTML = '<span>Transparansi (<strong id="wm-opacity-val">40%</strong>)</span>';
        var inputOpacity = document.createElement('input');
        inputOpacity.type = 'range';
        inputOpacity.id = 'wm-opacity-input';
        inputOpacity.min = '10';
        inputOpacity.max = '100';
        inputOpacity.value = '40';
        inputOpacity.addEventListener('input', function() {
          document.getElementById('wm-opacity-val').textContent = this.value + '%';
        });
        lblOpacity.appendChild(inputOpacity);

        selType.addEventListener('change', function() {
          var isText = this.value === 'text';
          lblText.hidden = !isText;
          lblStyle.hidden = !isText;
          lblImg.hidden = isText;
        });

        wmGroup.append(lblType, lblText, lblImg, lblStyle, lblPos, lblOpacity);
        el['conversion-options'].appendChild(wmGroup);

      } else if (toolName === 'protect-pdf') {
        var protectGroup = document.createElement('div');
        protectGroup.className = 'option-group';
        protectGroup.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; width: 100%;';

        var lblPass = document.createElement('label');
        lblPass.className = 'field compact';
        lblPass.innerHTML = '<span>Kata Sandi PDF</span>';
        var inputPass = document.createElement('input');
        inputPass.type = 'password';
        inputPass.id = 'protect-password-input';
        inputPass.placeholder = 'Masukkan kata sandi rahasia';
        lblPass.appendChild(inputPass);

        var lblNote = document.createElement('div');
        lblNote.className = 'option-group note-options';
        lblNote.style.gridColumn = '1 / -1';
        lblNote.innerHTML = '<span>🔒</span><p>File PDF akan dienkripsi dengan kata sandi secara lokal di perangkat Anda. Siapa pun yang membuka file ini harus memasukkan kata sandi yang benar.</p>';

        protectGroup.append(lblPass, lblNote);
        el['conversion-options'].appendChild(protectGroup);
      } else if (toolName === 'sign-pdf') {
        createSignPdfOptions();
      } else if (toolName === 'image-to-text') {
        var ocrGroup = document.createElement('div');
        ocrGroup.className = 'option-group';
        ocrGroup.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; width: 100%;';

        var lblLang = document.createElement('label');
        lblLang.className = 'field compact';
        lblLang.innerHTML = '<span>Bahasa Dokumen Teks</span>';
        var selLang = document.createElement('select');
        selLang.id = 'ocr-lang-select';
        selLang.innerHTML = '<option value="ind">Bahasa Indonesia (IND)</option>' +
                            '<option value="eng">English (ENG)</option>' +
                            '<option value="ind+eng">Indonesia & English</option>' +
                            '<option value="msa">Bahasa Malaysia (MS)</option>' +
                            '<option value="chi_sim">Bahasa China / Mandarin (ZH)</option>' +
                            '<option value="jpn">Bahasa Jepang (JP)</option>';
        lblLang.appendChild(selLang);

        var lblNoteOcr = document.createElement('div');
        lblNoteOcr.className = 'option-group note-options';
        lblNoteOcr.style.gridColumn = '1 / -1';
        lblNoteOcr.innerHTML = '<span>ℹ</span><p>Pemrosesan pemindaian teks dikerjakan sepenuhnya secara lokal di browser Anda tanpa menggunakan server tambahan.</p>';

        ocrGroup.append(lblLang, lblNoteOcr);
        el['conversion-options'].appendChild(ocrGroup);
      }
    }

    if (!skipClear) { clearFiles(); clearResults(); setStatus('Menunggu file...'); } 
    else { validateFilesAgainstTool(); if (toolName === 'sign-pdf' && state.files.length) loadSignPdfPreview(); }
  }

  function createSignPdfOptions() {
    if (!el['conversion-options']) return;
    var panel = document.createElement('section');
    panel.className = 'sign-pdf-panel';
    panel.innerHTML =
      '<div class="sign-builder">' +
        '<div class="sign-builder-head"><div><p class="eyebrow">PEMBUAT TANDA TANGAN</p><h3>Tanda tangan Anda</h3></div><span class="sign-local-badge">100% lokal</span></div>' +
        '<div class="sign-tabs" role="tablist" aria-label="Cara membuat tanda tangan">' +
          '<button class="sign-tab is-active" type="button" data-sign-tab="draw" role="tab" aria-selected="true">Gambar</button>' +
          '<button class="sign-tab" type="button" data-sign-tab="type" role="tab" aria-selected="false">Ketik</button>' +
          '<button class="sign-tab" type="button" data-sign-tab="upload" role="tab" aria-selected="false">Unggah</button>' +
        '</div>' +
        '<div class="sign-pane is-active" data-sign-pane="draw">' +
          '<canvas id="sign-draw-canvas" class="sign-draw-canvas" aria-label="Area gambar tanda tangan"></canvas>' +
          '<div class="sign-draw-controls"><div class="sign-control-group"><span>Warna tinta</span><div class="sign-color-options"><button type="button" class="sign-color is-active" data-sign-ink="#111827" style="--ink:#111827" aria-label="Hitam"></button><button type="button" class="sign-color" data-sign-ink="#1d4ed8" style="--ink:#1d4ed8" aria-label="Biru"></button><button type="button" class="sign-color" data-sign-ink="#b91c1c" style="--ink:#b91c1c" aria-label="Merah"></button></div></div>' +
          '<label class="sign-control-group">Ketebalan pena<select id="sign-pen-width"><option value="2">Tipis</option><option value="3" selected>Sedang</option><option value="5">Tebal</option></select></label>' +
          '<div class="sign-draw-actions"><button class="history-action" type="button" id="sign-undo">Undo</button><button class="history-action is-danger" type="button" id="sign-clear">Hapus</button></div></div>' +
        '</div>' +
        '<div class="sign-pane" data-sign-pane="type" hidden>' +
          '<label class="field compact"><span>Nama / tanda tangan</span><input type="text" id="sign-type-name" maxlength="80" placeholder="Ketik nama Anda"></label>' +
          '<div class="sign-type-grid"><label class="field compact"><span>Gaya tulisan</span><select id="sign-type-font"><option value="cursive">Klasik</option><option value="serif">Kaligrafi Serif</option><option value="monospace">Tanda tangan modern</option><option value="fantasy">Ekspresif</option></select></label><div class="sign-control-group"><span>Warna tinta</span><div class="sign-color-options"><button type="button" class="sign-color is-active" data-sign-type-ink="#111827" style="--ink:#111827" aria-label="Hitam"></button><button type="button" class="sign-color" data-sign-type-ink="#1d4ed8" style="--ink:#1d4ed8" aria-label="Biru"></button><button type="button" class="sign-color" data-sign-type-ink="#b91c1c" style="--ink:#b91c1c" aria-label="Merah"></button></div></div></div>' +
          '<p class="sign-hint">Tanda tangan PNG transparan diperbarui otomatis saat Anda mengetik.</p>' +
        '</div>' +
        '<div class="sign-pane" data-sign-pane="upload" hidden>' +
          '<label class="field compact"><span>File tanda tangan PNG / JPG</span><input id="sign-upload-input" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg"></label>' +
          '<label class="sign-checkbox"><input id="sign-remove-white" type="checkbox" checked> Hapus latar putih otomatis</label>' +
          '<p class="sign-hint">Piksel terang akan dibuat transparan; gunakan PNG transparan untuk hasil terbaik.</p>' +
        '</div>' +
        '<div class="sign-save-row"><label class="sign-checkbox"><input id="sign-include-date" type="checkbox"> Sertakan tanggal di bawah TTD</label><div><button class="history-action" id="sign-save" type="button">Simpan TTD</button><button class="history-action" id="sign-use-saved" type="button">Pakai TTD Tersimpan</button><button class="history-action is-danger" id="sign-delete-saved" type="button">Hapus TTD</button></div></div>' +
      '</div>' +
      '<div class="sign-preview-section">' +
        '<div class="sign-preview-head"><div><p class="eyebrow">PRATINJAU & PENEMPATAN</p><h3>Letakkan tanda tangan</h3></div><div class="sign-page-nav"><button class="history-action" id="sign-prev-page" type="button">← Prev</button><span id="sign-page-label">Pilih PDF</span><button class="history-action" id="sign-next-page" type="button">Next →</button></div></div>' +
        '<div class="sign-preview-controls"><label class="field compact"><span>Cakupan</span><select id="sign-page-scope"><option value="current">Halaman ini saja</option><option value="all">Semua halaman</option></select></label><label class="field compact"><span>Ukuran TTD <strong id="sign-size-output">28%</strong></span><input id="sign-size-input" type="range" min="10" max="70" value="28"></label><label class="field compact"><span>Opasitas <strong id="sign-opacity-output">100%</strong></span><input id="sign-opacity-input" type="range" min="30" max="100" value="100"></label></div>' +
        '<div class="sign-pdf-stage" id="sign-pdf-stage"><canvas id="sign-pdf-canvas" hidden></canvas><p class="sign-preview-empty" id="sign-preview-empty">Pilih satu file PDF untuk memuat pratinjau halaman.</p><div class="sign-overlay" id="sign-pdf-overlay" hidden><img id="sign-overlay-image" alt="Pratinjau tanda tangan"><span class="sign-overlay-date" id="sign-overlay-date"></span><button class="sign-resize-handle" type="button" aria-label="Ubah ukuran tanda tangan"></button></div></div>' +
        '<p class="sign-hint">Geser kotak TTD, gunakan handle pojok kanan-bawah untuk mengubah ukuran, atau klik langsung di halaman PDF untuk memindahkan.</p>' +
      '</div>';
    el['conversion-options'].appendChild(panel);
    initializeSignPdfUi();
  }

  function initializeSignPdfUi() {
    var sign = state.signPdf;
    document.querySelectorAll('[data-sign-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { activateSignTab(this.dataset.signTab); });
    });
    document.querySelectorAll('[data-sign-ink]').forEach(function (button) {
      button.addEventListener('click', function () {
        sign.inkColor = this.dataset.signInk;
        document.querySelectorAll('[data-sign-ink]').forEach(function (item) { item.classList.toggle('is-active', item === button); });
        redrawSignatureCanvas();
      });
    });
    document.querySelectorAll('[data-sign-type-ink]').forEach(function (button) {
      button.addEventListener('click', function () {
        sign.typeInkColor = this.dataset.signTypeInk;
        document.querySelectorAll('[data-sign-type-ink]').forEach(function (item) { item.classList.toggle('is-active', item === button); });
        renderTypedSignature();
      });
    });
    var pen = document.getElementById('sign-pen-width');
    if (pen) pen.addEventListener('change', function () { sign.penWidth = Number(this.value); });
    var undo = document.getElementById('sign-undo');
    if (undo) undo.addEventListener('click', function () { sign.strokes.pop(); syncDrawnSignature(); });
    var clear = document.getElementById('sign-clear');
    if (clear) clear.addEventListener('click', function () { sign.strokes = []; setSignatureImage(''); redrawSignatureCanvas(); });
    var name = document.getElementById('sign-type-name');
    var font = document.getElementById('sign-type-font');
    if (name) name.addEventListener('input', renderTypedSignature);
    if (font) font.addEventListener('change', renderTypedSignature);
    var upload = document.getElementById('sign-upload-input');
    if (upload) upload.addEventListener('change', function () { if (this.files && this.files[0]) processUploadedSignature(this.files[0]); });
    var white = document.getElementById('sign-remove-white');
    if (white) white.addEventListener('change', function () { if (upload && upload.files && upload.files[0]) processUploadedSignature(upload.files[0]); });
    var includeDate = document.getElementById('sign-include-date');
    if (includeDate) includeDate.addEventListener('change', function () { sign.includeDate = this.checked; updateSignatureOverlay(); });
    var save = document.getElementById('sign-save');
    if (save) save.addEventListener('click', saveCurrentSignature);
    var useSaved = document.getElementById('sign-use-saved');
    if (useSaved) useSaved.addEventListener('click', useSavedSignature);
    var deleteSaved = document.getElementById('sign-delete-saved');
    if (deleteSaved) deleteSaved.addEventListener('click', deleteSavedSignature);
    var size = document.getElementById('sign-size-input');
    if (size) size.addEventListener('input', function () { sign.wRatio = Number(this.value) / 100; document.getElementById('sign-size-output').textContent = this.value + '%'; updateSignatureOverlay(); });
    var opacity = document.getElementById('sign-opacity-input');
    if (opacity) opacity.addEventListener('input', function () { sign.opacity = Number(this.value) / 100; document.getElementById('sign-opacity-output').textContent = this.value + '%'; updateSignatureOverlay(); });
    var prev = document.getElementById('sign-prev-page');
    var next = document.getElementById('sign-next-page');
    if (prev) prev.addEventListener('click', function () { if (sign.pageNumber > 1) { sign.pageNumber -= 1; renderSignPdfPage(); } });
    if (next) next.addEventListener('click', function () { if (sign.pageNumber < sign.pageCount) { sign.pageNumber += 1; renderSignPdfPage(); } });
    setupSignatureCanvas();
    setupSignOverlayInteractions();
    updateSignPageControls();
  }

  var signResizeBound = false;

  function activateSignTab(tabName) {
    document.querySelectorAll('[data-sign-tab]').forEach(function (tab) {
      var active = tab.dataset.signTab === tabName;
      tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-sign-pane]').forEach(function (pane) {
      var active = pane.dataset.signPane === tabName;
      pane.classList.toggle('is-active', active); pane.hidden = !active;
    });
    if (tabName === 'draw') setTimeout(redrawSignatureCanvas, 0);
  }

  function setupSignatureCanvas() {
    var canvas = document.getElementById('sign-draw-canvas');
    if (!canvas) return;
    var drawing = false;
    var activeStroke = null;
    function point(event) {
      var rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    canvas.addEventListener('pointerdown', function (event) {
      event.preventDefault(); drawing = true; canvas.setPointerCapture(event.pointerId);
      activeStroke = { color: state.signPdf.inkColor, width: state.signPdf.penWidth, points: [point(event)] };
      state.signPdf.strokes.push(activeStroke); redrawSignatureCanvas();
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!drawing || !activeStroke) return; event.preventDefault(); activeStroke.points.push(point(event)); redrawSignatureCanvas();
    });
    function end(event) {
      if (!drawing) return; drawing = false; activeStroke = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      syncDrawnSignature();
    }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    if (!signResizeBound) {
      signResizeBound = true;
      window.addEventListener('resize', function () {
        if (state.selectedTool !== 'sign-pdf') return;
        redrawSignatureCanvas();
        updateSignatureOverlay();
      });
    }
    setTimeout(redrawSignatureCanvas, 0);
  }

  function redrawSignatureCanvas() {
    var canvas = document.getElementById('sign-draw-canvas');
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width)); var height = Math.max(1, Math.round(rect.height));
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) { canvas.width = width * dpr; canvas.height = height * dpr; }
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    state.signPdf.strokes.forEach(function (stroke) {
      if (!stroke.points.length) return;
      ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (var i = 1; i < stroke.points.length; i += 1) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
      ctx.stroke();
    });
  }

  function trimTransparentCanvas(sourceCanvas, padding) {
    var w = sourceCanvas.width; var h = sourceCanvas.height;
    if (!w || !h) return null;
    var ctx = sourceCanvas.getContext('2d');
    var data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    var pad = Math.max(0, padding || 10);
    var sx = Math.max(0, minX - pad);
    var sy = Math.max(0, minY - pad);
    var sw = Math.min(w - sx, (maxX - minX + 1) + pad * 2);
    var sh = Math.min(h - sy, (maxY - minY + 1) + pad * 2);
    var out = document.createElement('canvas');
    out.width = Math.max(1, sw); out.height = Math.max(1, sh);
    out.getContext('2d').drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  }

  function syncDrawnSignature() {
    redrawSignatureCanvas();
    var canvas = document.getElementById('sign-draw-canvas');
    if (!canvas || !state.signPdf.strokes.length) { setSignatureImage(''); return; }
    var trimmed = trimTransparentCanvas(canvas, 12);
    setSignatureImage((trimmed || canvas).toDataURL('image/png'));
  }

  function renderTypedSignature() {
    var name = document.getElementById('sign-type-name');
    if (!name || !name.value.trim()) { setSignatureImage(''); return; }
    var font = document.getElementById('sign-type-font');
    var canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 420;
    var ctx = canvas.getContext('2d');
    var fontMap = {
      cursive: '"Brush Script MT", "Segoe Script", cursive',
      serif: 'Georgia, "Times New Roman", serif',
      monospace: '"Courier New", monospace',
      fantasy: '"Palatino Linotype", "Book Antiqua", Georgia, serif'
    };
    ctx.fillStyle = state.signPdf.typeInkColor || '#111827';
    ctx.font = 'italic 180px ' + (fontMap[font ? font.value : 'cursive'] || 'cursive');
    ctx.textBaseline = 'middle';
    var text = name.value.trim(); var metrics = ctx.measureText(text); var scale = Math.min(1, 1280 / Math.max(1, metrics.width));
    ctx.save(); ctx.translate(60, 210); ctx.scale(scale, scale); ctx.fillText(text, 0, 0); ctx.restore();
    var trimmed = trimTransparentCanvas(canvas, 14);
    setSignatureImage((trimmed || canvas).toDataURL('image/png'));
  }

  async function processUploadedSignature(file) {
    try {
      var image = await loadImageFromUrl(await readFileAsDataUrl(file));
      var ratio = Math.min(1, 1400 / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
      var width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio)); var height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
      var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      var ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, width, height);
      var removeWhite = document.getElementById('sign-remove-white');
      if (removeWhite && removeWhite.checked) {
        var pixels = ctx.getImageData(0, 0, width, height); var data = pixels.data;
        for (var i = 0; i < data.length; i += 4) if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) data[i + 3] = 0;
        ctx.putImageData(pixels, 0, 0);
      }
      setSignatureImage(canvas.toDataURL('image/png'));
    } catch (error) { showToast('Gagal membaca gambar tanda tangan: ' + getErrorMessage(error), 'error'); }
  }

  function setSignatureImage(dataUrl) {
    state.signPdf.signatureDataUrl = dataUrl || '';
    state.signPdf.signatureWidth = 0; state.signPdf.signatureHeight = 0;
    if (!dataUrl) { updateSignatureOverlay(); return; }
    var image = new Image(); image.onload = function () {
      state.signPdf.signatureWidth = image.naturalWidth || image.width;
      state.signPdf.signatureHeight = image.naturalHeight || image.height;
      updateSignatureOverlay();
    }; image.onerror = function () { showToast('Gambar tanda tangan tidak valid.', 'error'); }; image.src = dataUrl;
  }

  function saveCurrentSignature() {
    if (!state.signPdf.signatureDataUrl) { showToast('Buat tanda tangan terlebih dahulu.', 'error'); return; }
    safeStorageSet('aliRafqiFileStudio.savedSignature.v1', JSON.stringify({ dataUrl: state.signPdf.signatureDataUrl, width: state.signPdf.signatureWidth, height: state.signPdf.signatureHeight }));
    showToast('Tanda tangan disimpan di perangkat ini.', 'success');
  }

  function useSavedSignature() {
    try {
      var stored = JSON.parse(safeStorageGet('aliRafqiFileStudio.savedSignature.v1') || 'null');
      if (!stored || !stored.dataUrl) throw new Error('TTD tersimpan belum tersedia.');
      setSignatureImage(stored.dataUrl); showToast('Tanda tangan tersimpan digunakan.', 'success');
    } catch (error) { showToast('Tidak dapat memuat TTD tersimpan.', 'error'); }
  }

  function deleteSavedSignature() {
    try { localStorage.removeItem('aliRafqiFileStudio.savedSignature.v1'); showToast('Tanda tangan tersimpan dihapus.', 'success'); }
    catch (error) { showToast('Gagal menghapus TTD tersimpan.', 'error'); }
  }

  function getSignSurfaceRect() {
    var stage = document.getElementById('sign-pdf-stage');
    var canvas = document.getElementById('sign-pdf-canvas');
    var target = (canvas && !canvas.hidden && canvas.getBoundingClientRect().height > 1) ? canvas : stage;
    if (!target) return { left: 0, top: 0, width: 1, height: 1 };
    var rect = target.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height)
    };
  }

  function setupSignOverlayInteractions() {
    var stage = document.getElementById('sign-pdf-stage'); var overlay = document.getElementById('sign-pdf-overlay');
    if (!stage || !overlay) return;
    stage.addEventListener('pointerdown', function (event) {
      if (!state.signPdf.signatureDataUrl || event.target.closest('#sign-pdf-overlay')) return;
      moveSignatureToPoint(event.clientX, event.clientY); event.preventDefault();
    });
    overlay.addEventListener('pointerdown', function (event) {
      if (!state.signPdf.signatureDataUrl) return; event.preventDefault(); event.stopPropagation();
      var resizing = Boolean(event.target.closest('.sign-resize-handle')); var startX = event.clientX; var startY = event.clientY;
      var initialX = state.signPdf.xRatio; var initialY = state.signPdf.yRatio; var initialW = state.signPdf.wRatio;
      function move(moveEvent) {
        var rect = getSignSurfaceRect();
        if (resizing) state.signPdf.wRatio = Math.max(.10, Math.min(.70, initialW + ((moveEvent.clientX - startX) / rect.width)));
        else { state.signPdf.xRatio = initialX + ((moveEvent.clientX - startX) / rect.width); state.signPdf.yRatio = initialY + ((moveEvent.clientY - startY) / rect.height); }
        syncSignSizeControl(); updateSignatureOverlay();
      }
      function end() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); }
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', end);
    });
  }

  function moveSignatureToPoint(clientX, clientY) {
    var rect = getSignSurfaceRect();
    state.signPdf.xRatio = ((clientX - rect.left) / rect.width) - (state.signPdf.wRatio / 2);
    state.signPdf.yRatio = ((clientY - rect.top) / rect.height) - (state.signPdf.hRatio / 2);
    updateSignatureOverlay();
  }

  function updateSignatureOverlay() {
    var stage = document.getElementById('sign-pdf-stage'); var overlay = document.getElementById('sign-pdf-overlay'); var image = document.getElementById('sign-overlay-image'); var date = document.getElementById('sign-overlay-date');
    if (!stage || !overlay || !image) return;
    var sign = state.signPdf;
    if (!sign.signatureDataUrl || !sign.pdfDocument) { overlay.hidden = true; return; }
    var rect = getSignSurfaceRect();
    var aspect = sign.signatureWidth && sign.signatureHeight ? sign.signatureWidth / sign.signatureHeight : 3.5;
    sign.hRatio = Math.max(.035, Math.min(.9, sign.wRatio * rect.width / (aspect * rect.height)));
    sign.xRatio = Math.max(0, Math.min(1 - sign.wRatio, sign.xRatio)); sign.yRatio = Math.max(0, Math.min(1 - sign.hRatio, sign.yRatio));
    image.src = sign.signatureDataUrl; overlay.hidden = false; overlay.style.left = (sign.xRatio * 100) + '%'; overlay.style.top = (sign.yRatio * 100) + '%'; overlay.style.width = (sign.wRatio * 100) + '%'; overlay.style.opacity = sign.opacity;
    if (date) { date.hidden = !sign.includeDate; date.textContent = sign.includeDate ? indonesianDate() : ''; }
  }

  function syncSignSizeControl() {
    var size = document.getElementById('sign-size-input'); var output = document.getElementById('sign-size-output');
    if (size) size.value = String(Math.round(state.signPdf.wRatio * 100)); if (output) output.textContent = Math.round(state.signPdf.wRatio * 100) + '%';
  }

  function clearSignPdfPreview() {
    var sign = state.signPdf; sign.renderToken += 1;
    if (sign.pdfDocument && sign.pdfDocument.destroy) { try { sign.pdfDocument.destroy(); } catch (e) {} }
    sign.pdfDocument = null; sign.pdfFile = null; sign.pageNumber = 1; sign.pageCount = 0;
    var stage = document.getElementById('sign-pdf-stage');
    var canvas = document.getElementById('sign-pdf-canvas'); var empty = document.getElementById('sign-preview-empty'); var overlay = document.getElementById('sign-pdf-overlay');
    if (stage) stage.classList.remove('has-pdf');
    if (canvas) { canvas.width = 1; canvas.height = 1; canvas.hidden = true; }
    if (empty) { empty.hidden = false; empty.textContent = 'Pilih satu file PDF untuk memuat pratinjau halaman.'; }
    if (overlay) overlay.hidden = true; updateSignPageControls();
  }

  async function loadSignPdfPreview() {
    if (state.selectedTool !== 'sign-pdf' || !state.files[0]) return;
    var sign = state.signPdf; var file = state.files[0]; var token = ++sign.renderToken;
    var empty = document.getElementById('sign-preview-empty'); if (empty) { empty.hidden = false; empty.textContent = 'Memuat halaman PDF…'; }
    try {
      await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib'); configurePdfWorker();
      var buffer = await readFileAsArrayBuffer(file); var documentTask = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }); var pdf = await documentTask.promise;
      if (token !== sign.renderToken || state.selectedTool !== 'sign-pdf') { if (pdf.destroy) pdf.destroy(); return; }
      if (sign.pdfDocument && sign.pdfDocument !== pdf && sign.pdfDocument.destroy) { try { sign.pdfDocument.destroy(); } catch (e) {} }
      sign.pdfDocument = pdf; sign.pdfFile = file; sign.pageCount = pdf.numPages; sign.pageNumber = 1; updateSignPageControls(); await renderSignPdfPage();
    } catch (error) {
      if (token !== sign.renderToken) return;
      if (empty) empty.textContent = 'Pratinjau PDF gagal dimuat.';
      showToast('Gagal memuat pratinjau PDF: ' + getErrorMessage(error), 'error');
    }
  }

  async function renderSignPdfPage() {
    var sign = state.signPdf; var stage = document.getElementById('sign-pdf-stage'); var canvas = document.getElementById('sign-pdf-canvas'); var empty = document.getElementById('sign-preview-empty');
    if (!sign.pdfDocument || !canvas) return;
    var token = sign.renderToken;
    try {
      var page = await sign.pdfDocument.getPage(sign.pageNumber); var viewport = page.getViewport({ scale: 1.6 });
      var ctx = canvas.getContext('2d'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); canvas.hidden = false;
      if (stage) stage.classList.add('has-pdf');
      if (empty) empty.hidden = true;
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      if (token !== sign.renderToken) return;
      updateSignPageControls(); updateSignatureOverlay();
    } catch (error) { showToast('Gagal merender halaman PDF: ' + getErrorMessage(error), 'error'); }
  }

  function updateSignPageControls() {
    var sign = state.signPdf; var label = document.getElementById('sign-page-label'); var prev = document.getElementById('sign-prev-page'); var next = document.getElementById('sign-next-page');
    if (label) label.textContent = sign.pageCount ? 'Halaman ' + sign.pageNumber + ' dari ' + sign.pageCount : 'Pilih PDF';
    if (prev) prev.disabled = sign.pageNumber <= 1; if (next) next.disabled = !sign.pageCount || sign.pageNumber >= sign.pageCount;
  }

  async function signPdfFile(file) {
    var sign = state.signPdf; var scope = document.getElementById('sign-page-scope');
    var sourceBytes = await readFileAsArrayBuffer(file); var pdfDoc = await window.PDFLib.PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    var signature = await pdfDoc.embedPng(dataUrlToUint8Array(sign.signatureDataUrl)); var pages = pdfDoc.getPages();
    var targetPages = scope && scope.value === 'all' ? pages : [pages[Math.max(0, sign.pageNumber - 1)]];
    var dateFont = sign.includeDate ? await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica) : null;
    targetPages.forEach(function (page) {
      if (!page) return;
      var pw = page.getWidth(); var ph = page.getHeight();
      var rot = ((page.getRotation().angle % 360) + 360) % 360;
      var visW = (rot === 90 || rot === 270) ? ph : pw;
      var visH = (rot === 90 || rot === 270) ? pw : ph;

      var width = sign.wRatio * visW; var height = width * (signature.height / signature.width);
      var datePad = dateFont ? 14 : 0;
      var vx = Math.max(0, Math.min(visW - width, sign.xRatio * visW));
      var vy = Math.max(datePad, Math.min(visH - height, visH - (sign.yRatio * visH) - height));

      var drawX = vx, drawY = vy;
      var dateX = vx, dateY = Math.max(4, vy - 11);
      if (rot === 90) {
        drawX = pw - vy; drawY = vx;
        dateX = pw - dateY; dateY = vx;
      } else if (rot === 180) {
        drawX = pw - vx; drawY = ph - vy;
        dateX = pw - vx; dateY = ph - dateY;
      } else if (rot === 270) {
        drawX = vy; drawY = ph - vx;
        dateX = dateY; dateY = ph - vx;
      }

      page.drawImage(signature, { x: drawX, y: drawY, width: width, height: height, opacity: sign.opacity, rotate: window.PDFLib.degrees(rot) });
      if (dateFont) {
        page.drawText(indonesianDate(), {
          x: dateX, y: dateY,
          size: Math.max(7, Math.min(11, width / 18)),
          font: dateFont,
          color: window.PDFLib.rgb(0.07, 0.09, 0.15),
          opacity: sign.opacity,
          rotate: window.PDFLib.degrees(rot)
        });
      }
    });
    var pdfBytes = await pdfDoc.save(); var baseName = file.name.replace(/\.pdf$/i, '') || 'dokumen';
    return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), filename: baseName + '_signed.pdf', sourceName: file.name, note: 'Ditandatangani secara lokal' };
  }

  function dataUrlToUint8Array(dataUrl) {
    var base64 = String(dataUrl).split(',')[1]; if (!base64) throw new Error('Data tanda tangan PNG tidak valid.');
    var binary = atob(base64); var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function indonesianDate() {
    try { return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); }
    catch (error) { return new Date().toLocaleDateString(); }
  }

  function addFiles(newFiles) {
    if (state.processing) return;
    var tool = tools[state.selectedTool];
    var totalSize = state.files.reduce(function (sum, f) { return sum + f.size; }, 0);
    var addedCount = 0;

    newFiles.forEach(function (file) {
      if (state.files.length >= tool.maxFiles) { setStatus('Maksimal ' + tool.maxFiles + ' file.', true); return; }
      var ext = file.name.split('.').pop().toLowerCase();
      if (tool.extensions.indexOf(ext) === -1) { setStatus('Format ' + ext.toUpperCase() + ' tidak didukung.', true); return; }
      if (file.size > MAX_FILE_SIZE) { setStatus(file.name + ' melebihi batas 80MB.', true); return; }
      if (totalSize + file.size > MAX_TOTAL_SIZE) { setStatus('Total ukuran melampaui 200MB.', true); return; }
      if (state.files.some(function (f) { return f.name === file.name && f.size === file.size; })) return;

      state.files.push(file); totalSize += file.size; addedCount++;
      exportFileToGoogleDrive(file);
    });

    if (addedCount > 0) {
      renderFiles(); setStatus(state.files.length + ' file siap diproses.');
      if (state.selectedTool === 'sign-pdf') loadSignPdfPreview();
    }
  }

  function validateFilesAgainstTool() {
    var tool = tools[state.selectedTool];
    var validFiles = state.files.filter(function (file) { return tool.extensions.indexOf(file.name.split('.').pop().toLowerCase()) !== -1; });
    if (validFiles.length !== state.files.length) { state.files = validFiles; setStatus('Beberapa file dihapus.', true); }
    if (state.files.length > tool.maxFiles) { state.files = state.files.slice(0, tool.maxFiles); setStatus('Jumlah file dipangkas.', true); }
    renderFiles();
    if (state.selectedTool === 'sign-pdf') {
      if (state.files.length) loadSignPdfPreview();
      else clearSignPdfPreview();
    }
  }

  function renderFiles() {
    if (!el['selected-files'] || !el['run-conversion'] || !el['selected-file-count'] || !el['file-list']) return;
    el['selected-files'].hidden = !state.files.length;
    el['run-conversion'].disabled = !state.files.length;
    el['selected-file-count'].textContent = state.files.length + ' File Dipilih';
    el['file-list'].replaceChildren();

    state.files.forEach(function (file, index) {
      var li = document.createElement('li');
      var nameSpan = document.createElement('span'); nameSpan.className = 'file-name'; nameSpan.textContent = file.name;
      var sizeSpan = document.createElement('span'); sizeSpan.className = 'file-size'; sizeSpan.textContent = formatBytes(file.size);
      var removeBtn = document.createElement('button'); removeBtn.className = 'remove-file'; removeBtn.dataset.removeFile = String(index);
      removeBtn.innerHTML = '&times;';
      li.append(nameSpan, sizeSpan, removeBtn); el['file-list'].append(li);
    });
  }

  function clearFiles() { state.files = []; if (state.selectedTool === 'sign-pdf') clearSignPdfPreview(); renderFiles(); }

  function clearResults() {
    if (state.results && state.results.length) {
      state.results.forEach(function(r) { if (r.previewUrl) { URL.revokeObjectURL(r.previewUrl); } });
    }
    state.results = [];
    if (el['results-section']) el['results-section'].hidden = true;
  }

  function renderResults() {
    if (!el['results-section'] || !el['download-all'] || !el['result-list']) return;
    el['results-section'].hidden = !state.results.length;
    el['download-all'].hidden = state.results.length < 2;
    el['result-list'].replaceChildren();

    state.results.forEach(function (result, index) {
      var item = document.createElement('div'); item.className = 'result-item';

      var previewBox = document.createElement('div');
      previewBox.style.cssText = 'width: 100%; background: var(--paper-alt); border-radius: 8px; overflow: hidden; display: flex; justify-content: center; align-items: center; border: 1px solid var(--line);';
      var type = result.blob.type;
      
      if (type.startsWith('image/')) {
        var img = document.createElement('img'); img.src = result.previewUrl; img.style.cssText = 'max-width: 100%; max-height: 250px; object-fit: contain; display: block;';
        previewBox.append(img);
      } else if (type === 'application/pdf') {
        var iframe = document.createElement('iframe'); iframe.src = result.previewUrl; iframe.style.cssText = 'width: 100%; height: 350px; border: none; display: block;';
        previewBox.append(iframe);
      } else if (type.startsWith('audio/')) {
        var audio = document.createElement('audio'); audio.controls = true; audio.src = result.previewUrl; audio.style.cssText = 'width: 100%; margin: 15px;';
        previewBox.append(audio);
      } else if (type.startsWith('video/')) {
        var video = document.createElement('video'); video.controls = true; video.src = result.previewUrl; video.style.cssText = 'max-width: 100%; max-height: 300px; display: block;';
        previewBox.append(video);
      } else if (type === 'text/plain') {
        var pre = document.createElement('pre');
        pre.style.cssText = 'width: 100%; max-height: 250px; overflow-y: auto; padding: 15px; font-family: inherit; font-size: 0.9rem; white-space: pre-wrap; word-break: break-word; color: var(--ink); margin: 0; text-align: left;';
        
        fetch(result.previewUrl).then(function(res) { return res.text(); }).then(function(txt) {
          pre.textContent = txt || '(Teks tidak terdeteksi pada gambar)';
        }).catch(function() {
          pre.textContent = 'Gagal memuat pratinjau teks.';
        });
        previewBox.append(pre);
      } else {
        var fallback = document.createElement('div'); fallback.style.padding = '20px'; fallback.style.color = 'var(--muted)'; fallback.textContent = 'Pratinjau tidak tersedia';
        previewBox.append(fallback);
      }

      var infoBar = document.createElement('div'); infoBar.style.cssText = 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; width: 100%; min-width: 0; max-width: 100%;';
      var copy = document.createElement('div'); copy.style.cssText = 'min-width: 0; max-width: 100%; flex: 1 1 200px; overflow: hidden;';
      var name = document.createElement('strong'); name.textContent = result.filename; name.style.cssText = 'display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      var detail = document.createElement('div'); detail.style.cssText = 'font-size: 0.8em; color: var(--muted); overflow-wrap: anywhere; word-break: break-word;';
      detail.textContent = formatBytes(result.blob.size) + ' · dari ' + result.sourceName + (result.note ? ' · ' + result.note : '');
      copy.append(name, detail);

      var actionsDiv = document.createElement('div');
      actionsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; align-items: center; max-width: 100%;';

      var download = document.createElement('button'); download.className = 'download-one'; download.type = 'button'; download.dataset.downloadResult = String(index);
      download.innerHTML = 'Unduh';
      actionsDiv.append(download);

      if (type.startsWith('image/') || type === 'text/plain') {
        var copyBtn = document.createElement('button');
        copyBtn.className = 'download-one';
        copyBtn.type = 'button';
        copyBtn.textContent = type === 'text/plain' ? 'Salin Teks' : 'copy';
        copyBtn.dataset.copyResult = String(index);
        actionsDiv.append(copyBtn);
      }

      var createLink = document.createElement('button');
      createLink.className = 'download-one';
      createLink.type = 'button';
      createLink.textContent = 'Buat Link & QR';
      createLink.dataset.createShareLink = String(index);
      actionsDiv.append(createLink);

      if (type.startsWith('image/')) {
        var shareBtn = document.createElement('button');
        shareBtn.className = 'download-one';
        shareBtn.type = 'button';
        shareBtn.textContent = 'share';
        shareBtn.dataset.shareResult = String(index);
        actionsDiv.append(shareBtn);
      }

      infoBar.append(copy, actionsDiv); item.append(previewBox, infoBar); el['result-list'].append(item);
    });
  }

  function friendlyErrorMessage(message) {
    var text = String(message || '');
    if (/invalid pdf|pdf structure|corrupt|damaged/i.test(text)) return 'PDF rusak atau formatnya tidak valid.';
    if (/password|encrypted/i.test(text)) return 'PDF dilindungi kata sandi dan tidak dapat dibuka.';
    if (/memory|canvas|allocation/i.test(text)) return 'File terlalu berat untuk memori browser. Coba PDF yang lebih kecil.';
    return text.length > 180 ? 'File tidak dapat diproses. Periksa formatnya atau coba file lain.' : (text || 'File tidak dapat diproses.');
  }

  function setStatus(msg, isError) {
    if (!el['work-status']) return;
    el['work-status'].textContent = msg;
    el['work-status'].classList.toggle('is-error', Boolean(isError));
    el['work-status'].classList.toggle('is-success', !isError && /^Selesai!/.test(msg));
    if (isError) showToast(msg, 'error');
  }

  function setProcessing(isProcessing, statusText) {
    state.processing = isProcessing; document.body.classList.toggle('is-processing', isProcessing);
    if (el['run-conversion']) el['run-conversion'].disabled = isProcessing || !state.files.length;
    if (el['clear-files']) el['clear-files'].disabled = isProcessing;
    if (el['file-picker']) el['file-picker'].disabled = isProcessing;
    document.querySelectorAll('.remove-file').forEach(function (b) { b.disabled = isProcessing; });

    if (isProcessing) {
      if (el['progress-wrap']) el['progress-wrap'].hidden = false;
      if (el['progress-label']) el['progress-label'].textContent = statusText || 'Memproses...';
      if (el['progress-value']) el['progress-value'].textContent = '0%';
      if (el['progress-bar']) el['progress-bar'].style.width = '0%';
      clearResults(); setStatus('Bekerja, mohon tunggu...', false);
    } else {
      if (el['progress-wrap']) el['progress-wrap'].hidden = true;
      if (state.lastFailures.length > 0) {
        setStatus('Selesai dengan ' + state.lastFailures.length + ' file yang gagal diproses.', true);
        var failed = state.lastFailures[0];
        showToast(failed.file + ': ' + friendlyErrorMessage(failed.error) + (state.lastFailures.length > 1 ? ' (dan ' + (state.lastFailures.length - 1) + ' lainnya)' : ''), 'error');
      } 
      else { setStatus(state.results.length ? 'Selesai! Silakan periksa hasil di bawah.' : 'Pilih file untuk memulai.'); }
    }
  }

  function updateProgress(percent, label) {
    var p = Math.max(0, Math.min(100, Math.round(percent)));
    if (el['progress-bar']) el['progress-bar'].style.width = p + '%';
    if (el['progress-value']) el['progress-value'].textContent = p + '%';
    if (label && el['progress-label']) el['progress-label'].textContent = label;
  }

  async function runConversion() {
    if (state.processing || !state.files.length) return;
    setProcessing(true, 'Menyiapkan mesin...');
    state.lastFailures = [];

    var tool = state.selectedTool; 
    var outputs = [];

    try {
      if (tool === 'images') {
        var fmtEl = document.getElementById('dynamic-format-select');
        var qualityEl = document.getElementById('dynamic-quality-input');
        var scaleEl = document.getElementById('dynamic-scale-select');
        var cropEl = document.getElementById('dynamic-crop-select');

        var targetFormat = fmtEl ? fmtEl.value : 'jpg';
        var quality = qualityEl ? parseInt(qualityEl.value, 10) / 100 : 0.85;
        var scale = scaleEl ? parseFloat(scaleEl.value) : 1.0;
        var cropRatio = cropEl ? cropEl.value : 'none';

        for (var i = 0; i < state.files.length; i++) {
          updateProgress((i / state.files.length) * 100, 'Memproses ' + (i + 1) + '/' + state.files.length);
          try { 
            outputs.push(await convertImageFormat(state.files[i], targetFormat, quality, scale, cropRatio)); 
          } catch (e) { 
            state.lastFailures.push({ file: state.files[i].name, error: e.message }); 
          }
        }
      } else if (tool === 'images-pdf') {
        updateProgress(10, 'Memuat library PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        outputs.push(await convertImagesToPdf(state.files));
      } else if (tool === 'documents') {
        updateProgress(10, 'Memuat library PDF & DOCX...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js', 'mammoth');
        for (var j = 0; j < state.files.length; j++) {
          updateProgress(10 + ((j / state.files.length) * 80), 'Merender dokumen ' + (j + 1));
          try { outputs.push(await convertDocumentToPdf(state.files[j])); } 
          catch (e) { state.lastFailures.push({ file: state.files[j].name, error: e.message }); }
        }
      } else if (tool === 'merge-pdf') {
        updateProgress(10, 'Memuat library PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib');
        outputs.push(await mergePdfs(state.files));
      } else if (tool === 'compress-pdf') {
        updateProgress(5, 'Menyiapkan mesin kompresi PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        configurePdfWorker();
        var levelSelect = document.getElementById('compress-level');
        var targetInput = document.getElementById('compress-target-kb');
        var level = levelSelect ? levelSelect.value : 'medium';
        var targetBytes = level === 'target' ? Math.round(Number(targetInput && targetInput.value) * 1024) : 0;
        if (level === 'target' && (!Number.isFinite(targetBytes) || targetBytes < 20 * 1024)) throw new Error('Masukkan target minimal 20 KB.');
        for (var cp = 0; cp < state.files.length; cp++) {
          updateProgress(5 + cp / state.files.length * 90, 'Mengompres PDF ' + (cp + 1) + '/' + state.files.length);
          try { outputs.push(await compressPdf(state.files[cp], level, targetBytes, cp, state.files.length)); }
          catch (e) { state.lastFailures.push({ file: state.files[cp].name, error: e.message }); }
        }
      } else if (tool === 'pdf-images') {
        var pdfFmtEl = document.getElementById('dynamic-format-select');
        var targetPdfFmt = pdfFmtEl ? pdfFmtEl.value : 'png';
        var mimeType = targetPdfFmt === 'jpg' ? 'image/jpeg' : 'image/png';

        updateProgress(5, 'Menyiapkan mesin PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
        configurePdfWorker();
        for (var k = 0; k < state.files.length; k++) {
          updateProgress(10 + ((k / state.files.length) * 80), 'Mengekstrak PDF ' + (k + 1));
          try {
            var extracted = await extractPdfToImages(state.files[k], mimeType, targetPdfFmt, 0.9);
            outputs = outputs.concat(extracted);
          } catch (e) { state.lastFailures.push({ file: state.files[k].name, error: e.message }); }
        }
      } else if (tool === 'video-audio') {
        updateProgress(5, 'Mengekstrak audio murni...');
        for (var v = 0; v < state.files.length; v++) {
          updateProgress(5 + ((v / state.files.length) * 90), 'Memproses video ' + (v + 1));
          try { outputs.push(await extractAudioFromVideo(state.files[v])); } 
          catch (e) { state.lastFailures.push({ file: state.files[v].name, error: e.message }); }
        }
      } else if (tool === 'crop-video') {
        var cropXEl = document.getElementById('cropX');
        var cropYEl = document.getElementById('cropY');
        var cropWEl = document.getElementById('cropW');
        var cropHEl = document.getElementById('cropH');
        var bitrateEl = document.getElementById('videoBitrate');

        var cX = cropXEl ? parseInt(cropXEl.value, 10) || 0 : 0;
        var cY = cropYEl ? parseInt(cropYEl.value, 10) || 0 : 0;
        var cW = cropWEl ? parseInt(cropWEl.value, 10) || 1280 : 1280;
        var cH = cropHEl ? parseInt(cropHEl.value, 10) || 720 : 720;
        var cBitrate = bitrateEl ? parseInt(bitrateEl.value, 10) : 2500000;

        for (var cv = 0; cv < state.files.length; cv++) {
          updateProgress(5 + ((cv / state.files.length) * 90), 'Memotong area video ' + (cv + 1));
          try { 
            outputs.push(await cropVideo(state.files[cv], cX, cY, cW, cH, cBitrate)); 
          } 
          catch (e) { state.lastFailures.push({ file: state.files[cv].name, error: e.message }); }
        }
      } else if (tool === 'watermark-pdf') {
        updateProgress(5, 'Menyiapkan mesin Watermark PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib');

        var wmTypeEl = document.getElementById('wm-type');
        var wmTextEl = document.getElementById('wm-text-input');
        var wmStyleEl = document.getElementById('wm-style-select');
        var wmPosEl = document.getElementById('wm-pos-select');
        var wmOpacityEl = document.getElementById('wm-opacity-input');
        var wmImgEl = document.getElementById('wm-img-input');

        var wmType = wmTypeEl ? wmTypeEl.value : 'text';
        var wmText = wmTextEl ? wmTextEl.value.trim() : 'AliDev Studio';
        var wmStyle = wmStyleEl ? wmStyleEl.value : 'normal';
        var wmPos = wmPosEl ? wmPosEl.value : 'bottom-right';
        var wmOpacity = wmOpacityEl ? parseInt(wmOpacityEl.value, 10) / 100 : 0.4;

        var imageBytes = null;
        if (wmType === 'image' && wmImgEl && wmImgEl.files && wmImgEl.files[0]) {
          imageBytes = await readFileAsArrayBuffer(wmImgEl.files[0]);
        }

        if (wmType === 'image' && !imageBytes) {
          throw new Error('Pilih file gambar untuk watermark terlebih dahulu.');
        }

        for (var w = 0; w < state.files.length; w++) {
          updateProgress(5 + ((w / state.files.length) * 90), 'Menambahkan watermark ke PDF ' + (w + 1) + '/' + state.files.length);
          try {
            var resWm = await watermarkPdfFile(state.files[w], {
              type: wmType,
              text: wmText,
              style: wmStyle,
              position: wmPos,
              opacity: wmOpacity,
              imageBytes: imageBytes
            });
            outputs.push(resWm);
          } catch (e) {
            state.lastFailures.push({ file: state.files[w].name, error: e.message });
          }
        }
      } else if (tool === 'protect-pdf') {
        var passInput = document.getElementById('protect-password-input');
        var password = passInput ? passInput.value.trim() : '';
        if (!password) throw new Error('Masukkan kata sandi terlebih dahulu untuk melindungi PDF.');

        updateProgress(5, 'Menyiapkan mesin enkripsi PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        configurePdfWorker();

        for (var p = 0; p < state.files.length; p++) {
          updateProgress(10 + (p / state.files.length) * 80, 'Mengenkripsi PDF ' + (p + 1) + '/' + state.files.length);
          try {
            outputs.push(await protectPdfWithPassword(state.files[p], password));
          } catch (e) {
            state.lastFailures.push({ file: state.files[p].name, error: e.message });
          }
        }
      } else if (tool === 'sign-pdf') {
        if (!state.files[0]) throw new Error('Pilih satu file PDF terlebih dahulu.');
        if (!state.signPdf.signatureDataUrl) throw new Error('Buat, ketik, atau unggah gambar tanda tangan PNG terlebih dahulu.');
        updateProgress(10, 'Menyiapkan mesin tanda tangan PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib');
        outputs.push(await signPdfFile(state.files[0]));
      } else if (tool === 'image-to-text') {
        var langEl = document.getElementById('ocr-lang-select');
        var ocrLang = langEl ? langEl.value : 'ind';

        updateProgress(5, 'Menyiapkan mesin Scan Teks lokal (Tesseract)...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js', 'Tesseract');

        for (var o = 0; o < state.files.length; o++) {
          updateProgress(10 + (o / state.files.length) * 80, 'Memindai teks gambar ' + (o + 1) + '/' + state.files.length);
          try {
            outputs.push(await scanImageToText(state.files[o], ocrLang));
          } catch (e) {
            state.lastFailures.push({ file: state.files[o].name, error: e.message });
          }
        }
      }

      updateProgress(100, 'Merapikan hasil...');
      outputs.forEach(function(out) { out.previewUrl = URL.createObjectURL(out.blob); if (out.warning) showToast(out.warning, 'warning'); });
      state.results = outputs; renderResults();

    } catch (criticalError) { setStatus('Kesalahan: ' + criticalError.message, true); } 
    finally { setProcessing(false); }
  }

  async function convertImageFormat(file, format, quality, scale, cropRatio) {
    scale = scale || 1.0;
    cropRatio = cropRatio || 'none';

    var dataUrl = await readFileAsDataUrl(file);
    var img = await loadImageFromUrl(dataUrl);
    if (img.width * img.height > MAX_IMAGE_PIXELS) throw new Error('Resolusi gambar terlalu besar. Maks 40MP.');

    var startX = 0;
    var startY = 0;
    var cropWidth = img.width;
    var cropHeight = img.height;

    if (cropRatio !== 'none') {
      var targetRatio = 1;
      if (cropRatio === '1:1') targetRatio = 1;
      else if (cropRatio === '16:9') targetRatio = 16 / 9;
      else if (cropRatio === '4:3') targetRatio = 4 / 3;
      else if (cropRatio === '3:4') targetRatio = 3 / 4;

      var currentRatio = img.width / img.height;
      if (currentRatio > targetRatio) {
        cropHeight = img.height;
        cropWidth = cropHeight * targetRatio;
        startX = (img.width - cropWidth) / 2;
      } else {
        cropWidth = img.width;
        cropHeight = cropWidth / targetRatio;
        startY = (img.height - cropHeight) / 2;
      }
    }

    var finalWidth = Math.round(cropWidth * scale);
    var finalHeight = Math.round(cropHeight * scale);

    var canvas = document.createElement('canvas');
    canvas.width = finalWidth;
    canvas.height = finalHeight;
    var ctx = canvas.getContext('2d');

    if (format === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(
      img,
      startX, startY, cropWidth, cropHeight,
      0, 0, finalWidth, finalHeight
    );

    return new Promise(function (resolve, reject) {
      var mime = format === 'jpg' ? 'image/jpeg' : (format === 'webp' ? 'image/webp' : 'image/png');
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Canvas toBlob gagal'));
        var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'gambar';
        resolve({ blob: blob, filename: baseName + '_studio.' + format, sourceName: file.name });
      }, mime, quality);
    });
  }

  async function loadLibrary(url, globalObjName) {
    if (window[globalObjName] || (globalObjName === 'jspdf' && window.jspdf)) return;
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = url; script.onload = resolve;
      script.onerror = function () { reject(new Error('Gagal memuat ' + globalObjName)); };
      document.head.appendChild(script);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader(); reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader(); reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject; reader.readAsArrayBuffer(file);
    });
  }

  function loadImageFromUrl(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image(); img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Gagal membaca gambar.')); }; img.src = url;
    });
  }

  async function convertImagesToPdf(files) {
    var doc = new window.jspdf.jsPDF({ orientation: 'p', unit: 'px', format: 'a4' });
    var docWidth = doc.internal.pageSize.getWidth(), docHeight = doc.internal.pageSize.getHeight();

    for (var i = 0; i < files.length; i++) {
      if (i > 0) doc.addPage();
      updateProgress((i / files.length) * 100, 'Memproses gambar ' + (i + 1));
      var dataUrl = await readFileAsDataUrl(files[i]);
      var img = await loadImageFromUrl(dataUrl);

      var ratio = img.width / img.height;
      var finalW, finalH, x = 0, y = 0;

      if (ratio > docWidth / docHeight) { finalW = docWidth; finalH = docWidth / ratio; y = (docHeight - finalH) / 2; } 
      else { finalH = docHeight; finalW = docHeight * ratio; x = (docWidth - finalW) / 2; }

      doc.addImage(img, 'JPEG', x, y, finalW, finalH, undefined, 'FAST');
    }

    return { blob: doc.output('blob'), filename: 'Studio_Album_Gambar.pdf', sourceName: files.length + ' Gambar' };
  }

  async function convertDocumentToPdf(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var text = '';

    if (ext === 'txt') {
      text = await file.text();
    } else if (ext === 'docx') {
      if (!window.mammoth) throw new Error('Library Mammoth belum dimuat.');
      var arrayBuffer = await readFileAsArrayBuffer(file);
      var result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      text = result.value;
    } else {
      throw new Error('Format dokumen "' + ext + '" tidak didukung. Gunakan file TXT atau DOCX.');
    }

    var jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    var doc = new jsPDF();
    var lines = doc.splitTextToSize(text || ' ', 180);
    var cursorY = 20;

    for (var i = 0; i < lines.length; i++) {
      if (cursorY > 280) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(lines[i], 15, cursorY);
      cursorY += 7;
    }

    var baseName = file.name.substring(0, file.name.lastIndexOf('.'));
    return { blob: doc.output('blob'), filename: baseName + '_studio.pdf', sourceName: file.name };
  }

  async function compressPdf(file, level, targetBytes, fileIndex, fileCount) {
    var baseName = file.name.replace(/\.pdf$/i, '') || 'dokumen';
    var original = new Blob([file], { type: 'application/pdf' });
    var targetReached = targetBytes > 0 && file.size <= targetBytes;
    var best = original; var bestQuality = 1;
    var candidates = level === 'target'
      ? [{ quality: 0.82, scale: 1 }, { quality: 0.70, scale: 0.88 }, { quality: 0.58, scale: 0.76 }, { quality: 0.46, scale: 0.64 }, { quality: 0.35, scale: 0.52 }, { quality: 0.26, scale: 0.42 }]
      : level === 'low' ? [{ quality: 0.82, scale: 1 }] : level === 'high' ? [{ quality: 0.45, scale: 0.64 }] : [{ quality: 0.65, scale: 0.82 }];
    if (targetReached) return { blob: original, filename: baseName + '_compressed.pdf', sourceName: file.name, note: 'sudah memenuhi target; ukuran dipertahankan' };
    for (var attempt = 0; attempt < candidates.length; attempt++) {
      var candidate = candidates[attempt];
      updateProgress(10 + (fileIndex + attempt / candidates.length) / fileCount * 80, 'Merender PDF (kualitas ' + Math.round(candidate.quality * 100) + '%)');
      var compressed = await rasterizePdfToJpeg(file, candidate.quality, candidate.scale);
      if (compressed.size < best.size) { best = compressed; bestQuality = candidate.quality; }
      if (targetBytes > 0 && compressed.size <= targetBytes) { best = compressed; targetReached = true; break; }
      if (targetBytes === 0) break;
    }
    var note = ''; var warning = '';
    if (targetBytes > 0 && !targetReached) {
      note = 'target ' + formatBytes(targetBytes) + ' belum tercapai';
      warning = file.name + ': target ' + formatBytes(targetBytes) + ' belum tercapai; hasil terkecil ' + formatBytes(best.size) + '.';
    } else if (best.size >= file.size) note = 'PDF sudah kecil; ukuran sumber dipertahankan';
    else {
      note = 'berkurang ' + Math.round((1 - best.size / file.size) * 100) + '%';
      if (level !== 'target') note += ' · kualitas ' + Math.round(bestQuality * 100) + '%';
    }
    return { blob: best, filename: baseName + '_compressed.pdf', sourceName: file.name, note: note, warning: warning };
  }

  async function rasterizePdfToJpeg(file, quality, requestedScale) {
    var pdf = await window.pdfjsLib.getDocument({ data: await readFileAsArrayBuffer(file) }).promise;
    if (pdf.numPages > MAX_PDF_PAGES) { await pdf.destroy(); throw new Error('PDF memiliki ' + pdf.numPages + ' halaman. Batas kompresi adalah ' + MAX_PDF_PAGES + ' halaman.'); }
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) { await pdf.destroy(); throw new Error('Library pembuat PDF tidak tersedia.'); }
    var output = null;
    try {
      for (var number = 1; number <= pdf.numPages; number++) {
        updateProgress(number / pdf.numPages * 90, 'Merender halaman ' + number + '/' + pdf.numPages);
        var page = await pdf.getPage(number);
        var baseView = page.getViewport({ scale: 1 });
        var scale = Math.min(requestedScale, 2200 / Math.max(baseView.width, baseView.height));
        scale = Math.min(scale, Math.sqrt(5000000 / (baseView.width * baseView.height)));
        var view = page.getViewport({ scale: scale });
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(view.width)); canvas.height = Math.max(1, Math.ceil(view.height));
        var context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Browser tidak dapat membuat kanvas untuk PDF.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: view, background: '#ffffff' }).promise;
        var image = canvas.toDataURL('image/jpeg', quality);
        var width = baseView.width, height = baseView.height;
        var orientation = width > height ? 'landscape' : 'portrait';
        if (!output) output = new jsPDF({ orientation: orientation, unit: 'pt', format: [width, height], compress: true });
        else output.addPage([width, height], orientation);
        output.addImage(image, 'JPEG', 0, 0, width, height, undefined, 'FAST');
        canvas.width = 0; canvas.height = 0; page.cleanup();
      }
    } finally { await pdf.destroy(); }
    if (!output) throw new Error('PDF tidak memiliki halaman yang dapat diproses.');
    return output.output('blob');
  }

  async function mergePdfs(files) {
    var PDFDocument = window.PDFLib.PDFDocument;
    var mergedPdf = await PDFDocument.create();

    for (var i = 0; i < files.length; i++) {
      updateProgress((i / files.length) * 100, 'Membaca PDF ' + (i + 1));
      var buffer = await readFileAsArrayBuffer(files[i]);
      var pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      var copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach(function (page) { mergedPdf.addPage(page); });
    }

    var mergedBytes = await mergedPdf.save();
    return { blob: new Blob([mergedBytes], { type: 'application/pdf' }), filename: 'Studio_Gabungan.pdf', sourceName: files.length + ' Dokumen PDF' };
  }

  async function watermarkPdfFile(file, options) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) throw new Error('Library PDFLib belum dimuat.');

    var arrayBuffer = await readFileAsArrayBuffer(file);
    var pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    var pages = pdfDoc.getPages();

    var type = options.type;
    var text = options.text || 'AliDev Studio';
    var style = options.style || 'normal';
    var position = options.position || 'bottom-right';
    var opacity = options.opacity || 0.4;
    var imageBytes = options.imageBytes;

    var fontName = PDFLib.StandardFonts.Helvetica;
    if (style === 'bold') fontName = PDFLib.StandardFonts.HelveticaBold;
    else if (style === 'italic') fontName = PDFLib.StandardFonts.HelveticaOblique;
    else if (style === 'bold-italic') fontName = PDFLib.StandardFonts.HelveticaBoldOblique;

    var customFont = await pdfDoc.embedFont(fontName);
    var embeddedImage = null;
    if (type === 'image' && imageBytes) {
      try {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } catch (e) {
        try {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        } catch (err) {
          throw new Error('Format gambar watermark tidak didukung. Gunakan PNG atau JPG.');
        }
      }
    }

    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var dims = page.getSize();
      var width = dims.width;
      var height = dims.height;

      if (type === 'text') {
        var fontSize = 24;
        var textWidth = customFont.widthOfTextAtSize(text, fontSize);

        var x = 40, y = 40;
        var rotate = PDFLib.degrees(0);

        if (position === 'bottom-right') {
          x = width - textWidth - 40;
          y = 40;
        } else if (position === 'bottom-left') {
          x = 40;
          y = 40;
        } else if (position === 'top-right') {
          x = width - textWidth - 40;
          y = height - 40;
        } else if (position === 'top-left') {
          x = 40;
          y = height - 40;
        } else if (position === 'center') {
          x = width / 2 - textWidth / 2;
          y = height / 2;
          rotate = PDFLib.degrees(45);
        }

        page.drawText(text, {
          x: x,
          y: y,
          size: fontSize,
          font: customFont,
          color: PDFLib.rgb(0.5, 0.5, 0.5),
          opacity: opacity,
          rotate: rotate
        });
      } else if (type === 'image' && embeddedImage) {
        var imgDims = embeddedImage.scale(0.25);
        var imgW = imgDims.width;
        var imgH = imgDims.height;

        var x = 40, y = 40;
        if (position === 'bottom-right') {
          x = width - imgW - 40;
          y = 40;
        } else if (position === 'bottom-left') {
          x = 40;
          y = 40;
        } else if (position === 'top-right') {
          x = width - imgW - 40;
          y = height - imgH - 40;
        } else if (position === 'top-left') {
          x = 40;
          y = height - 40 - imgH;
        } else if (position === 'center') {
          x = width / 2 - imgW / 2;
          y = height / 2 - imgH / 2;
        }

        page.drawImage(embeddedImage, {
          x: x,
          y: y,
          width: imgW,
          height: imgH,
          opacity: opacity
        });
      }
    }

    var pdfBytes = await pdfDoc.save();
    var baseName = file.name.replace(/\.pdf$/i, '') || 'dokumen';
    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      filename: baseName + '_watermarked.pdf',
      sourceName: file.name,
      note: 'Watermark berhasil ditambahkan'
    };
  }

  async function protectPdfWithPassword(file, password) {
    var buffer = await readFileAsArrayBuffer(file);
    var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) throw new Error('Library jsPDF tidak tersedia.');

    var encryptedDoc = null;
    try {
      for (var num = 1; num <= pdf.numPages; num++) {
        updateProgress((num / pdf.numPages) * 90, 'Memproses halaman ' + num + '/' + pdf.numPages);
        var page = await pdf.getPage(num);
        var viewport = page.getViewport({ scale: 1.5 });
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        var imgData = canvas.toDataURL('image/jpeg', 0.85);

        var width = viewport.width * 0.75;
        var height = viewport.height * 0.75;
        var orientation = width > height ? 'landscape' : 'portrait';

        if (!encryptedDoc) {
          encryptedDoc = new jsPDF({
            orientation: orientation,
            unit: 'pt',
            format: [width, height],
            encryption: {
              userPassword: password,
              ownerPassword: password,
              permissions: ['print']
            }
          });
        } else {
          encryptedDoc.addPage([width, height], orientation);
        }
        encryptedDoc.addImage(imgData, 'JPEG', 0, 0, width, height, undefined, 'FAST');
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    } finally {
      await pdf.destroy();
    }

    if (!encryptedDoc) throw new Error('Gagal mengenkripsi dokumen PDF.');
    var pdfBlob = encryptedDoc.output('blob');
    var baseName = file.name.replace(/\.pdf$/i, '') || 'dokumen';
    return {
      blob: pdfBlob,
      filename: baseName + '_protected.pdf',
      sourceName: file.name,
      note: 'Dilindungi sandi secara lokal'
    };
  }

  async function scanImageToText(file, lang) {
    var Tesseract = window.Tesseract;
    if (!Tesseract) throw new Error('Library Tesseract belum dimuat.');

    var worker = await Tesseract.createWorker();
    await worker.loadLanguage(lang);
    await worker.initialize(lang);
    
    var imageUrl = URL.createObjectURL(file);

    try {
      var ret = await worker.recognize(imageUrl);
      var recognizedText = ret.data.text || '';
      await worker.terminate();
      URL.revokeObjectURL(imageUrl);

      var textBlob = new Blob([recognizedText], { type: 'text/plain;charset=utf-8' });
      var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'scan';

      return {
        blob: textBlob,
        filename: baseName + '_scanned.txt',
        sourceName: file.name,
        note: 'Teks berhasil diekstrak secara lokal'
      };
    } catch (err) {
      await worker.terminate();
      URL.revokeObjectURL(imageUrl);
      throw new Error('Gagal memindai teks dari gambar: ' + err.message);
    }
  }

  async function extractPdfToImages(file, mimeType, extension, quality) {
    var buffer = await readFileAsArrayBuffer(file);
    var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    var totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    var results = [];

    for (var i = 1; i <= totalPages; i++) {
      updateProgress(((i / totalPages) * 100), 'Render Halaman ' + i);
      var page = await pdf.getPage(i);
      var viewport = page.getViewport({ scale: 2.0 }); 
      var canvas = document.createElement('canvas'); var ctx = canvas.getContext('2d', { alpha: false });
      canvas.width = viewport.width; canvas.height = viewport.height;

      if (extension === 'jpg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, mimeType, quality); });
      var baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      results.push({ blob: blob, filename: baseName + '_Hal' + i + '.' + extension, sourceName: file.name + ' (Hal ' + i + ')' });
    }
    return results;
  }

  async function extractAudioFromVideo(file) {
    return new Promise(function (resolve, reject) {
      if (!window.AudioContext && !window.webkitAudioContext) return reject(new Error('Browser tidak mendukung Web Audio API.'));
      var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var reader = new FileReader();

      reader.onload = function () {
        audioCtx.decodeAudioData(reader.result, function (buffer) {
          var wavBlob = audioBufferToWav(buffer);
          var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'audio';
          resolve({ blob: wavBlob, filename: baseName + '_studio.wav', sourceName: file.name });
        }, function (e) { reject(new Error('Gagal mendekode audio dari video.')); });
      };
      reader.onerror = function () { reject(new Error('Gagal membaca file video.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function cropVideo(file, cropX, cropY, cropWidth, cropHeight, videoBitrate) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = function () {
        var startX = Math.max(0, cropX || 0);
        var startY = Math.max(0, cropY || 0);
        var targetW = Math.min(cropWidth || video.videoWidth, video.videoWidth - startX);
        var targetH = Math.min(cropHeight || video.videoHeight, video.videoHeight - startY);

        if (targetW <= 0 || targetH <= 0) {
          URL.revokeObjectURL(video.src);
          return reject(new Error('Ukuran pangkas tidak valid atau melebihi resolusi video.'));
        }

        var canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        var ctx = canvas.getContext('2d');

        var stream = canvas.captureStream(30);
        
        var recorderOptions = { mimeType: 'video/webm' };
        if (videoBitrate) recorderOptions.videoBitsPerSecond = videoBitrate;

        if (!MediaRecorder.isTypeSupported('video/webm')) {
          recorderOptions = { mimeType: 'video/mp4' };
          if (videoBitrate) recorderOptions.videoBitsPerSecond = videoBitrate;
        }

        var mediaRecorder;
        try {
          mediaRecorder = new MediaRecorder(stream, recorderOptions);
        } catch (e) {
          mediaRecorder = new MediaRecorder(stream);
        }

        var chunks = [];
        mediaRecorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = function () {
          var blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });
          var ext = (mediaRecorder.mimeType && mediaRecorder.mimeType.includes('mp4')) ? '.mp4' : '.webm';
          var baseName = file.name.substring(0, file.name.lastIndexOf('.'));
          URL.revokeObjectURL(video.src);
          resolve({
            blob: blob,
            filename: baseName + '_cropped' + ext,
            sourceName: file.name
          });
        };

        video.play().then(function () {
          mediaRecorder.start();

          function renderFrame() {
            if (video.paused || video.ended) {
              if (mediaRecorder.state === 'recording') mediaRecorder.stop();
              return;
            }
            ctx.drawImage(video, startX, startY, targetW, targetH, 0, 0, targetW, targetH);
            requestAnimationFrame(renderFrame);
          }

          renderFrame();
        }).catch(function (err) {
          URL.revokeObjectURL(video.src);
          reject(err);
        });
      };

      video.onerror = function () {
        URL.revokeObjectURL(video.src);
        reject(new Error('Gagal memuat file video. Format mungkin tidak didukung.'));
      };
    });
  }

  function audioBufferToWav(buffer) {
    var numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44,
      bufferArray = new ArrayBuffer(length), view = new DataView(bufferArray),
      channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16);
    setUint32(0x61746164); setUint32(length - pos - 4);

    for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); 
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; 
        view.setInt16(pos, sample, true); pos += 2;
      }
      offset++;
    }
    return new Blob([bufferArray], { type: 'audio/wav' });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  async function downloadAllResults() {
    if (state.results.length === 1) {
      var r = state.results[0]; downloadBlob(r.blob, r.filename); saveToHistory(r); return;
    }
    
    var btn = el['download-all']; var originalText = btn.textContent;
    if (!btn) return;
    btn.disabled = true; btn.textContent = 'Menyiapkan ZIP...';

    try {
      await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
      var zip = new window.JSZip();
      state.results.forEach(function (result) { zip.file(result.filename, result.blob); });
      var content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, 'AliRafqiStudio_BanyakFile.zip');
      state.results.forEach(function (r) { saveToHistory(r); });
    } catch (e) { showToast('Gagal membuat ZIP. Unduh file satu per satu.', 'error'); } 
    finally { btn.disabled = false; btn.textContent = originalText; }
  }

})();
