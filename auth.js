// ----- HTML ELEMENTLERİ -----
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const googleSigninButton = document.getElementById('google-signin-button');
const errorMessage = document.getElementById('error-message');

// ----- FIREBASE REFERANSLARI -----
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ----- KULLANICI DURUMU KONTROLÜ -----
// Kullanıcı zaten giriş yapmışsa ana sayfaya yönlendir
auth.onAuthStateChanged(user => {
    if (user) {
        window.location.href = 'index.html';
    }
});

// ----- EVENT LISTENERS -----
loginButton.addEventListener('click', handleEmailLogin);
signupButton.addEventListener('click', handleEmailSignup);
googleSigninButton.addEventListener('click', handleGoogleSignin);

// ----- FONKSİYONLAR -----
async function handleEmailLogin() {
    try {
        errorMessage.textContent = '';
        await auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value);
        // onAuthStateChanged yönlendirmeyi yapacak
    } catch (error) {
        console.error("Giriş hatası:", error);
        errorMessage.textContent = getFriendlyErrorMessage(error.code);
    }
}

async function handleEmailSignup() {
    try {
        errorMessage.textContent = '';
        await auth.createUserWithEmailAndPassword(emailInput.value, passwordInput.value);
        // onAuthStateChanged yönlendirmeyi yapacak
    } catch (error) {
        console.error("Kayıt hatası:", error);
        errorMessage.textContent = getFriendlyErrorMessage(error.code);
    }
}

async function handleGoogleSignin() {
    try {
        errorMessage.textContent = '';
        await auth.signInWithPopup(googleProvider);
        // onAuthStateChanged yönlendirmeyi yapacak
    } catch (error) {
        console.error("Google ile giriş hatası:", error);
        errorMessage.textContent = getFriendlyErrorMessage(error.code);
    }
}

function getFriendlyErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/user-not-found':
            return 'Bu e-posta adresi ile kayıtlı bir kullanıcı bulunamadı.';
        case 'auth/wrong-password':
            return 'Hatalı şifre. Lütfen tekrar deneyin.';
        case 'auth/invalid-email':
            return 'Lütfen geçerli bir e-posta adresi girin.';
        case 'auth/email-already-in-use':
            return 'Bu e-posta adresi zaten kullanılıyor.';
        case 'auth/weak-password':
            return 'Şifreniz en az 6 karakter uzunluğunda olmalıdır.';
        default:
            return 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
    }
}