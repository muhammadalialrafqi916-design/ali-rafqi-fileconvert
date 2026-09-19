(function () {
  'use strict';

  var DB_NAME = 'AliRafqiFileStudio';
  var DB_VERSION = 1;
  var PBKDF2_ITERATIONS = 600000;
  var SESSION_DAYS = 45;
  var ACTIVE_SESSION_KEY = 'aliRafqiFileStudio.activeSession.v1';
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
      marker: 'GAMBAR', title: 'Ubah format gambar', description: 'Ubah JPG, PNG, atau WebP ke format pilihanmu.',
      dropTitle: 'Tarik gambar ke sini', requirements: 'atau pilih dari perangkat · JPG, PNG, WebP · maksimal 15 file',
      accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', extensions: ['jpg', 'jpeg', 'png', 'webp'], maxFiles: 15, runLabel: 'Ubah gambar'
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
      marker: 'DOKUMEN → PDF', title: 'Dokumen teks ke PDF', description: 'Ekspor isi TXT atau DOCX sederhana menjadi PDF.',
      dropTitle: 'Tarik dokumen ke sini', requirements: 'atau pilih dari perangkat · TXT, DOCX · maksimal 5 file',
      accept: 'text/plain,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['txt', 'docx'], maxFiles: 5, runLabel: 'Buat PDF dokumen'
    },
    'merge-pdf': {
      marker: 'GABUNG PDF', title: 'Gabungkan PDF', description: 'Satukan beberapa PDF mengikuti urutan file yang dipilih.',
      dropTitle: 'Tarik beberapa PDF ke sini', requirements: 'atau pilih dari perangkat · PDF · maksimal 12 file',
      accept: 'application/pdf,.pdf', extensions: ['pdf'], maxFiles: 12, runLabel: 'Gabungkan PDF'
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
      'results-section', 'result-list', 'download-all', 'image-quality', 'image-quality-output', 'history-dialog', 'history-list',
      'clear-history', 'settings-dialog', 'pdf-pages'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  async function initializeApplication() {
    if (!isLocalProfileSupported()) {
      setAuthMessage('Browser ini tidak mendukung penyimpanan profil aman. Gunakan Chrome terbaru melalui localhost atau HTTPS.');
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
    document.querySelector('.show-password').addEventListener('click', function () {
      var willShow = el.password.type === 'password';
      el.password.type = willShow ? 'text' : 'password';
      this.textContent = willShow ? 'Sembunyi' : 'Tampil';
      this.setAttribute('aria-label', willShow ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    });

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
    el['drop-zone'].addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el['file-picker'].click();
      }
    });
    el['file-picker'].addEventListener('change', function () {
      addFiles(Array.prototype.slice.call(this.files));
      this.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (name) {
      el['drop-zone'].addEventListener(name, function (event) {
        event.preventDefault();
        el['drop-zone'].classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      el['drop-zone'].addEventListener(name, function (event) {
        event.preventDefault();
        el['drop-zone'].classList.remove('is-dragging');
      });
    });
    el['drop-zone'].addEventListener('drop', function (event) {
      addFiles(Array.prototype.slice.call(event.dataTransfer.files || []));
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
      setStatus('Daftar file dibersihkan.');
    });
    el['run-conversion'].addEventListener('click', runConversion);
    el['image-quality'].addEventListener('input', function () { el['image-quality-output'].textContent = this.value + '%'; });
    el['download-all'].addEventListener('click', downloadAllResults);
    el['result-list'].addEventListener('click', function (event) {
      var button = event.target.closest('[data-download-result]');
      if (button) downloadBlob(state.results[Number(button.dataset.downloadResult)].blob, state.results[Number(button.dataset.downloadResult)].filename);
    });

    el['open-history'].addEventListener('click', async function () {
      await renderHistory();
      showDialog(el['history-dialog']);
    });
    el['clear-history'].addEventListener('click', clearHistory);
    el['open-settings'].addEventListener('click', function () { showDialog(el['settings-dialog']); });
    el['logout-button'].addEventListener('click', logout);
    el['delete-local-data'].addEventListener('click', deleteAllLocalData);
    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', function () {
        var dialog = document.getElementById(this.dataset.closeDialog);
        if (dialog) dialog.close();
      });
    });
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    var registering = mode === 'register';
    document.querySelector('.auth-name-field').hidden = !registering;
    el['auth-kicker'].innerHTML = '<i></i> ' + (registering ? 'BUAT PROFIL LOKAL' : 'SELAMAT DATANG');
    el['auth-heading'].textContent = registering ? 'Buat Profil' : 'Masuk ke Studio';
    el['auth-description'].textContent = registering ? 'Buat satu profil untuk menyimpan sesi dan riwayat di browser ini.' : 'Gunakan profil lokal yang sudah ada di perangkat ini.';
    el['auth-submit-label'].textContent = registering ? 'Buat profil & masuk' : 'Masuk ke Studio';
    el['switch-copy'].textContent = registering ? 'Sudah punya profil lokal?' : 'Belum punya profil lokal?';
    el['switch-auth-mode'].textContent = registering ? 'Masuk' : 'Buat profil';
    el.password.autocomplete = registering ? 'new-password' : 'current-password';
    document.querySelector('.auth-password-note').textContent = registering ? 'Minimal 8 karakter. Password tidak disimpan dalam bentuk teks biasa.' : 'Kata sandi tidak disimpan dalam bentuk teks biasa.';
    setAuthMessage('');
  }

  async function submitAuthForm() {
    var username = normaliseUsername(el.username.value);
    var password = el.password.value;
    var displayName = (el['display-name'].value || username).trim();
    var remember = el['remember-device'].checked;

    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      el.username.setAttribute('aria-invalid', 'true');
      setAuthMessage('Nama pengguna harus 3–24 karakter: huruf, angka, titik, garis bawah, atau tanda minus.');
      return;
    }
    if (password.length < 8) {
      el.password.setAttribute('aria-invalid', 'true');
      setAuthMessage('Kata sandi minimal terdiri dari 8 karakter.');
      return;
    }
    if (state.authMode === 'register' && (!displayName || displayName.length > 42)) {
      setAuthMessage('Masukkan nama tampilan dengan panjang maksimal 42 karakter.');
      return;
    }

    setAuthBusy(true);
    try {
      if (state.authMode === 'register') {
        setAuthMessage('Membuat profil lokal dengan aman…', true);
        var existing = await getProfileByUsername(username);
        if (existing) throw new Error('Nama pengguna tersebut sudah dipakai pada perangkat ini.');
        var salt = randomBase64(16);
        var verifier = await derivePasswordVerifier(password, salt);
        var user = {
          id: newId(), username: username, displayName: displayName, passwordSalt: salt, passwordVerifier: verifier,
          kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, version: 1 }, createdAt: Date.now(), lastLoginAt: Date.now()
        };
        await idbPut('profiles', user);
        requestPersistentStorage();
        await establishSession(user, remember);
      } else {
        setAuthMessage('Memeriksa profil lokal…', true);
        var profile = await getProfileByUsername(username);
        if (!profile) throw new Error('Profil tidak ditemukan di perangkat ini. Buat profil baru terlebih dahulu.');
        var calculatedVerifier = await derivePasswordVerifier(password, profile.passwordSalt, profile.kdf && profile.kdf.iterations);
        if (!constantTimeEqual(calculatedVerifier, profile.passwordVerifier)) throw new Error('Nama pengguna atau kata sandi belum cocok.');
        profile.lastLoginAt = Date.now();
        await idbPut('profiles', profile);
        await establishSession(profile, remember);
      }
    } catch (error) {
      console.error(error);
      setAuthMessage(error.message || 'Profil tidak dapat diproses. Coba lagi.');
    } finally {
      setAuthBusy(false);
    }
  }

  function setAuthBusy(busy) {
    el['auth-submit'].disabled = busy;
    el['switch-auth-mode'].disabled = busy;
  }

  function setAuthMessage(message, success) {
    el['auth-message'].textContent = message;
    el['auth-message'].classList.toggle('is-success', Boolean(success && message));
  }

  async function establishSession(user, remember) {
    var token = randomBase64(32);
    var session = {
      id: newId(), profileId: user.id, tokenHash: await sha256(token),
      expiresAt: Date.now() + SESSION_DAYS * 86400000, createdAt: Date.now(), lastSeenAt: Date.now(), remember: remember
    };
    await idbPut('sessions', session);
    var clientSession = JSON.stringify({ id: session.id, token: token, remember: remember });
    safeStorageRemove(ACTIVE_SESSION_KEY, true);
    safeStorageRemove(ACTIVE_SESSION_KEY, false);
    if (remember) safeStorageSet(ACTIVE_SESSION_KEY, clientSession, true);
    else safeStorageSet(ACTIVE_SESSION_KEY, clientSession, false);
    state.currentUser = user;
    enterStudio();
  }

  async function restoreSession() {
    var raw = safeStorageGet(ACTIVE_SESSION_KEY, true) || safeStorageGet(ACTIVE_SESSION_KEY, false);
    if (!raw) return;
    try {
      var stored = JSON.parse(raw);
      var session = await idbGet('sessions', stored.id);
      if (!session || session.expiresAt < Date.now() || !constantTimeEqual(await sha256(stored.token), session.tokenHash)) {
        await clearCurrentSession(true);
        return;
      }
      var user = await idbGet('profiles', session.profileId);
      if (!user) {
        await clearCurrentSession(true);
        return;
      }
      session.lastSeenAt = Date.now();
      await idbPut('sessions', session);
      state.currentUser = user;
      enterStudio();
    } catch (error) {
      console.warn('Sesi lokal tidak dapat dipulihkan.', error);
      await clearCurrentSession(true);
    }
  }

  function enterStudio() {
    populateProfile();
    el['auth-screen'].hidden = true;
    el['studio-shell'].hidden = false;
    selectTool(state.selectedTool, true);
    refreshHistoryCount();
  }

  function populateProfile() {
    var name = state.currentUser.displayName || state.currentUser.username;
    var initials = name.trim().slice(0, 1).toUpperCase() || 'A';
    el['profile-name'].textContent = name;
    el['welcome-name'].textContent = name.split(/\s+/)[0];
    el['profile-avatar'].textContent = initials;
    el['settings-avatar'].textContent = initials;
    el['settings-name'].textContent = name;
    el['settings-username'].textContent = '@' + state.currentUser.username;
  }

  async function logout() {
    await clearCurrentSession(true);
    if (el['settings-dialog'].open) el['settings-dialog'].close();
    resetToAuth();
    setAuthMessage('Sesi telah berakhir di perangkat ini.', true);
  }

  async function clearCurrentSession(removeDatabaseSession) {
    var raw = safeStorageGet(ACTIVE_SESSION_KEY, true) || safeStorageGet(ACTIVE_SESSION_KEY, false);
    if (removeDatabaseSession && raw) {
      try { await idbDelete('sessions', JSON.parse(raw).id); } catch (error) { console.warn(error); }
    }
    safeStorageRemove(ACTIVE_SESSION_KEY, true);
    safeStorageRemove(ACTIVE_SESSION_KEY, false);
  }

  function resetToAuth() {
    state.currentUser = null;
    state.files = [];
    state.results = [];
    el['studio-shell'].hidden = true;
    el['auth-screen'].hidden = false;
    el.password.value = '';
    setAuthMode('login');
  }

  async function deleteAllLocalData() {
    if (!window.confirm('Hapus profil, sesi, dan riwayat lokal dari browser ini? Tindakan ini tidak dapat dipulihkan.')) return;
    try {
      if (el['settings-dialog'].open) el['settings-dialog'].close();
      if (databasePromise) {
        var database = await databasePromise;
        database.close();
        databasePromise = undefined;
      }
      await deleteDatabase();
      safeStorageRemove(ACTIVE_SESSION_KEY, true);
      safeStorageRemove(ACTIVE_SESSION_KEY, false);
      resetToAuth();
      setAuthMessage('Semua data lokal File Studio telah dihapus.', true);
    } catch (error) {
      console.error(error);
      setStatus('Data lokal belum dapat dihapus. Tutup tab File Studio lain lalu coba lagi.', 'error');
    }
  }

  function selectTool(toolName, skipClear) {
    if (!tools[toolName]) return;
    state.selectedTool = toolName;
    var tool = tools[toolName];
    document.querySelectorAll('.tool-card').forEach(function (card) { card.classList.toggle('is-selected', card.dataset.tool === toolName); });
    el['active-tool-marker'].textContent = tool.marker;
    el['workbench-title'].textContent = tool.title;
    el['workbench-description'].textContent = tool.description;
    el['drop-title'].textContent = tool.dropTitle;
    el['file-requirements'].textContent = tool.requirements;
    el['file-picker'].accept = tool.accept;
    el['file-picker'].multiple = tool.maxFiles > 1;
    el['run-label'].textContent = tool.runLabel;
    document.querySelectorAll('[data-option-group]').forEach(function (group) { group.hidden = group.dataset.optionGroup !== toolName; });
    if (!skipClear) {
      clearFiles();
      state.results = [];
      renderResults();
      setStatus('Pilih file untuk memulai.');
    }
  }

  function addFiles(newFiles) {
    var tool = tools[state.selectedTool];
    if (!newFiles.length || state.processing) return;
    var accepted = [];
    var rejected = [];
    newFiles.forEach(function (file) {
      if (!fileMatchesTool(file, tool)) rejected.push(file.name + ' bukan format yang sesuai.');
      else if (file.size > MAX_FILE_SIZE) rejected.push(file.name + ' melebihi 80 MB.');
      else accepted.push(file);
    });
    var combined = state.files.concat(accepted);
    if (combined.length > tool.maxFiles) {
      rejected.push('Maksimal ' + tool.maxFiles + ' file untuk alat ini.');
      combined = combined.slice(0, tool.maxFiles);
    }
    var totalSize = combined.reduce(function (sum, file) { return sum + file.size; }, 0);
    while (totalSize > MAX_TOTAL_SIZE && combined.length) {
      var removed = combined.pop();
      totalSize -= removed.size;
      rejected.push(removed.name + ' tidak ditambahkan agar total tidak melebihi 200 MB.');
    }
    state.files = combined;
    renderFiles();
    if (rejected.length) setStatus(rejected[0], 'error');
    else setStatus(state.files.length + ' file siap diproses.', 'success');
  }

  function fileMatchesTool(file, tool) {
    return tool.extensions.indexOf(getExtension(file.name)) !== -1;
  }

  function clearFiles() {
    state.files = [];
    el['file-picker'].value = '';
    renderFiles();
  }

  function renderFiles() {
    el['selected-files'].hidden = !state.files.length;
    el['clear-files'].disabled = !state.files.length || state.processing;
    el['run-conversion'].disabled = !state.files.length || state.processing;
    el['selected-file-count'].textContent = state.files.length + (state.files.length === 1 ? ' file' : ' file');
    el['file-list'].replaceChildren();
    state.files.forEach(function (file, index) {
      var item = document.createElement('div');
      item.className = 'file-item';
      var type = document.createElement('span');
      type.className = 'file-type';
      type.textContent = getExtension(file.name).toUpperCase().slice(0, 4);
      var detail = document.createElement('div');
      detail.className = 'file-detail';
      var name = document.createElement('strong');
      name.textContent = file.name;
      var size = document.createElement('span');
      size.textContent = formatBytes(file.size);
      detail.append(name, size);
      var remove = document.createElement('button');
      remove.className = 'remove-file';
      remove.type = 'button';
      remove.dataset.removeFile = String(index);
      remove.setAttribute('aria-label', 'Hapus ' + file.name);
      remove.textContent = '×';
      item.append(type, detail, remove);
      el['file-list'].append(item);
    });
  }

  function setStatus(message, kind) {
    el['work-status'].textContent = message;
    el['work-status'].classList.toggle('is-error', kind === 'error');
    el['work-status'].classList.toggle('is-success', kind === 'success');
  }

  function setProgress(percent, label) {
    el['progress-wrap'].hidden = false;
    el['progress-bar'].style.width = Math.max(0, Math.min(100, percent)) + '%';
    el['progress-value'].textContent = Math.round(percent) + '%';
    el['progress-label'].textContent = label;
  }

  function setProcessing(processing) {
    state.processing = processing;
    el['run-conversion'].disabled = processing || !state.files.length;
    el['clear-files'].disabled = processing || !state.files.length;
    document.querySelectorAll('.tool-card').forEach(function (card) { card.disabled = processing; });
    document.querySelectorAll('.remove-file').forEach(function (button) { button.disabled = processing; });
  }

  async function runConversion() {
    if (!state.files.length || state.processing) return;
    setProcessing(true);
    state.results = [];
    state.lastFailures = [];
    renderResults();
    setProgress(3, 'Menyiapkan file…');
    setStatus('Memproses di perangkat ini…');

    try {
      var outputs;
      if (state.selectedTool === 'images') outputs = await convertImages();
      else if (state.selectedTool === 'pdf-images') outputs = await convertPdfToImages();
      else if (state.selectedTool === 'images-pdf') outputs = await convertImagesToPdf();
      else if (state.selectedTool === 'documents') outputs = await convertDocumentsToPdf();
      else if (state.selectedTool === 'merge-pdf') outputs = await mergePdfs();
      else throw new Error('Alat belum tersedia.');

      if (!outputs.length) throw new Error(state.lastFailures[0] || 'Tidak ada hasil yang dapat dibuat dari file tersebut.');
      state.results = outputs;
      renderResults();
      await saveHistory(outputs);
      await refreshHistoryCount();
      setProgress(100, 'Selesai. Hasil siap diunduh.');
      var failureNote = state.lastFailures.length ? ' ' + state.lastFailures.length + ' file tidak dapat diproses.' : '';
      setStatus(outputs.length + ' hasil siap diunduh.' + failureNote, state.lastFailures.length ? 'error' : 'success');
      if (outputs.length === 1) downloadBlob(outputs[0].blob, outputs[0].filename);
    } catch (error) {
      console.error(error);
      setProgress(0, 'Proses belum selesai.');
      setStatus(readableError(error), 'error');
    } finally {
      setProcessing(false);
    }
  }

  async function convertImages() {
    var mime = document.getElementById('image-format').value;
    var quality = Number(document.getElementById('image-quality').value) / 100;
    var scale = Number(document.getElementById('image-scale').value);
    return processFilesWithRecovery('Mengubah gambar', async function (file) {
      var canvas = await imageFileToCanvas(file, scale, mime === 'image/jpeg');
      var blob = await canvasToBlob(canvas, mime, quality);
      if (!blob) throw new Error('Browser tidak dapat membuat format gambar ini.');
      return [{ blob: blob, filename: cleanFileName(stripExtension(file.name) + '-ali-rafqi.' + extensionFromMime(blob.type || mime)), sourceName: file.name }];
    });
  }

  async function convertPdfToImages() {
    if (!window.pdfjsLib) throw new Error('Mesin PDF belum termuat. Pastikan koneksi internet tersedia lalu muat ulang halaman.');
    configurePdfWorker();
    var targetMime = document.getElementById('pdf-image-format').value;
    var scale = Number(document.getElementById('pdf-render-scale').value);
    var pagesInput = el['pdf-pages'].value;
    var allOutputs = [];
    var currentPdfIndex = 0;

    for (var i = 0; i < state.files.length; i += 1) {
      var file = state.files[i];
      try {
        currentPdfIndex += 1;
        setProgress(5 + (i / state.files.length) * 85, 'Membaca PDF ' + currentPdfIndex + ' dari ' + state.files.length + '…');
        var loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        var pdf = await loadingTask.promise;
        var selectedPages = parsePageRange(pagesInput, pdf.numPages);
        if (selectedPages.length > MAX_PDF_PAGES) throw new Error('Batasi hingga ' + MAX_PDF_PAGES + ' halaman sekali proses untuk menjaga memori browser.');
        for (var p = 0; p < selectedPages.length; p += 1) {
          var pageNumber = selectedPages[p];
          setProgress(5 + ((i + (p + 1) / selectedPages.length) / state.files.length) * 85, 'Merender halaman ' + pageNumber + ' dari ' + pdf.numPages + '…');
          var page = await pdf.getPage(pageNumber);
          var viewport = page.getViewport({ scale: scale });
          if (viewport.width * viewport.height > MAX_IMAGE_PIXELS) throw new Error('Halaman terlalu besar untuk dirender pada kualitas tersebut. Pilih ketajaman lebih rendah.');
          var canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
          var blob = await canvasToBlob(canvas, targetMime, targetMime === 'image/jpeg' ? .92 : undefined);
          if (!blob) throw new Error('Gambar halaman tidak dapat dibuat.');
          allOutputs.push({ blob: blob, filename: cleanFileName(stripExtension(file.name) + '-halaman-' + pageNumber + '.' + extensionFromMime(blob.type || targetMime)), sourceName: file.name });
        }
        if (pdf.cleanup) pdf.cleanup();
        if (pdf.destroy) pdf.destroy();
      } catch (error) {
        state.lastFailures.push(file.name + ': ' + readableError(error));
      }
    }
    return allOutputs;
  }

  async function convertImagesToPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Mesin pembuat PDF belum termuat. Pastikan koneksi internet tersedia lalu muat ulang halaman.');
    var jsPDF = window.jspdf.jsPDF;
    var format = document.getElementById('pdf-page-format').value;
    var autoRotate = document.getElementById('pdf-auto-rotate').checked;
    var doc = null;

    for (var i = 0; i < state.files.length; i += 1) {
      var file = state.files[i];
      try {
        setProgress(5 + ((i + 1) / state.files.length) * 87, 'Menambahkan gambar ' + (i + 1) + ' dari ' + state.files.length + '…');
        var canvas = await imageFileToCanvas(file, 1, true);
        var orientation = autoRotate && canvas.width > canvas.height ? 'landscape' : 'portrait';
        if (!doc) doc = new jsPDF({ orientation: orientation, unit: 'mm', format: format, compress: true });
        else doc.addPage(format, orientation);
        var pageWidth = doc.internal.pageSize.getWidth();
        var pageHeight = doc.internal.pageSize.getHeight();
        var margin = 10;
        var ratio = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
        var width = canvas.width * ratio;
        var height = canvas.height * ratio;
        var x = (pageWidth - width) / 2;
        var y = (pageHeight - height) / 2;
        doc.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG', x, y, width, height, undefined, 'FAST');
      } catch (error) {
        state.lastFailures.push(file.name + ': ' + readableError(error));
      }
    }
    if (!doc) return [];
    return [{ blob: doc.output('blob'), filename: 'gambar-ali-rafqi.pdf', sourceName: state.files.length + ' gambar' }];
  }

  async function convertDocumentsToPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Mesin pembuat PDF belum termuat. Pastikan koneksi internet tersedia lalu muat ulang halaman.');
    return processFilesWithRecovery('Membuat PDF dokumen', async function (file) {
      var text = await extractDocumentText(file);
      if (!text.trim()) throw new Error('Dokumen tidak memiliki teks yang dapat diekspor.');
      var blob = makeTextPdf(text, file.name);
      return [{ blob: blob, filename: cleanFileName(stripExtension(file.name) + '-ali-rafqi.pdf'), sourceName: file.name }];
    });
  }

  async function mergePdfs() {
    if (!window.PDFLib) throw new Error('Mesin penggabung PDF belum termuat. Pastikan koneksi internet tersedia lalu muat ulang halaman.');
    if (state.files.length < 2) throw new Error('Pilih setidaknya dua file PDF untuk digabungkan.');
    var merged = await window.PDFLib.PDFDocument.create();
    for (var i = 0; i < state.files.length; i += 1) {
      var file = state.files[i];
      setProgress(5 + ((i + 1) / state.files.length) * 87, 'Menggabungkan PDF ' + (i + 1) + ' dari ' + state.files.length + '…');
      try {
        var source = await window.PDFLib.PDFDocument.load(await file.arrayBuffer());
        var pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach(function (page) { merged.addPage(page); });
      } catch (error) {
        state.lastFailures.push(file.name + ': ' + readableError(error));
      }
    }
    if (merged.getPageCount() === 0) return [];
    var bytes = await merged.save();
    return [{ blob: new Blob([bytes], { type: 'application/pdf' }), filename: 'pdf-gabungan-ali-rafqi.pdf', sourceName: state.files.length + ' PDF' }];
  }

  async function processFilesWithRecovery(actionLabel, worker) {
    var outputs = [];
    for (var i = 0; i < state.files.length; i += 1) {
      var file = state.files[i];
      try {
        setProgress(5 + ((i + .2) / state.files.length) * 86, actionLabel + ' ' + (i + 1) + ' dari ' + state.files.length + '…');
        var result = await worker(file, i);
        outputs = outputs.concat(result);
        setProgress(5 + ((i + 1) / state.files.length) * 86, actionLabel + ' ' + (i + 1) + ' dari ' + state.files.length + '…');
      } catch (error) {
        state.lastFailures.push(file.name + ': ' + readableError(error));
      }
    }
    return outputs;
  }

  async function imageFileToCanvas(file, scale, fillWhite) {
    var image = await loadImage(file);
    var width = Math.max(1, Math.round(image.naturalWidth * scale));
    var height = Math.max(1, Math.round(image.naturalHeight * scale));
    if (width * height > MAX_IMAGE_PIXELS) throw new Error('Gambar terlalu besar. Pilih skala yang lebih kecil.');
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d', { alpha: !fillWhite });
    if (fillWhite) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('File gambar tidak dapat dibaca.')); };
      image.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }

  async function extractDocumentText(file) {
    if (getExtension(file.name) === 'txt') return file.text();
    if (!window.mammoth) throw new Error('Pembaca DOCX belum termuat. Pastikan koneksi internet tersedia lalu muat ulang halaman.');
    var result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  function makeTextPdf(text, originalName) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    var margin = 15;
    var width = doc.internal.pageSize.getWidth() - margin * 2;
    var height = doc.internal.pageSize.getHeight();
    var y = margin;
    doc.setProperties({ title: originalName, author: 'Ali Rafqi File Studio' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(stripExtension(originalName), margin, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    var lines = doc.splitTextToSize(text.replace(/\r\n/g, '\n'), width);
    lines.forEach(function (line) {
      if (y > height - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 4.8;
    });
    return doc.output('blob');
  }

  function parsePageRange(input, totalPages) {
    if (!input || !input.trim()) return Array.from({ length: totalPages }, function (_, index) { return index + 1; });
    var values = new Set();
    input.split(',').forEach(function (part) {
      var chunk = part.trim();
      if (!chunk) return;
      var match = chunk.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error('Format halaman tidak valid. Gunakan contoh: 1-3,5');
      var start = Number(match[1]);
      var end = Number(match[2] || match[1]);
      if (start < 1 || end < start || end > totalPages) throw new Error('Nomor halaman harus berada antara 1 dan ' + totalPages + '.');
      for (var i = start; i <= end; i += 1) values.add(i);
    });
    return Array.from(values).sort(function (a, b) { return a - b; });
  }

  function renderResults() {
    el['results-section'].hidden = !state.results.length;
    el['download-all'].hidden = state.results.length < 2;
    el['result-list'].replaceChildren();
    state.results.forEach(function (result, index) {
      var item = document.createElement('div');
      item.className = 'result-item';
      var icon = document.createElement('span');
      icon.className = 'result-icon';
      icon.textContent = '✓';
      var copy = document.createElement('div');
      copy.className = 'result-copy';
      var name = document.createElement('strong');
      name.textContent = result.filename;
      var detail = document.createElement('span');
      detail.textContent = formatBytes(result.blob.size) + ' · dari ' + result.sourceName;
      copy.append(name, detail);
      var download = document.createElement('button');
      download.className = 'download-one';
      download.type = 'button';
      download.dataset.downloadResult = String(index);
      download.textContent = 'Unduh';
      item.append(icon, copy, download);
      el['result-list'].append(item);
    });
  }

  async function downloadAllResults() {
    if (!state.results.length) return;
    if (state.results.length === 1) {
      downloadBlob(state.results[0].blob, state.results[0].filename);
      return;
    }
    if (!window.JSZip) {
      setStatus('ZIP belum tersedia. Unduh hasil satu per satu.', 'error');
      return;
    }
    try {
      setStatus('Menyiapkan ZIP hasil…');
      var zip = new window.JSZip();
      state.results.forEach(function (result) { zip.file(result.filename, result.blob); });
      var archive = await zip.generateAsync({ type: 'blob' }, function (metadata) { setProgress(metadata.percent, 'Menyiapkan ZIP hasil…'); });
      downloadBlob(archive, 'hasil-ali-rafqi-file-studio.zip');
      setStatus('ZIP berhasil dibuat.', 'success');
    } catch (error) {
      console.error(error);
      setStatus('ZIP tidak dapat dibuat. Unduh hasil satu per satu.', 'error');
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 1000);
  }

  async function saveHistory(outputs) {
    if (!state.currentUser) return;
    try {
      await idbPut('history', {
        profileId: state.currentUser.id, tool: state.selectedTool, inputCount: state.files.length,
        outputCount: outputs.length, outputNames: outputs.slice(0, 5).map(function (output) { return output.filename; }), createdAt: Date.now()
      });
    } catch (error) { console.warn('Riwayat tidak tersimpan.', error); }
  }

  async function refreshHistoryCount() {
    if (!state.currentUser) return;
    try {
      var entries = await idbGetAllByIndex('history', 'profileId', state.currentUser.id);
      el['history-count'].textContent = entries.length > 99 ? '99+' : String(entries.length);
    } catch (error) { console.warn(error); }
  }

  async function renderHistory() {
    el['history-list'].replaceChildren();
    try {
      var entries = await idbGetAllByIndex('history', 'profileId', state.currentUser.id);
      entries.sort(function (a, b) { return b.createdAt - a.createdAt; });
      if (!entries.length) {
        var empty = document.createElement('p');
        empty.className = 'empty-history';
        empty.textContent = 'Belum ada aktivitas. Hasil konversi berikutnya akan tercatat di sini.';
        el['history-list'].append(empty);
        return;
      }
      entries.slice(0, 50).forEach(function (entry) {
        var item = document.createElement('div');
        item.className = 'history-item';
        var icon = document.createElement('span');
        icon.className = 'history-item-icon';
        icon.textContent = historyIcon(entry.tool);
        var copy = document.createElement('div');
        copy.className = 'history-copy';
        var title = document.createElement('strong');
        title.textContent = historyTitle(entry.tool);
        var detail = document.createElement('span');
        detail.textContent = entry.inputCount + ' file masuk · ' + entry.outputCount + ' hasil';
        copy.append(title, detail);
        var time = document.createElement('time');
        time.className = 'history-time';
        time.dateTime = new Date(entry.createdAt).toISOString();
        time.textContent = formatDate(entry.createdAt);
        item.append(icon, copy, time);
        el['history-list'].append(item);
      });
    } catch (error) {
      console.error(error);
      var failed = document.createElement('p');
      failed.className = 'empty-history';
      failed.textContent = 'Riwayat tidak dapat dibaca saat ini.';
      el['history-list'].append(failed);
    }
  }

  async function clearHistory() {
    if (!state.currentUser || !window.confirm('Hapus semua riwayat aktivitas? File asli maupun hasil tidak ikut disimpan oleh riwayat.')) return;
    try {
      await idbDeleteByIndex('history', 'profileId', state.currentUser.id);
      await refreshHistoryCount();
      await renderHistory();
    } catch (error) { console.error(error); }
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function historyTitle(tool) { return (tools[tool] && tools[tool].title) || 'Aktivitas File Studio'; }
  function historyIcon(tool) { return tool === 'images' ? '⌑' : tool === 'pdf-images' ? '▧' : tool === 'images-pdf' ? '▤' : tool === 'merge-pdf' ? '⧉' : '≡'; }

  /* IndexedDB helpers */
  function getDatabase() {
    if (!databasePromise) databasePromise = openDatabase();
    return databasePromise;
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains('profiles')) {
          var profiles = db.createObjectStore('profiles', { keyPath: 'id' });
          profiles.createIndex('username', 'username', { unique: true });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          var sessions = db.createObjectStore('sessions', { keyPath: 'id' });
          sessions.createIndex('profileId', 'profileId', { unique: false });
          sessions.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('history')) {
          var history = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          history.createIndex('profileId', 'profileId', { unique: false });
          history.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Database lokal tidak dapat dibuka.')); };
      request.onblocked = function () { reject(new Error('Database sedang dipakai oleh tab lain.')); };
    });
  }

  async function getProfileByUsername(username) { return idbGetByIndex('profiles', 'username', username); }
  async function idbGet(storeName, key) { return idbRequest(storeName, 'readonly', function (store) { return store.get(key); }); }
  async function idbPut(storeName, value) { return idbRequest(storeName, 'readwrite', function (store) { return store.put(value); }); }
  async function idbDelete(storeName, key) { return idbRequest(storeName, 'readwrite', function (store) { return store.delete(key); }); }

  async function idbGetByIndex(storeName, indexName, value) {
    return idbRequest(storeName, 'readonly', function (store) { return store.index(indexName).get(value); });
  }

  async function idbGetAllByIndex(storeName, indexName, value) {
    return idbRequest(storeName, 'readonly', function (store) { return store.index(indexName).getAll(IDBKeyRange.only(value)); });
  }

  async function idbRequest(storeName, mode, operation) {
    var db = await getDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(storeName, mode);
      var request = operation(transaction.objectStore(storeName));
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Operasi database tidak berhasil.')); };
      transaction.onerror = function () { reject(transaction.error || new Error('Operasi database tidak berhasil.')); };
    });
  }

  async function idbDeleteByIndex(storeName, indexName, value) {
    var db = await getDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(storeName, 'readwrite');
      var request = transaction.objectStore(storeName).index(indexName).openCursor(IDBKeyRange.only(value));
      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error || new Error('Riwayat tidak dapat dihapus.')); };
    });
  }

  function deleteDatabase() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = function () { resolve(); };
      request.onerror = function () { reject(request.error || new Error('Database lokal tidak dapat dihapus.')); };
      request.onblocked = function () { reject(new Error('Database masih digunakan oleh tab lain.')); };
    });
  }

  /* Local credential helpers */
  async function derivePasswordVerifier(password, saltBase64, iterations) {
    var salt = base64ToBytes(saltBase64);
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: iterations || PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
    return bytesToBase64(new Uint8Array(bits));
  }

  async function sha256(value) {
    var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return bytesToBase64(new Uint8Array(digest));
  }

  function randomBase64(length) {
    var bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytesToBase64(bytes);
  }

  function bytesToBase64(bytes) {
    var output = '';
    for (var i = 0; i < bytes.length; i += 1) output += String.fromCharCode(bytes[i]);
    return btoa(output);
  }

  function base64ToBytes(value) {
    var raw = atob(value);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function constantTimeEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
    var difference = 0;
    for (var i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return difference === 0;
  }

  function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }

  /* General helpers */
  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return randomBase64(18).replace(/[+/=]/g, '');
  }

  function normaliseUsername(value) { return String(value || '').trim().toLowerCase(); }
  function getExtension(filename) { var parts = String(filename).split('.'); return parts.length > 1 ? parts.pop().toLowerCase() : ''; }
  function stripExtension(filename) { return String(filename).replace(/\.[^/.]+$/, '') || 'file'; }
  function extensionFromMime(mime) { return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : mime === 'application/pdf' ? 'pdf' : 'png'; }
  function cleanFileName(name) { return String(name).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 110) || 'hasil-ali-rafqi'; }
  function formatBytes(bytes) { if (!bytes) return '0 B'; var units = ['B', 'KB', 'MB', 'GB']; var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + ' ' + units[index]; }
  function formatDate(timestamp) { return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)); }
  function readableError(error) {
    var message = error && error.message ? error.message : String(error || 'Terjadi kesalahan.');
    if (/password|encrypted/i.test(message)) return 'PDF terlindungi kata sandi atau tidak dapat dibaca.';
    if (/Invalid PDF|InvalidPDFException/i.test(message)) return 'File ini bukan PDF yang valid atau file rusak.';
    if (/network|fetch|worker/i.test(message)) return 'Komponen PDF tidak dapat dimuat. Periksa koneksi, lalu muat ulang halaman.';
    return message;
  }
  function safeStorageGet(key, persistent) { try { return (persistent ? localStorage : sessionStorage).getItem(key); } catch (error) { return null; } }
  function safeStorageSet(key, value, persistent) { try { (persistent ? localStorage : sessionStorage).setItem(key, value); } catch (error) {} }
  function safeStorageRemove(key, persistent) { try { (persistent ? localStorage : sessionStorage).removeItem(key); } catch (error) {} }
}());
