import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut, 
  updateProfile 
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// Konfigurasi Firebase Proyek Baru
const firebaseConfig = {
  apiKey: "AIzaSyCpgBQYP7HTJwYbrrIrJwJS60cWQmkRe5E",
  authDomain: "ali-web-convert-20eee.firebaseapp.com",
  projectId: "ali-web-convert-20eee",
  storageBucket: "ali-web-convert-20eee.firebasestorage.app",
  messagingSenderId: "314911929949",
  appId: "1:314911929949:web:3bf87702af8b2f15cb3fb4"
};

// Inisialisasi Firebase & Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Elemen UI
const authCard = document.getElementById("authCard");
const appContent = document.getElementById("appContent");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authForm = document.getElementById("authForm");
const nameGroup = document.getElementById("nameGroup");
const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const submitBtn = document.getElementById("submitBtn");
const toggleAuthMode = document.getElementById("toggleAuthMode");
const logoutBtn = document.getElementById("logoutBtn");
const userDisplayName = document.getElementById("userDisplayName");

let isSignUpMode = false;

// Fungsi Switch Mode (Login / Register)
function setAuthMode(signUp) {
  isSignUpMode = signUp;
  if (isSignUpMode) {
    if (authTitle) authTitle.textContent = "Buat Profil Baru";
    if (authSubtitle) authSubtitle.textContent = "Daftarkan akun untuk menggunakan Ali Rafqi File Studio.";
    if (nameGroup) nameGroup.style.display = "block";
    if (submitBtn) submitBtn.textContent = "Daftar & Masuk";
    if (toggleAuthMode) toggleAuthMode.innerHTML = 'Sudah punya profil? <a href="#" id="switchLink">Masuk</a>';
  } else {
    if (authTitle) authTitle.textContent = "Masuk ke Studio";
    if (authSubtitle) authSubtitle.textContent = "Gunakan profil yang sudah ada di aplikasi ini.";
    if (nameGroup) nameGroup.style.display = "none";
    if (submitBtn) submitBtn.textContent = "Masuk ke Studio";
    if (toggleAuthMode) toggleAuthMode.innerHTML = 'Belum punya profil lokal? <a href="#" id="switchLink">Buat profil</a>';
  }
}

// Event Toggle Mode
if (toggleAuthMode) {
  toggleAuthMode.addEventListener("click", (e) => {
    if (e.target && e.target.id === "switchLink") {
      e.preventDefault();
      setAuthMode(!isSignUpMode);
    }
  });
}

// Submit Form (Daftar / Login)
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput ? nameInput.value.trim() : "";

    try {
      if (isSignUpMode) {
        if (!name) {
          alert("Silakan masukkan nama pengguna.");
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        alert("Akun berhasil dibuat!");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      alert("Terjadi kesalahan: " + error.message);
    }
  });
}

// Handler Logout
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth);
  });
}

// Monitor Status Autentikasi
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (authCard) authCard.style.display = "none";
    if (appContent) appContent.style.display = "block";
    if (userDisplayName) userDisplayName.textContent = user.displayName || user.email;
  } else {
    if (authCard) authCard.style.display = "block";
    if (appContent) appContent.style.display = "none";
    setAuthMode(false);
  }
});
