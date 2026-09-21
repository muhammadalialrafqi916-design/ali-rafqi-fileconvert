(function () {
  'use strict';

  const DB_NAME = 'AliRafqiFileStudio';
  const DB_VERSION = 1;
  const PBKDF2_ITERATIONS = 100000;
  const SESSION_KEY = 'ar_studio_session';

  let db;

  // Inisialisasi Database IndexedDB
  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('users')) {
          database.createObjectStore('users', { keyPath: 'username' });
        }
      };
    });
  }

  // Fungsi Hash Password menggunakan Web Crypto API (PBKDF2)
  async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Ambal User dari IndexedDB
  function getUser(username) {
    return new Promise((resolve) => {
      const tx = db.transaction('users', 'readonly');
      const store = tx.objectStore('users');
      const req = store.get(username.toLowerCase());
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  // Simpan User Baru ke IndexedDB
  function saveUser(userObj) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('users', 'readwrite');
      const store = tx.objectStore('users');
      const req = store.put(userObj);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Main Init
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await initDB();
      setupAuthUI();
      checkSession();
    } catch (err) {
      console.error('Inisialisasi gagal:', err);
    }
  });

  // Logika Interaksi UI Autentikasi
  function setupAuthUI() {
    const authScreen = document.getElementById('auth-screen');
    const studioShell = document.getElementById('studio-shell');
    const authForm = document.getElementById('auth-form');
    const authHeading = document.getElementById('auth-heading');
    const authDescription = document.getElementById('auth-description');
    const authSubmitLabel = document.getElementById('auth-submit-label');
    const switchAuthModeBtn = document.getElementById('switch-auth-mode');
    const switchCopy = document.getElementById('switch-copy');
    const nameField = document.querySelector('.auth-name-field');
    const authMessage = document.getElementById('auth-message');
    const showPasswordBtn = document.querySelector('.show-password');
    const passwordInput = document.getElementById('password');
    const logoutBtn = document.getElementById('logout-button');

    let isSignUpMode = false;

    // Toggle Tampil Password
    if (showPasswordBtn && passwordInput) {
      showPasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        showPasswordBtn.textContent = isPassword ? 'Sembunyi' : 'Tampil';
      });
    }

    // Toggle Mode (Masuk / Buat Profil)
    if (switchAuthModeBtn) {
      switchAuthModeBtn.addEventListener('click', () => {
        isSignUpMode = !isSignUpMode;
        authMessage.textContent = '';
        if (isSignUpMode) {
          authHeading.textContent = 'Buat Profil Lokal';
          authDescription.textContent = 'Buat profil baru yang tersimpan aman di browser ini.';
          authSubmitLabel.textContent = 'Buat & Masuk Studio';
          switchCopy.textContent = 'Sudah punya profil lokal?';
          switchAuthModeBtn.textContent = 'Masuk';
          if (nameField) nameField.hidden = false;
        } else {
          authHeading.textContent = 'Masuk ke Studio';
          authDescription.textContent = 'Gunakan profil lokal yang sudah ada di perangkat ini.';
          authSubmitLabel.textContent = 'Masuk ke Studio';
          switchCopy.textContent = 'Belum punya profil lokal?';
          switchAuthModeBtn.textContent = 'Buat profil';
          if (nameField) nameField.hidden = true;
        }
      });
    }

    // Handle Submit Form
    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        authMessage.textContent = '';

        const usernameInput = document.getElementById('username').value.trim().toLowerCase();
        const passwordVal = passwordInput.value;
        const displayNameInput = document.getElementById('display-name').value.trim();

        if (!usernameInput || !passwordVal) {
          authMessage.textContent = 'Silakan isi nama pengguna dan kata sandi.';
          return;
        }

        try {
          if (isSignUpMode) {
            // REGISTRASI
            const existingUser = await getUser(usernameInput);
            if (existingUser) {
              authMessage.textContent = 'Nama pengguna sudah digunakan. Silakan pilih nama lain.';
              return;
            }

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const passwordHash = await hashPassword(passwordVal, salt);

            const newUser = {
              username: usernameInput,
              displayName: displayNameInput || usernameInput,
              salt: Array.from(salt),
              passwordHash: passwordHash
            };

            await saveUser(newUser);
            enterStudio(newUser);
          } else {
            // LOGIN
            const user = await getUser(usernameInput);
            if (!user) {
              authMessage.textContent = 'Profil tidak ditemukan. Buat profil terlebih dahulu.';
              return;
            }

            const salt = new Uint8Array(user.salt);
            const inputHash = await hashPassword(passwordVal, salt);

            if (inputHash === user.passwordHash) {
              enterStudio(user);
            } else {
              authMessage.textContent = 'Kata sandi salah. Silakan coba lagi.';
            }
          }
        } catch (err) {
          console.error(err);
          authMessage.textContent = 'Terjadi kesalahan sistem lokal.';
        }
      });
    }

    // Handle Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(SESSION_KEY);
        if (studioShell) studioShell.hidden = true;
        if (authScreen) authScreen.hidden = false;
        document.getElementById('auth-form').reset();
      });
    }
  }

  // Masuk Halaman Studio Workspace
  function enterStudio(user) {
    const authScreen = document.getElementById('auth-screen');
    const studioShell = document.getElementById('studio-shell');
    const welcomeName = document.getElementById('welcome-name');
    const profileName = document.getElementById('profile-name');
    const profileAvatar = document.getElementById('profile-avatar');

    if (authScreen) authScreen.hidden = true;
    if (studioShell) studioShell.hidden = false;

    const name = user.displayName || user.username;
    if (welcomeName) welcomeName.textContent = name;
    if (profileName) profileName.textContent = name;
    if (profileAvatar) profileAvatar.textContent = name.charAt(0).toUpperCase();

    // Simpan Sesi Lokal
    const rememberDevice = document.getElementById('remember-device');
    if (rememberDevice && rememberDevice.checked) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    }
  }

  // Cek Sesi yang Tersimpan
  function checkSession() {
    const sessionData = localStorage.getItem(SESSION_KEY);
    if (sessionData) {
      try {
        const user = JSON.parse(sessionData);
        enterStudio(user);
      } catch (e) {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }
})();
