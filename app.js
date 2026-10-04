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
      marker: 'KOMPRES & PANGKAS VIDEO', title: 'perkecil ukuran dan potong area video', description: 'Kurangi ukuran file video dengan menurunkan bitrate (kualitas) atau potong area bingkai video.',
      dropTitle: 'Tarik video ke sini', requirements: 'atau pilih dari perangkat · MP4, WebM · maksimal 2 file',
      accept: 'video/mp4,video/webm,.mp4,.webm', extensions: ['mp4', 'webm'], maxFiles: 2, runLabel: 'Proses Video'
    }
  };

  var el = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheElements();
    initializeTheme();
    bindAuthEvents();
    bindStudioEvents();
    configurePdfWorker();
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
      'results-section', 'result-list', 'download-all', 'history-dialog', 'history-list', 'clear-history', 'settings-dialog'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  async function initializeApplication() {
    if (!isLocalProfileSupported()) {
      setAuthMessage('Browser ini tidak mendukung penyimpanan profil aman. Gunakan Chrome terbaru.');
      el['auth-submit'].disabled = true;
      return;
    }

    try {
      await getDatabase();
      await restoreSession();
    } catch (error) {
      console.error(error);
      setAuthMessage('Database lokal tidak dapat dibuka. Pastikan penyimpanan browser tidak diblokir.');
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

  
  function safeStorageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function safeStorageRemove(key) { try { localStorage.removeItem(key); } catch (e) { } }
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
        
        if (!userRecord) { 
          finishAuthError(null, 'Nama belum terdaftar. Klik "Buat profil" di bawah.'); 
          return; 
        }

        if (!userRecord.saltHex) {
           finishAuthError(null, 'Format akun lama. Silakan hapus/buat profil baru.');
           return;
        }

        var saltBytes = new Uint8Array(userRecord.saltHex.match(/.{1,2}/g).map(function (byte) { return parseInt(byte, 16); }));
        var inputHashHex = await generatePasswordHash(pass, saltBytes);

        if (inputHashHex !== userRecord.hashHex) { finishAuthError(null, 'Kata sandi salah.'); return; }
        finishAuthSuccess(userRecord, el['remember-device'].checked);
      }
    } catch (error) {
      console.error(error);
      alert("Terdapat error sistem di HP kamu: " + error.message); 
      setAuthMessage('Gagal masuk. Lihat pesan popup.');
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
    } catch (e) {
      safeStorageRemove(ACTIVE_SESSION_KEY);
    }
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
        alert('Data berhasil dihapus. Halaman akan dimuat ulang.');
        window.location.reload();
      };
      request.onerror = function () { alert('Gagal menghapus sebagian data.'); };
    } catch (error) { alert('Tidak dapat menghapus data.'); }
  }

  async function saveToHistory(resultData) {
    if (!state.currentUser) return;
    try {
      await performDbTransaction('history', 'readwrite', function (s) {
        return s.add({ username: state.currentUser.username, timestamp: Date.now(), filename: resultData.filename, sizeBytes: resultData.blob.size, toolUsed: state.selectedTool });
      });
      updateHistoryBadge();
    } catch (e) { console.error('Gagal simpan riwayat', e); }
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
        var li = document.createElement('li');
        li.textContent = 'Belum ada catatan unduhan.';
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
    } catch (e) { alert('Gagal menghapus riwayat.'); }
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

      // 1. Format Hasil
      var lblFormat = document.createElement('label');
      lblFormat.className = 'field compact';
      lblFormat.innerHTML = '<span>Format hasil</span>';
      var selectFormat = document.createElement('select');
      selectFormat.id = 'dynamic-format-select';
      selectFormat.innerHTML = '<option value="jpg">JPG — ukuran lebih ringan</option><option value="png">PNG — kualitas tajam</option><option value="webp">WebP — efisien & modern</option>';
      lblFormat.appendChild(selectFormat);

      // 2. Kualitas Kompresi (Ukuran KB/MB)
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

      
      var lblBitrateInfo = document.createElement('span');
      lblBitrateInfo.style.fontWeight = 'bold';
      lblBitrateInfo.textContent = 'Pengaturan Kompresi (Untuk mengurangi MB):';
      cropGroup.appendChild(lblBitrateInfo);

      var bitrateWrapper = document.createElement('label');
      bitrateWrapper.className = 'field compact';
      bitrateWrapper.innerHTML = '<span>Kualitas Video (Bitrate):</span>';
      var bitrateSelect = document.createElement('select');
      bitrateSelect.id = 'videoBitrate';
      bitrateSelect.innerHTML = '<option value="">Otomatis (Bawaan)</option><option value="5000000">Tinggi (5 Mbps) - Kualitas Cukup Baik</option><option value="2500000">Sedang (2.5 Mbps) - Standar/Menengah</option><option value="1000000">Rendah (1 Mbps) - Ukuran Kecil</option><option value="500000">Sangat Rendah (500 Kbps) - Sangat Ringan</option>';
      bitrateWrapper.appendChild(bitrateSelect);
      cropGroup.appendChild(bitrateWrapper);

      var lblCropInfo = document.createElement('span');
      lblCropInfo.style.fontWeight = 'bold';
      lblCropInfo.style.marginTop = '10px';
      lblCropInfo.textContent = 'Pengaturan Potong Area/Bingkai (Kosongkan Lebar/Tinggi untuk membiarkan bentuk aslinya):';
      cropGroup.appendChild(lblCropInfo);

      var gridCrop = document.createElement('div');
      gridCrop.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;';

      var cropInputs = [
        { id: 'cropX', label: 'Posisi AWAL X (px):', default: '0' },
        { id: 'cropY', label: 'Posisi AWAL Y (px):', default: '0' },
        { id: 'cropW', label: 'LEBAR Hasil (px):', default: '' },
        { id: 'cropH', label: 'TINGGI Hasil (px):', default: '' }
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

      cropGroup.appendChild(gridCrop);
      el['conversion-options'].appendChild(cropGroup);
    }

    if (!skipClear) { clearFiles(); clearResults(); setStatus('Menunggu file...'); } 
    else { validateFilesAgainstTool(); }
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
    });

    if (addedCount > 0) { renderFiles(); setStatus(state.files.length + ' file siap diproses.'); }
  }

  function validateFilesAgainstTool() {
    var tool = tools[state.selectedTool];
    var validFiles = state.files.filter(function (file) { return tool.extensions.indexOf(file.name.split('.').pop().toLowerCase()) !== -1; });
    if (validFiles.length !== state.files.length) { state.files = validFiles; setStatus('Beberapa file dihapus.', true); }
    if (state.files.length > tool.maxFiles) { state.files = state.files.slice(0, tool.maxFiles); setStatus('Jumlah file dipangkas.', true); }
    renderFiles();
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
      state.results.forEach(function(r) { if (r.previewUrl) { URL.revokeObjectURL(r.previewUrl); } });
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
      previewBox.style.cssText = 'background: var(--surface-hover); border-radius: 8px; margin-bottom: 12px; overflow: hidden; display: flex; justify-content: center; align-items: center; border: 1px solid var(--border-color);';
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
      } else {
        var fallback = document.createElement('div'); fallback.style.padding = '20px'; fallback.style.color = 'var(--text-secondary)'; fallback.textContent = 'Pratinjau tidak tersedia';
        previewBox.append(fallback);
      }

      var infoBar = document.createElement('div'); infoBar.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 10px;';
      var copy = document.createElement('div'); copy.style.overflow = 'hidden';
      var name = document.createElement('strong'); name.textContent = result.filename; name.style.cssText = 'display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      var detail = document.createElement('div'); detail.style.cssText = 'font-size: 0.85em; color: var(--text-secondary);';
      detail.textContent = formatBytes(result.blob.size) + ' · dari ' + result.sourceName;
      copy.append(name, detail);

      var download = document.createElement('button'); download.className = 'download-one'; download.type = 'button'; download.dataset.downloadResult = String(index);
      download.innerHTML = '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg> Unduh';

      infoBar.append(copy, download); item.append(previewBox, infoBar); el['result-list'].append(item);
    });
  }

  function setStatus(msg, isError) { el['work-status'].textContent = msg; el['work-status'].style.color = isError ? '#e74c3c' : 'inherit'; }

  function setProcessing(isProcessing, statusText) {
    state.processing = isProcessing; document.body.classList.toggle('is-processing', isProcessing);
    el['run-conversion'].disabled = isProcessing || !state.files.length; el['clear-files'].disabled = isProcessing; el['file-picker'].disabled = isProcessing;
    document.querySelectorAll('.remove-file').forEach(function (b) { b.disabled = isProcessing; });

    if (isProcessing) {
      el['progress-wrap'].hidden = false; el['progress-label'].textContent = statusText || 'Memproses...';
      el['progress-value'].textContent = '0%'; el['progress-bar'].style.width = '0%';
      clearResults(); setStatus('Bekerja, mohon tunggu...', false);
    } else {
      el['progress-wrap'].hidden = true;
      if (state.lastFailures.length > 0) { setStatus('Selesai dengan ' + state.lastFailures.length + ' peringatan.', true); } 
      else { setStatus(state.results.length ? 'Selesai! Silakan periksa hasil di bawah.' : 'Pilih file untuk memulai.'); }
    }
  }

  function updateProgress(percent, label) {
    var p = Math.max(0, Math.min(100, Math.round(percent)));
    el['progress-bar'].style.width = p + '%'; el['progress-value'].textContent = p + '%';
    if (label) el['progress-label'].textContent = label;
  }

  // --- ENGINE PROCESSOR UTAMA ---
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
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'mammoth');
        for (var j = 0; j < state.files.length; j++) {
          updateProgress(10 + ((j / state.files.length) * 80), 'Merender dokumen ' + (j + 1));
          try { outputs.push(await convertDocumentToPdf(state.files[j])); } 
          catch (e) { state.lastFailures.push({ file: state.files[j].name, error: e.message }); }
        }
      } else if (tool === 'merge-pdf') {
        updateProgress(10, 'Memuat library PDF...');
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib');
        outputs.push(await mergePdfs(state.files));
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

        var cX = cropXEl && cropXEl.value ? parseInt(cropXEl.value, 10) : 0;
        var cY = cropYEl && cropYEl.value ? parseInt(cropYEl.value, 10) : 0;
        var cW = cropWEl && cropWEl.value ? parseInt(cropWEl.value, 10) : 0;
        var cH = cropHEl && cropHEl.value ? parseInt(cropHEl.value, 10) : 0;
        var bitrate = bitrateEl && bitrateEl.value ? parseInt(bitrateEl.value, 10) : null;

        for (var cv = 0; cv < state.files.length; cv++) {
          updateProgress(5 + ((cv / state.files.length) * 90), 'Memproses video ' + (cv + 1));
          try { outputs.push(await cropVideo(state.files[cv], cX, cY, cW, cH, bitrate)); } 
          catch (e) { state.lastFailures.push({ file: state.files[cv].name, error: e.message }); }
        }
      }

      updateProgress(100, 'Merapikan hasil...');
      outputs.forEach(function(out) { out.previewUrl = URL.createObjectURL(out.blob); });
      state.results = outputs; renderResults();

    } catch (criticalError) { setStatus('Kesalahan fatal: ' + criticalError.message, true); } 
    finally { setProcessing(false); }
  }

  async function convertImageFormat(file, format, quality, scale, cropRatio) {
    scale = scale || 1.0;
    cropRatio = cropRatio || 'none';

    var dataUrl = await readFileAsDataUrl(file);
    var img = await loadImageFromUrl(dataUrl);
    if (img.width * img.height > MAX_IMAGE_PIXELS) throw new Error('Resolusi gambar terlalu besar. Maks 40MP.');

    // 1. Pangkas Area Tengah (Center Crop) sesuai rasio
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

    // 2. Perkecil Dimensi Piksel sesuai skala
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

  // --- HELPER DOKUMEN & LAINNYA ---
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

  async function cropVideo(file, cropX, cropY, cropWidth, cropHeight, bitrate) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = function () {
        var startX = Math.max(0, cropX || 0);
        var startY = Math.max(0, cropY || 0);
        
       
        var targetW = cropWidth ? Math.min(cropWidth, video.videoWidth - startX) : video.videoWidth - startX;
        var targetH = cropHeight ? Math.min(cropHeight, video.videoHeight - startY) : video.videoHeight - startY;

        if (targetW <= 0 || targetH <= 0) {
          URL.revokeObjectURL(video.src);
          return reject(new Error('Ukuran pangkas tidak valid atau melebihi resolusi video.'));
        }

        var canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        var ctx = canvas.getContext('2d');

        var stream = canvas.captureStream(30);
        
        // --- MENERAPKAN BITRATE KE RECORDER OPSI ---
        var recorderOptions = { mimeType: 'video/webm' };
        if (bitrate) recorderOptions.videoBitsPerSecond = bitrate;

        if (!MediaRecorder.isTypeSupported('video/webm')) {
          recorderOptions = { mimeType: 'video/mp4' };
          if (bitrate) recorderOptions.videoBitsPerSecond = bitrate;
        }

        var mediaRecorder;
        try {
          mediaRecorder = new MediaRecorder(stream, recorderOptions);
        } catch (e) {
          // Fallback apabila bitrate ditolak oleh device Anda
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
            filename: baseName + '_compressed' + ext,
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

  // --- UNDUH ---
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
    btn.disabled = true; btn.textContent = 'Menyiapkan ZIP...';

    try {
      await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
      var zip = new window.JSZip();
      state.results.forEach(function (result) { zip.file(result.filename, result.blob); });
      var content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, 'AliRafqiStudio_BanyakFile.zip');
      state.results.forEach(function (r) { saveToHistory(r); });
    } catch (e) { alert('Gagal membuat ZIP. Unduh file satu per satu.'); } 
    finally { btn.disabled = false; btn.textContent = originalText; }
  }

})();
