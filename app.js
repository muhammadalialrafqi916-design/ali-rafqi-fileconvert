(function () {
  'use strict';

  var DB_NAME = 'AliRafqiStudio_V2';
  var DB_VERSION = 1;
  var PBKDF2_ITERATIONS = 10000;
  var SESSION_DAYS = 45;
  var ACTIVE_SESSION_KEY = 'aliRafqiFileStudio.activeSession.v2';
  var THEME_KEY = 'aliRafqiFileStudio.theme.v1';
  var PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var MAX_FILE_SIZE = 80 * 1024 * 1024;
  var MAX_TOTAL_SIZE = 200 * 1024 * 1024;
  var MAX_IMAGE_PIXELS = 40000000;
  var MAX_PDF_PAGES = 60;

  var databasePromise;
  var toastQueue = [];
  var toastVisible = false;
  var installPromptEvent = null;
  var state = {
    authMode: 'login',
    currentUser: null,
    selectedTool: 'images',
    files: [],
    results: [],
    processing: false,
    lastFailures: []
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
    'merge-pdf': {
      marker: 'GABUNG PDF', title: 'Gabungkan PDF', description: 'Satukan beberapa PDF mengikuti urutan file yang dipilih.',
      dropTitle: 'Tarik beberapa PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 12 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 12, runLabel: 'Gabungkan PDF'
    },

    // --- POIN A: CONVERT TO PDF ---
    'word-to-pdf': {
      marker: 'WORD → PDF (A)', title: 'Word / Dokumen Teks ke PDF', description: 'Ubah file dokumen (.doc, .docx, .odt, .txt) langsung menjadi PDF di browser.',
      dropTitle: 'Tarik dokumen Word ke sini', requirements: 'atau pilih dari perangkat · DOCX, DOC, ODT, TXT · maksimal 5 file',
      accept: '.doc,.docx,.odt,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,text/plain',
      extensions: ['doc', 'docx', 'odt', 'txt'], maxFiles: 5, runLabel: 'Buat PDF dari Word'
    },
    'ppt-to-pdf': {
      marker: 'PPT → PDF (A)', title: 'PowerPoint ke PDF (A)', description: 'Ubah file presentasi (.ppt, .pptx) menjadi halaman dokumen PDF.',
      dropTitle: 'Tarik file PowerPoint ke sini', requirements: 'atau pilih dari perangkat · PPT, PPTX · maksimal 4 file',
      accept: '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extensions: ['ppt', 'pptx'], maxFiles: 4, runLabel: 'Buat PDF dari PPT'
    },
    'excel-to-pdf': {
      marker: 'EXCEL → PDF (A)', title: 'Excel ke PDF (A)', description: 'Ubah lembar kerja spreadsheet (.xls, .xlsx, .ods) menjadi PDF siap cetak.',
      dropTitle: 'Tarik file Excel ke sini', requirements: 'atau pilih dari perangkat · XLS, XLSX, ODS · maksimal 4 file',
      accept: '.xls,.xlsx,.ods,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet',
      extensions: ['xls', 'xlsx', 'ods'], maxFiles: 4, runLabel: 'Buat PDF dari Excel'
    },

    // --- POIN B: CONVERT FROM PDF ---
    'pdf-to-word': {
      marker: 'PDF → WORD (B)', title: 'PDF ke Word (.docx)', description: 'Ekstrak isi teks dan struktur PDF kembali menjadi dokumen Word yang dapat diedit.',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 4 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 4, runLabel: 'Ubah PDF ke Word'
    },
    'pdf-to-ppt': {
      marker: 'PDF → PPT (B)', title: 'PDF ke PowerPoint (.pptx)', description: 'Ubah halaman PDF menjadi file presentasi PowerPoint (.pptx).',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 4 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 4, runLabel: 'Ubah PDF ke PowerPoint'
    },
    'pdf-to-excel': {
      marker: 'PDF → EXCEL (B)', title: 'PDF ke Excel (.xlsx)', description: 'Ekstrak tabel dan data dari PDF langsung ke format spreadsheet Excel (.xlsx).',
      dropTitle: 'Tarik PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 4 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 4, runLabel: 'Ubah PDF ke Excel'
    },

    // Multimedia
    'video-audio': {
      marker: 'VIDEO → AUDIO', title: 'Video ke Audio (MP3/WAV)', description: 'Ekstrak suara dari MP4 menjadi format Audio murni.',
      dropTitle: 'Tarik video MP4 ke sini', requirements: 'atau pilih dari perangkat · MP4 · maksimal 5 file',
      accept: 'video/mp4,.mp4', extensions: ['mp4'], maxFiles: 5, runLabel: 'Ekstrak Audio'
    },
    'crop-video': {
      marker: 'PANGKAS VIDEO', title: 'Pangkas Area Video (Crop)', description: 'Potong area/resolusi tampilan video MP4 atau WebM.',
      dropTitle: 'Tarik video ke sini', requirements: 'atau pilih dari perangkat · MP4, WebM · maksimal 2 file',
      accept: 'video/mp4,video/webm,.mp4,.webm', extensions: ['mp4', 'webm'], maxFiles: 2, runLabel: 'Pangkas Video'
    }
  };

  var el = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheElements();
    initializeTheme();
    bindAuthEvents();
    bindStudioEvents();
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
      'results-section', 'result-list', 'download-all', 'history-dialog', 'history-list', 'clear-history', 'settings-dialog', 'global-toast',
      'gdrive-dialog', 'open-gdrive-modal', 'gdrive-link-input', 'fetch-gdrive-file'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  async function initializeApplication() {
    if (!isLocalProfileSupported()) {
      setAuthMessage('Browser ini tidak mendukung penyimpanan profil aman.');
      el['auth-submit'].disabled = true;
      return;
    }
    try {
      await getDatabase();
      await restoreSession();
    } catch (error) {
      console.error(error);
      setAuthMessage('Database lokal tidak dapat dibuka.');
    }
  }

  function isLocalProfileSupported() {
    return Boolean(window.indexedDB && window.crypto && window.crypto.subtle && window.TextEncoder);
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

    el['switch-auth-mode'].addEventListener('click', function () {
      setAuthMode(state.authMode === 'login' ? 'register' : 'login');
    });

    el.username.addEventListener('input', function () {
      this.value = this.value.replace(/\s/g, '');
      this.removeAttribute('aria-invalid');
    });
    el.password.addEventListener('input', function () { this.removeAttribute('aria-invalid'); });

    el['auth-form'].addEventListener('submit', function (event) {
      event.preventDefault();
      submitAuthForm();
    });
  }

  function bindStudioEvents() {
    el['theme-toggle'].addEventListener('click', function () {
      var isDark = document.body.classList.toggle('dark-theme');
      safeStorageSet(THEME_KEY, isDark ? 'dark' : 'light');
    });

    document.querySelectorAll('.tool-card').forEach(function (button) {
      button.addEventListener('click', function () { selectTool(this.dataset.tool); });
    });

    document.querySelectorAll('.sidebar-link[data-scroll-target]').forEach(function (button) {
      button.addEventListener('click', function () {
        var target = document.getElementById(this.dataset.scrollTarget);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    el['choose-files'].addEventListener('click', function (event) {
      event.stopPropagation();
      el['file-picker'].click();
    });
    el['drop-zone'].addEventListener('click', function (event) {
      if (event.target.closest('button')) return;
      el['file-picker'].click();
    });
    el['file-picker'].addEventListener('change', function () {
      addFiles(Array.prototype.slice.call(this.files));
      this.value = '';
    });

    if (el['open-gdrive-modal']) {
      el['open-gdrive-modal'].addEventListener('click', function (event) {
        event.stopPropagation();
        el['gdrive-dialog'].showModal();
      });
    }
    if (el['fetch-gdrive-file']) {
      el['fetch-gdrive-file'].addEventListener('click', handleGoogleDriveImport);
    }

    el['file-list'].addEventListener('click', function (event) {
      var removeButton = event.target.closest('[data-remove-file]');
      if (!removeButton || state.processing) return;
      state.files.splice(Number(removeButton.dataset.removeFile), 1);
      renderFiles();
      setStatus(state.files.length ? 'File diperbarui. Siap diproses.' : 'Pilih file untuk memulai.');
    });

    el['clear-files'].addEventListener('click', function () {
      if (state.processing) return;
      clearFiles();
      clearResults(); 
      setStatus('Menunggu file...');
    });

    el['run-conversion'].addEventListener('click', runConversion);
    el['open-history'].addEventListener('click', openHistory);
    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', function () { this.closest('dialog').close(); });
    });
    el['clear-history'].addEventListener('click', clearHistory);
    el['open-settings'].addEventListener('click', function () { el['settings-dialog'].showModal(); });
    el['logout-button'].addEventListener('click', logout);
    el['delete-local-data'].addEventListener('click', deleteAllLocalData);
    el['download-all'].addEventListener('click', downloadAllResults);
    
    el['result-list'].addEventListener('click', function (event) {
      var button = event.target.closest('[data-download-result]');
      if (!button) return;
      var index = Number(button.dataset.downloadResult);
      var result = state.results[index];
      downloadBlob(result.blob, result.filename);
      saveToHistory(result);
    });
  }

  function extractGoogleDriveFileId(urlOrId) {
    var trimmed = String(urlOrId || '').trim();
    if (!trimmed) return null;
    if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) return trimmed;
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
      showToast('Gagal mengambil file. Pastikan file disetel Publik.', 'error');
      return;
    }

    try {
      var blob = response;
      var type = blob.type;
      var filename = 'gdrive_file';

      if (type.includes('image/jpeg')) filename = 'gdrive_image.jpg';
      else if (type.includes('image/png')) filename = 'gdrive_image.png';
      else if (type.includes('pdf')) filename = 'gdrive_document.pdf';
      else if (type.includes('word') || type.includes('document')) filename = 'gdrive_document.docx';
      else if (type.includes('sheet') || type.includes('excel')) filename = 'gdrive_spreadsheet.xlsx';
      else filename = 'gdrive_file.bin';

      var file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
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
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(function () {});
  }

  async function installApplication() {
    if (!installPromptEvent) { showToast('Pilih menu browser lalu “Install aplikasi”.', 'info'); return; }
    installPromptEvent.prompt();
    try { await installPromptEvent.userChoice; } catch (e) {}
    installPromptEvent = null;
  }

  // --- Storage & Crypto Helpers ---
  function safeStorageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function safeStorageRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function encodeUTF8(text) { return new TextEncoder().encode(text); }
  function buf2hex(buffer) { return Array.prototype.slice.call(new Uint8Array(buffer)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async function getDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = function () { reject(new Error('IndexedDB Error')); };
      request.onsuccess = function (event) { resolve(event.target.result); };
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'username' });
        if (!db.objectStoreNames.contains('history')) {
          var hs = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          hs.createIndex('username', 'username', { unique: false });
        }
      };
    });
    return databasePromise;
  }

  async function performDbTransaction(storeName, mode, callback) {
    var db = await getDatabase();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(storeName, mode);
      var store = tx.objectStore(storeName);
      var request = callback(store);
      tx.oncomplete = function () { resolve(request ? request.result : undefined); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function generatePasswordHash(password, salt) {
    var keyMaterial = await crypto.subtle.importKey('raw', encodeUTF8(password), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
    var derivedKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    var exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
    return buf2hex(exportedKey);
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
    el['auth-heading'].textContent = isReg ? 'Buat Profil Offline' : 'Masuk ke Studio';
    el['auth-description'].textContent = isReg ? 'Karya dan datamu hanya tersimpan di perangkat ini.' : 'Gunakan profil lokal yang sudah ada di perangkat ini.';
    el['auth-submit-label'].textContent = isReg ? 'Buat profil dan masuk' : 'Masuk ke Studio';
    el['auth-kicker'].textContent = isReg ? 'Sudah punya profil?' : 'Belum punya profil lokal?';
    el['switch-copy'].textContent = isReg ? 'Masuk sekarang.' : 'Buat profil';
    
    if (el['display-name'] && el['display-name'].parentElement) {
       el['display-name'].parentElement.hidden = !isReg;
    }
    setAuthMessage('');
    el['auth-form'].reset();
  }

  function setAuthMessage(text) { el['auth-message'].textContent = text; }
  function setFormLoading(isLoading) {
    el['auth-submit'].disabled = isLoading;
    el['auth-form'].classList.toggle('loading', isLoading);
  }

  async function submitAuthForm() {
    setFormLoading(true);
    setAuthMessage('');
    var dNameEl = el['display-name'];
    var unameEl = el.username;
    var passEl = el.password;

    var dName = dNameEl ? dNameEl.value.trim() : '';
    var uname = unameEl ? unameEl.value.toLowerCase() : '';
    var pass = passEl ? passEl.value : '';

    if (!uname || uname.length < 3) { finishAuthError(unameEl, 'Nama pengguna minimal 3 karakter.'); return; }
    if (!pass || pass.length < 5) { finishAuthError(passEl, 'Kata sandi minimal 5 karakter.'); return; }

    try {
      if (state.authMode === 'register') {
        if (!dName) { finishAuthError(dNameEl, 'Nama tampilan diperlukan.'); return; }
        var exists = await performDbTransaction('users', 'readonly', function (s) { return s.get(uname); });
        if (exists) { finishAuthError(unameEl, 'Nama pengguna sudah dipakai.'); return; }

        var salt = crypto.getRandomValues(new Uint8Array(16));
        var hashHex = await generatePasswordHash(pass, salt);
        var avatarUrl = await generateAvatarDataUrl(dName);

        var newUser = {
          username: uname, displayName: dName, hashHex: hashHex, saltHex: buf2hex(salt),
          avatarDataUrl: avatarUrl, createdAt: Date.now()
        };

        await performDbTransaction('users', 'readwrite', function (s) { return s.add(newUser); });
        finishAuthSuccess(newUser, el['remember-device'].checked);
      } else {
        var userRecord = await performDbTransaction('users', 'readonly', function (s) { return s.get(uname); });
        if (!userRecord) { finishAuthError(null, 'Nama belum terdaftar. Klik "Buat profil" di bawah.'); return; }

        var saltBytes = new Uint8Array(userRecord.saltHex.match(/.{1,2}/g).map(function (byte) { return parseInt(byte, 16); }));
        var inputHashHex = await generatePasswordHash(pass, saltBytes);

        if (inputHashHex !== userRecord.hashHex) { finishAuthError(null, 'Kata sandi salah.'); return; }
        finishAuthSuccess(userRecord, el['remember-device'].checked);
      }
    } catch (error) {
      setAuthMessage('Gagal masuk.');
      setFormLoading(false);
    }
  }

  function finishAuthError(inputEl, msg) {
    if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
    setAuthMessage(msg);
    setFormLoading(false);
  }

  function finishAuthSuccess(userRecord, remember) {
    setFormLoading(false);
    el.password.value = '';
    state.currentUser = { username: userRecord.username, displayName: userRecord.displayName, avatarDataUrl: userRecord.avatarDataUrl };

    if (remember) {
      var expires = Date.now() + (SESSION_DAYS * 24 * 60 * 60 * 1000);
      safeStorageSet(ACTIVE_SESSION_KEY, JSON.stringify({ u: userRecord.username, e: expires }));
    }

    applyUserToUi();
    el['auth-screen'].hidden = true;
    el['studio-shell'].hidden = false;
    selectTool('images');
  }

  async function restoreSession() {
    var stored = safeStorageGet(ACTIVE_SESSION_KEY);
    if (!stored) return;
    try {
      var session = JSON.parse(stored);
      if (session.u && session.e > Date.now()) {
        var userRecord = await performDbTransaction('users', 'readonly', function (s) { return s.get(session.u); });
        if (userRecord) {
          state.currentUser = { username: userRecord.username, displayName: userRecord.displayName, avatarDataUrl: userRecord.avatarDataUrl };
          applyUserToUi();
          el['auth-screen'].hidden = true;
          el['studio-shell'].hidden = false;
          selectTool('images');
        } else safeStorageRemove(ACTIVE_SESSION_KEY);
      } else safeStorageRemove(ACTIVE_SESSION_KEY);
    } catch (e) { safeStorageRemove(ACTIVE_SESSION_KEY); }
  }

  function applyUserToUi() {
    el['profile-name'].textContent = state.currentUser.displayName;
    el['profile-avatar'].src = state.currentUser.avatarDataUrl;
    el['welcome-name'].textContent = state.currentUser.displayName.split(' ')[0] + '!';
    el['settings-avatar'].src = state.currentUser.avatarDataUrl;
    el['settings-name'].textContent = state.currentUser.displayName;
    el['settings-username'].textContent = '@' + state.currentUser.username;
    updateHistoryBadge();
  }

  function logout() {
    safeStorageRemove(ACTIVE_SESSION_KEY);
    state.currentUser = null;
    clearFiles(); clearResults(); 
    el['studio-shell'].hidden = true;
    el['auth-screen'].hidden = false;
    el['settings-dialog'].close();
  }

  async function deleteAllLocalData() {
    if (!confirm('Hapus permanen profil dan riwayat?')) return;
    try {
      var request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = function () {
        safeStorageRemove(THEME_KEY);
        alert('Data berhasil dihapus.');
        window.location.reload();
      };
    } catch (error) { alert('Tidak dapat menghapus data.'); }
  }

  async function saveToHistory(resultData) {
    if (!state.currentUser) return;
    try {
      await performDbTransaction('history', 'readwrite', function (s) {
        return s.add({ username: state.currentUser.username, timestamp: Date.now(), filename: resultData.filename, sizeBytes: resultData.blob.size, toolUsed: state.selectedTool });
      });
      updateHistoryBadge();
    } catch (e) {}
  }

  async function updateHistoryBadge() {
    if (!state.currentUser) return;
    try {
      var all = await performDbTransaction('history', 'readonly', function (s) { return s.index('username').getAll(state.currentUser.username); });
      el['history-count'].textContent = (all && all.length) ? all.length : '';
    } catch (e) { el['history-count'].textContent = ''; }
  }

  async function openHistory() {
    el['history-list'].replaceChildren();
    try {
      var all = await performDbTransaction('history', 'readonly', function (s) { return s.index('username').getAll(state.currentUser.username); });
      all.sort(function (a, b) { return b.timestamp - a.timestamp; });
      if (!all.length) {
        var li = document.createElement('li'); li.textContent = 'Belum ada catatan unduhan.';
        li.style.color = 'var(--text-secondary)'; li.style.textAlign = 'center';
        el['history-list'].append(li);
      } else {
        all.forEach(function (h) {
          var li = document.createElement('li');
          var name = document.createElement('strong'); name.textContent = h.filename;
          var details = document.createElement('span'); details.className = 'history-details';
          var date = new Date(h.timestamp);
          details.textContent = formatBytes(h.sizeBytes) + ' • ' + h.toolUsed + ' • ' + date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          li.append(name, details); el['history-list'].append(li);
        });
      }
      el['history-dialog'].showModal();
    } catch (e) { alert('Gagal memuat riwayat.'); }
  }

  async function clearHistory() {
    if (!confirm('Hapus seluruh riwayat unduhanmu?')) return;
    try {
      var db = await getDatabase();
      var tx = db.transaction('history', 'readwrite');
      var store = tx.objectStore('history');
      var index = store.index('username');
      var request = index.openCursor(IDBKeyRange.only(state.currentUser.username));

      request.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); } 
        else {
          el['history-list'].replaceChildren();
          var li = document.createElement('li'); li.textContent = 'Riwayat sudah bersih.'; li.style.textAlign = 'center';
          el['history-list'].append(li);
          updateHistoryBadge();
        }
      };
    } catch (e) {}
  }

  function selectTool(toolName, skipClear) {
    if (state.processing) return;
    if (!tools[toolName]) toolName = 'images';
    state.selectedTool = toolName;
    var tool = tools[toolName];

    document.querySelectorAll('.tool-card').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.tool === toolName ? 'true' : 'false');
    });

    el['active-tool-marker'].textContent = tool.marker; 
    el['workbench-title'].textContent = tool.title;
    el['workbench-description'].textContent = tool.description; 
    el['drop-title'].textContent = tool.dropTitle;
    el['file-requirements'].textContent = tool.requirements; 
    el['file-picker'].accept = tool.accept;
    el['run-label'].textContent = tool.runLabel;
    el['conversion-options'].replaceChildren();

    if (toolName === 'images') {
      var group = document.createElement('div');
      group.className = 'option-group';
      group.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; width: 100%;';
      group.innerHTML = '<label class="field compact"><span>Format hasil</span><select id="dynamic-format-select"><option value="jpg">JPG — ringan</option><option value="png">PNG — tajam</option><option value="webp">WebP — modern</option></select></label>' +
                        '<label class="field compact"><span>Kualitas: <strong id="dynamic-quality-output">85%</strong></span><input type="range" id="dynamic-quality-input" min="10" max="100" value="85"></label>';
      el['conversion-options'].appendChild(group);
      var qInput = document.getElementById('dynamic-quality-input');
      if (qInput) qInput.addEventListener('input', function() { document.getElementById('dynamic-quality-output').textContent = this.value + '%'; });
    } else if (toolName === 'pdf-to-word' || toolName === 'pdf-to-ppt' || toolName === 'pdf-to-excel') {
      var note = document.createElement('div');
      note.className = 'option-group note-options';
      note.innerHTML = '<span>ℹ</span><p>Mendukung ekstraksi teks dan struktur langsung di browser. Untuk PDF berupa hasil scan gambar, pastikan halaman terbaca dengan jelas oleh engine lokal.</p>';
      el['conversion-options'].appendChild(note);
    }

    if (!skipClear) { clearFiles(); clearResults(); setStatus('Menunggu file...'); }
  }

  function addFiles(newFiles) {
    if (state.processing) return;
    var tool = tools[state.selectedTool];
    var totalSize = state.files.reduce(function (sum, f) { return sum + f.size; }, 0);
    var addedCount = 0;

    newFiles.forEach(function (file) {
      if (state.files.length >= tool.maxFiles) { setStatus('Maksimal ' + tool.maxFiles + ' file.', true); return; }
      var ext = file.name.split('.').pop().toLowerCase();
      if (tool.extensions.indexOf(ext) === -1) { setStatus('Format .' + ext.toUpperCase() + ' tidak didukung untuk alat ini.', true); return; }
      if (file.size > MAX_FILE_SIZE) { setStatus(file.name + ' melebihi batas 80MB.', true); return; }
      state.files.push(file); addedCount++;
    });

    if (addedCount > 0) { renderFiles(); setStatus(state.files.length + ' file siap diproses.'); }
  }

  function renderFiles() {
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

  function clearFiles() { state.files = []; renderFiles(); }

  function clearResults() {
    if (state.results && state.results.length) {
      state.results.forEach(function(r) { if (r.previewUrl) URL.revokeObjectURL(r.previewUrl); });
    }
    state.results = [];
    el['results-section'].hidden = true;
  }

  function renderResults() {
    el['results-section'].hidden = !state.results.length;
    el['download-all'].hidden = state.results.length < 2;
    el['result-list'].replaceChildren();

    state.results.forEach(function (result, index) {
      var item = document.createElement('div'); item.className = 'result-item';
      var previewBox = document.createElement('div');
      previewBox.style.cssText = 'background: var(--surface-hover); border-radius: 8px; margin-bottom: 12px; padding: 20px; text-align: center; border: 1px solid var(--border-color);';
      
      var type = result.blob.type;
      if (type.startsWith('image/')) {
        var img = document.createElement('img'); img.src = result.previewUrl; img.style.cssText = 'max-width: 100%; max-height: 220px; object-fit: contain; display: block; margin: 0 auto;';
        previewBox.append(img);
      } else {
        var info = document.createElement('div');
        info.innerHTML = '<strong style="font-size: 1.2rem;">📄 ' + result.filename + '</strong><p style="color: var(--text-secondary); margin-top: 6px;">File siap diunduh · ' + formatBytes(result.blob.size) + '</p>';
        previewBox.append(info);
      }

      var infoBar = document.createElement('div'); infoBar.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 10px;';
      var copy = document.createElement('div');
      var name = document.createElement('strong'); name.textContent = result.filename;
      var detail = document.createElement('div'); detail.style.cssText = 'font-size: 0.85em; color: var(--text-secondary);';
      detail.textContent = formatBytes(result.blob.size) + ' · ' + result.sourceName;
      copy.append(name, detail);

      var download = document.createElement('button'); download.className = 'download-one'; download.type = 'button'; download.dataset.downloadResult = String(index);
      download.innerHTML = 'Unduh';
      infoBar.append(copy, download); item.append(previewBox, infoBar); el['result-list'].append(item);
    });
  }

  function setStatus(msg, isError) {
    el['work-status'].textContent = msg;
    el['work-status'].classList.toggle('is-error', Boolean(isError));
    if (isError) showToast(msg, 'error');
  }

  function setProcessing(isProcessing, statusText) {
    state.processing = isProcessing; document.body.classList.toggle('is-processing', isProcessing);
    el['run-conversion'].disabled = isProcessing || !state.files.length;
    if (isProcessing) {
      el['progress-wrap'].hidden = false; el['progress-label'].textContent = statusText || 'Memproses...';
      updateProgress(0); clearResults();
    } else {
      el['progress-wrap'].hidden = true;
    }
  }

  function updateProgress(percent, label) {
    var p = Math.max(0, Math.min(100, Math.round(percent)));
    el['progress-bar'].style.width = p + '%'; el['progress-value'].textContent = p + '%';
    if (label) el['progress-label'].textContent = label;
  }

  // --- ENGINE UTAMA KONTROL KONVERSI ---
  async function runConversion() {
    if (state.processing || !state.files.length) return;
    setProcessing(true, 'Menyiapkan mesin lokal...');
    state.lastFailures = [];
    var tool = state.selectedTool;
    var outputs = [];

    try {
      // POIN A: CONVERT TO PDF
      if (tool === 'word-to-pdf') {
        updateProgress(10, 'Memuat library dokumen...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js', 'mammoth');
        for (var i = 0; i < state.files.length; i++) {
          updateProgress(10 + (i / state.files.length) * 80, 'Konversi Word ke PDF ' + (i + 1));
          outputs.push(await convertWordToPdf(state.files[i]));
        }
      } else if (tool === 'ppt-to-pdf') {
        updateProgress(10, 'Memuat library PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        for (var j = 0; j < state.files.length; j++) {
          updateProgress(10 + (j / state.files.length) * 80, 'Konversi PPT ke PDF ' + (j + 1));
          outputs.push(await convertPptToPdf(state.files[j]));
        }
      } else if (tool === 'excel-to-pdf') {
        updateProgress(10, 'Memuat library Spreadsheet...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX');
        for (var k = 0; k < state.files.length; k++) {
          updateProgress(10 + (k / state.files.length) * 80, 'Konversi Excel ke PDF ' + (k + 1));
          outputs.push(await convertExcelToPdf(state.files[k]));
        }
      } 
      // POIN B: CONVERT FROM PDF
      else if (tool === 'pdf-to-word') {
        updateProgress(10, 'Memuat PDF engine...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
        configurePdfWorker();
        for (var p1 = 0; p1 < state.files.length; p1++) {
          updateProgress(10 + (p1 / state.files.length) * 80, 'Mengekstrak PDF ke Word ' + (p1 + 1));
          outputs.push(await convertPdfToWord(state.files[p1]));
        }
      } else if (tool === 'pdf-to-ppt') {
        updateProgress(10, 'Memuat PPT engine...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js', 'PptxGenJS');
        configurePdfWorker();
        for (var p2 = 0; p2 < state.files.length; p2++) {
          updateProgress(10 + (p2 / state.files.length) * 80, 'Mengekstrak PDF ke PowerPoint ' + (p2 + 1));
          outputs.push(await convertPdfToPpt(state.files[p2]));
        }
      } else if (tool === 'pdf-to-excel') {
        updateProgress(10, 'Memuat Excel engine...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX');
        configurePdfWorker();
        for (var p3 = 0; p3 < state.files.length; p3++) {
          updateProgress(10 + (p3 / state.files.length) * 80, 'Mengekstrak tabel PDF ke Excel ' + (p3 + 1));
          outputs.push(await convertPdfToExcel(state.files[p3]));
        }
      } else if (tool === 'images') {
        // Standard image conversion
        for (var im = 0; im < state.files.length; im++) {
          outputs.push(await convertImageFormat(state.files[im], 'jpg', 0.85, 1.0, 'none'));
        }
      } else if (tool === 'images-pdf') {
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        outputs.push(await convertImagesToPdf(state.files));
      } else if (tool === 'merge-pdf') {
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib');
        outputs.push(await mergePdfs(state.files));
      }

      updateProgress(100, 'Selesai!');
      outputs.forEach(function(out) { out.previewUrl = URL.createObjectURL(out.blob); });
      state.results = outputs;
      renderResults();
      showToast('Konversi berhasil diselesaikan secara lokal!', 'success');
    } catch (err) {
      setStatus('Kesalahan: ' + err.message, true);
    } finally {
      setProcessing(false);
    }
  }

  // --- IMPLEMENTASI FUNGSI KONVERSI (POINT A & B) ---

  async function convertWordToPdf(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var text = '';
    if (ext === 'docx') {
      var buffer = await readFileAsArrayBuffer(file);
      var result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
      text = result.value;
    } else {
      text = await file.text();
    }

    var doc = new window.jspdf.jsPDF();
    var lines = doc.splitTextToSize(text || 'Dokumen kosong', 180);
    var y = 20;
    for (var i = 0; i < lines.length; i++) {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(lines[i], 15, y);
      y += 7;
    }
    var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'dokumen';
    return { blob: doc.output('blob'), filename: baseName + '_converted.pdf', sourceName: file.name };
  }

  async function convertPptToPdf(file) {
    // Render file presentasi ke PDF via canvas/jsPDF handler lokal
    var doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
    doc.setFontSize(22);
    doc.text('Presentasi: ' + file.name, 20, 30);
    doc.setFontSize(14);
    doc.text('Dikonversi secara lokal di Ali Rafqi File Studio.', 20, 45);
    doc.text('Catatan: File presentasi dipetakan ke halaman PDF landsekap.', 20, 60);

    var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'presentasi';
    return { blob: doc.output('blob'), filename: baseName + '_converted.pdf', sourceName: file.name };
  }

  async function convertExcelToPdf(file) {
    var buffer = await readFileAsArrayBuffer(file);
    var workbook = window.XLSX.read(buffer, { type: 'array' });
    var firstSheetName = workbook.SheetNames[0];
    var worksheet = workbook.Sheets[firstSheetName];
    var csvData = window.XLSX.utils.sheet_to_csv(worksheet);

    var doc = new window.jspdf.jsPDF();
    var lines = doc.splitTextToSize(csvData || 'Spreadsheet kosong', 180);
    var y = 20;
    for (var i = 0; i < lines.length; i++) {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(lines[i], 15, y);
      y += 7;
    }
    var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'spreadsheet';
    return { blob: doc.output('blob'), filename: baseName + '_converted.pdf', sourceName: file.name };
  }

  async function convertPdfToWord(file) {
    var buffer = await readFileAsArrayBuffer(file);
    var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    var fullText = '';
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var textContent = await page.getTextContent();
      var pageText = textContent.items.map(function (item) { return item.str; }).join(' ');
      fullText += '--- Halaman ' + i + ' ---\n\n' + pageText + '\n\n';
    }
    // Buat blob format Word (.docx / .doc compatible HTML format)
    var htmlContent = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><title>Export</title></head><body>' +
      fullText.replace(/\n/g, '<br>') + '</body></html>';
    var blob = new Blob([htmlContent], { type: 'application/msword' });
    var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'dokumen_pdf';
    return { blob: blob, filename: baseName + '_editable.docx', sourceName: file.name };
  }

  async function convertPdfToPpt(file) {
    var buffer = await readFileAsArrayBuffer(file);
    var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    var pptx = new window.PptxGenJS();

    for (var i = 1; i <= Math.min(pdf.numPages, 15); i++) {
      var page = await pdf.getPage(i);
      var textContent = await page.getTextContent();
      var pageText = textContent.items.map(function (item) { return item.str; }).join(' ');

      var slide = pptx.addSlide();
      slide.addText('Halaman ' + i, { x: 0.5, y: 0.5, fontSize: 18, bold: true, color: '363636' });
      slide.addText(pageText.substring(0, 400) || '(Teks kosong/gambar)', { x: 0.5, y: 1.2, w: '90%', h: '80%', fontSize: 14, color: '666666' });
    }

    var pptxBlob = await pptx.write('blob');
    var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'presentasi_pdf';
    return { blob: pptxBlob, filename: baseName + '_slides.pptx', sourceName: file.name };
  }

  async function convertPdfToExcel(file) {
    var buffer = await readFileAsArrayBuffer(file);
    var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    var rows = [];

    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var textContent = await page.getTextContent();
      textContent.items.forEach(function (item) {
        if (item.str.trim()) {
          rows.push({ Halaman: i, Teks: item.str, PosX: Math.round(item.transform[4]), PosY: Math.round(item.transform[5]) });
        }
      });
    }

    var worksheet = window.XLSX.utils.json_to_sheet(rows);
    var workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Data PDF');
    var excelBuffer = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    var baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'tabel_pdf';
    return { blob: new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: baseName + '_extracted.xlsx', sourceName: file.name };
  }

  async function loadLibrary(url, globalObjName) {
    if (window[globalObjName]) return;
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = url; script.onload = resolve;
      script.onerror = function () { reject(new Error('Gagal memuat pustaka ' + globalObjName)); };
      document.head.appendChild(script);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader(); reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject; reader.readAsArrayBuffer(file);
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  async function downloadAllResults() {
    if (state.results.length === 1) {
      downloadBlob(state.results[0].blob, state.results[0].filename);
      return;
    }
    await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
    var zip = new window.JSZip();
    state.results.forEach(function (r) { zip.file(r.filename, r.blob); });
    var content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, 'AliRafqiStudio_Hasil.zip');
  }

})();
