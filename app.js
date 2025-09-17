// ----- HTML ELEMENTLERİ -----
const userDisplayName = document.getElementById('user-display-name');
const logoutButton = document.getElementById('logout-button');
const profileButton = document.getElementById('profile-button');

// Görünümler (Views)
const dashboardView = document.getElementById('dashboard-view');
const generatorView = document.getElementById('generator-view');
const profileView = document.getElementById('profile-view');

// Dashboard Elementleri
const newPlanButton = document.getElementById('new-plan-button');
const savedPlansContainer = document.getElementById('saved-plans-container');

// Oluşturucu Elementleri
const topicInput = document.getElementById('topic-input');
const fetchButton = document.getElementById('fetch-button');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const resultsContainer = document.getElementById('results-container');
const videoContainer = document.getElementById('video-container');
const learningPlanInput = document.getElementById('learning-plan-input');
const keyConceptsInput = document.getElementById('key-concepts-input');
const openQuestionsInput = document.getElementById('open-questions-input');
const backToDashboardButton = document.getElementById('back-to-dashboard-button');
const savePlanButton = document.getElementById('save-plan-button');

// Profil Elementleri
const backToDashboardFromProfile = document.getElementById('back-to-dashboard-from-profile');
const displayNameInput = document.getElementById('display-name-input');
const updateDisplayNameButton = document.getElementById('update-display-name-button');
const newPasswordInput = document.getElementById('new-password-input');
const confirmPasswordInput = document.getElementById('confirm-password-input');
const updatePasswordButton = document.getElementById('update-password-button');
const deleteAccountButton = document.getElementById('delete-account-button');


// ----- FIREBASE REFERANSLARI -----
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser;
let currentVideoId = null; // Sadece bulunan videonun ID'sini tutar

// ----- UYGULAMA BAŞLANGICI -----
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        setupUI(user);
        loadSavedPlans();
    } else {
        window.location.href = 'login.html';
    }
});

function setupUI(user) {
    const name = user.displayName || user.email.split('@')[0];
    userDisplayName.textContent = `Hoş Geldin, ${name}`;
    displayNameInput.value = user.displayName || '';
    document.body.style.display = 'block'; // Sayfayı göster
}

function showView(view) {
    dashboardView.classList.add('hidden');
    generatorView.classList.add('hidden');
    profileView.classList.add('hidden');
    view.classList.remove('hidden');
}

// ----- EVENT LISTENERS -----
logoutButton.addEventListener('click', async () => await auth.signOut());
newPlanButton.addEventListener('click', () => showView(generatorView));
profileButton.addEventListener('click', () => showView(profileView));
fetchButton.addEventListener('click', handleFetchRequest);
backToDashboardButton.addEventListener('click', () => showView(dashboardView));
backToDashboardFromProfile.addEventListener('click', () => showView(dashboardView));
savePlanButton.addEventListener('click', saveCurrentPlan);
updateDisplayNameButton.addEventListener('click', handleUpdateDisplayName);
updatePasswordButton.addEventListener('click', handleUpdatePassword);
deleteAccountButton.addEventListener('click', handleDeleteAccount);

// ----- ANA FONKSİYONLAR -----
async function handleFetchRequest() {
    const userQuery = topicInput.value.trim();
    if (!userQuery) {
        alert("Lütfen bir konu başlığı girin.");
        return;
    }
    if (typeof YOUTUBE_API_KEY === 'undefined' || YOUTUBE_API_KEY === 'SENİN_YOUTUBE_API_ANAHTARIN') {
        alert("Hata: config.js dosyasında geçerli bir YOUTUBE_API_KEY bulunamadı.");
        return;
    }

    resultsContainer.classList.add('hidden');
    statusIndicator.style.display = 'block';
    updateStatus("En uygun ders videosu YouTube'da aranıyor...");

    try {
        const videoId = await fetchBestVideo(userQuery);
        currentVideoId = videoId;
        renderVideoAndInputs(videoId);

        statusIndicator.style.display = 'none';
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        statusIndicator.style.display = 'none';
        alert("Bir hata oluştu: " + error.message);
        console.error(error);
    }
}

async function saveCurrentPlan() {
    if (!currentUser || !currentVideoId) {
        alert("Kaydedilecek bir video veya plan bulunamadı.");
        return;
    }

    const planData = {
        topic: topicInput.value.trim(),
        videoId: currentVideoId,
        learningPlan: learningPlanInput.value.trim(),
        keyConcepts: keyConceptsInput.value.trim(),
        openQuestions: openQuestionsInput.value.trim(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!planData.topic) {
        alert("Lütfen bir konu başlığı girin.");
        return;
    }

    try {
        savePlanButton.disabled = true;
        savePlanButton.textContent = "Kaydediliyor...";
        await db.collection('users').doc(currentUser.uid).collection('plans').add(planData);
        alert(`"${planData.topic}" konulu plan başarıyla kaydedildi!`);
        
        // Formu temizle ve panele dön
        topicInput.value = '';
        resultsContainer.classList.add('hidden');
        loadSavedPlans();
        showView(dashboardView);

    } catch (error) {
        console.error("Plan kaydetme hatası: ", error);
        alert("Plan kaydedilirken bir hata oluştu.");
    } finally {
        savePlanButton.disabled = false;
        savePlanButton.textContent = "Planı Kaydet";
    }
}

async function loadSavedPlans() {
    if (!currentUser) return;
    savedPlansContainer.innerHTML = '<div class="spinner"></div>';
    
    const snapshot = await db.collection('users').doc(currentUser.uid).collection('plans').orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
        savedPlansContainer.innerHTML = '<p>Henüz kaydedilmiş bir öğrenme paketiniz yok.</p>';
        return;
    }

    savedPlansContainer.innerHTML = '';
    snapshot.forEach(doc => {
        const plan = doc.data();
        const planElement = document.createElement('div');
        planElement.className = 'saved-plan-card';
        planElement.innerHTML = `
            <div>
                <h3>${plan.topic}</h3>
                <p>Oluşturulma: ${plan.createdAt ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : 'Bilinmiyor'}</p>
            </div>
            <div>
                <button class="view-plan-btn">Görüntüle</button>
                <button class="delete-plan-btn danger-button">Sil</button>
            </div>
        `;
        
        planElement.querySelector('.view-plan-btn').addEventListener('click', () => {
            topicInput.value = plan.topic;
            renderVideoAndInputs(plan.videoId, plan);
            resultsContainer.classList.remove('hidden');
            showView(generatorView);
        });

        planElement.querySelector('.delete-plan-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`"${plan.topic}" planını silmek istediğinizden emin misiniz?`)) {
                await db.collection('users').doc(currentUser.uid).collection('plans').doc(doc.id).delete();
                loadSavedPlans(); // Listeyi yenile
            }
        });

        savedPlansContainer.appendChild(planElement);
    });
}

// ----- YOUTUBE ETKİLEŞİMİ -----
async function fetchBestVideo(query) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("YouTube API hatası. Anahtarınızı veya kotanızı kontrol edin.");
    const data = await response.json();
    if (!data.items || data.items.length === 0) throw new Error(`"${query}" araması için video bulunamadı.`);
    return data.items[0].id.videoId;
}

// ----- PROFİL YÖNETİMİ -----
async function handleUpdateDisplayName() {
    const newName = displayNameInput.value.trim();
    if (!newName) {
        alert("Görünen ad boş olamaz.");
        return;
    }
    try {
        await currentUser.updateProfile({ displayName: newName });
        setupUI(currentUser); // Header'ı güncelle
        alert("Görünen ad başarıyla güncellendi.");
    } catch (error) {
        alert("İsim güncellenirken bir hata oluştu: " + error.message);
    }
}

async function handleUpdatePassword() {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (newPassword.length < 6) {
        alert("Yeni şifre en az 6 karakter olmalıdır.");
        return;
    }
    if (newPassword !== confirmPassword) {
        alert("Şifreler uyuşmuyor.");
        return;
    }

    try {
        await currentUser.updatePassword(newPassword);
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        alert("Şifreniz başarıyla güncellendi.");
    } catch (error) {
        alert("Şifre güncellenirken bir hata oluştu. Bu işlem için yakın zamanda tekrar giriş yapmanız gerekebilir.\n\n" + error.message);
    }
}

async function handleDeleteAccount() {
    const confirmation = prompt("Hesabınızı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz. Onaylamak için 'SİL' yazın.");
    if (confirmation === 'SİL') {
        try {
            // Firestore'daki kullanıcı verilerini silmek daha kapsamlı bir çözüm gerektirir (Cloud Function en iyisidir).
            // Şimdilik sadece Auth kaydını siliyoruz.
            await currentUser.delete();
            alert("Hesabınız kalıcı olarak silindi.");
            // onAuthStateChanged kullanıcıyı login sayfasına yönlendirecektir.
        } catch (error) {
            alert("Hesap silinirken bir hata oluştu. Bu işlem için yakın zamanda tekrar giriş yapmanız gerekebilir.\n\n" + error.message);
        }
    } else {
        alert("Onay metni yanlış olduğu için işlem iptal edildi.");
    }
}

// ----- ARAYÜZ GÜNCELLEME -----
function renderVideoAndInputs(videoId, plan = {}) {
    videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
    learningPlanInput.value = plan.learningPlan || '';
    keyConceptsInput.value = plan.keyConcepts || '';
    openQuestionsInput.value = plan.openQuestions || '';
}

function updateStatus(message) {
    statusText.textContent = message;
}