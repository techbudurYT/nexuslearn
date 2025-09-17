// ----- HTML ELEMENTLERİ -----
const userDisplayName = document.getElementById('user-display-name');
const logoutButton = document.getElementById('logout-button');
const profileButton = document.getElementById('profile-button');
const toastContainer = document.getElementById('toast-container');

// Görünümler (Views)
const dashboardView = document.getElementById('dashboard-view');
const generatorView = document.getElementById('generator-view');
const profileView = document.getElementById('profile-view');

// Dashboard Elementleri
const statsWidget = document.getElementById('stats-widget');
const categoryFilter = document.getElementById('category-filter');
const newPlanButton = document.getElementById('new-plan-button');
const savedPlansContainer = document.getElementById('saved-plans-container');

// Oluşturucu Elementleri
const topicInput = document.getElementById('topic-input');
const categoryInput = document.getElementById('category-input');
const fetchButton = document.getElementById('fetch-button');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const resultsContainer = document.getElementById('results-container');
const videoContainer = document.getElementById('video-container');
const learningPlanChecklist = document.getElementById('learning-plan-checklist');
const newStepInput = document.getElementById('new-step-input');
const addStepButton = document.getElementById('add-step-button');
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
let currentVideoId = null;
let currentPlanId = null; // Düzenleme modunda plan ID'sini tutar

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
    document.body.style.display = 'block';
}

function showView(view) {
    dashboardView.classList.add('hidden');
    generatorView.classList.add('hidden');
    profileView.classList.add('hidden');
    view.classList.remove('hidden');
}

// ----- EVENT LISTENERS -----
logoutButton.addEventListener('click', async () => await auth.signOut());
newPlanButton.addEventListener('click', () => {
    currentPlanId = null; // Yeni plan moduna geç
    clearGeneratorForm();
    showView(generatorView);
});
profileButton.addEventListener('click', () => showView(profileView));
fetchButton.addEventListener('click', handleFetchRequest);
backToDashboardButton.addEventListener('click', () => showView(dashboardView));
backToDashboardFromProfile.addEventListener('click', () => showView(dashboardView));
savePlanButton.addEventListener('click', saveCurrentPlan);
addStepButton.addEventListener('click', addChecklistStep);
categoryFilter.addEventListener('change', () => loadSavedPlans(categoryFilter.value));
updateDisplayNameButton.addEventListener('click', handleUpdateDisplayName);
updatePasswordButton.addEventListener('click', handleUpdatePassword);
deleteAccountButton.addEventListener('click', handleDeleteAccount);

// ----- ANA FONKSİYONLAR -----
async function handleFetchRequest() {
    const userQuery = topicInput.value.trim();
    if (!userQuery) return showToast("Lütfen bir konu başlığı girin.", "error");
    if (typeof YOUTUBE_API_KEY === 'undefined' || YOUTUBE_API_KEY === 'SENİN_YOUTUBE_API_ANAHTARIN') {
        return showToast("Hata: Geçerli bir YouTube API anahtarı bulunamadı.", "error");
    }

    resultsContainer.classList.add('hidden');
    statusIndicator.style.display = 'block';
    updateStatus("En uygun ders videosu YouTube'da aranıyor...");

    try {
        const videoId = await fetchBestVideo(userQuery);
        currentVideoId = videoId;
        videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        statusIndicator.style.display = 'none';
    }
}

async function saveCurrentPlan() {
    if (!currentUser || !currentVideoId) {
        return showToast("Kaydedilecek bir video veya plan bulunamadı.", "error");
    }

    const planData = {
        topic: topicInput.value.trim(),
        category: categoryInput.value.trim() || 'Genel',
        videoId: currentVideoId,
        learningPlan: getChecklistData(),
        keyConcepts: keyConceptsInput.value.trim(),
        openQuestions: openQuestionsInput.value.trim(),
        isCompleted: false, // Varsayılan olarak tamamlanmadı
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (!planData.topic) return showToast("Konu başlığı boş olamaz.", "error");

    try {
        savePlanButton.disabled = true;
        savePlanButton.textContent = "Kaydediliyor...";
        
        const planRef = db.collection('users').doc(currentUser.uid).collection('plans');

        if (currentPlanId) { // Düzenleme modu
            await planRef.doc(currentPlanId).update(planData);
            showToast(`"${planData.topic}" planı başarıyla güncellendi!`);
        } else { // Yeni plan modu
            planData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await planRef.add(planData);
            showToast(`"${planData.topic}" planı başarıyla kaydedildi!`);
        }
        
        clearGeneratorForm();
        loadSavedPlans();
        showView(dashboardView);

    } catch (error) {
        showToast("Plan kaydedilirken bir hata oluştu.", "error");
        console.error("Plan kaydetme hatası: ", error);
    } finally {
        savePlanButton.disabled = false;
        savePlanButton.textContent = "Planı Kaydet";
    }
}

async function loadSavedPlans(filterCategory = 'all') {
    if (!currentUser) return;
    savedPlansContainer.innerHTML = '<div class="spinner"></div>';
    
    const snapshot = await db.collection('users').doc(currentUser.uid).collection('plans').orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
        statsWidget.innerHTML = '<h3>İstatistikler</h3><p>Henüz hiç öğrenme paketi oluşturmadınız.</p>';
        savedPlansContainer.innerHTML = '';
        return;
    }

    const allPlans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    updateStatsAndCategories(allPlans);

    const filteredPlans = filterCategory === 'all' 
        ? allPlans 
        : allPlans.filter(plan => plan.category === filterCategory);

    savedPlansContainer.innerHTML = '';
    if (filteredPlans.length === 0) {
        savedPlansContainer.innerHTML = '<p>Bu kategoride kaydedilmiş bir paket bulunamadı.</p>';
        return;
    }

    filteredPlans.forEach(plan => {
        const planElement = document.createElement('div');
        planElement.className = `saved-plan-card ${plan.isCompleted ? 'completed' : ''}`;
        planElement.innerHTML = `
            <div>
                <span class="plan-category">${plan.category}</span>
                <h3>${plan.topic}</h3>
                <p>Oluşturulma: ${plan.createdAt ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : 'Bilinmiyor'}</p>
            </div>
            <div class="plan-actions">
                <button class="toggle-complete-btn">${plan.isCompleted ? 'Geri Al' : 'Tamamlandı İşaretle'}</button>
                <button class="view-plan-btn">Düzenle</button>
                <button class="delete-plan-btn danger-button">Sil</button>
            </div>
        `;
        
        planElement.querySelector('.view-plan-btn').addEventListener('click', () => {
            renderPlanForEditing(plan);
        });
        planElement.querySelector('.toggle-complete-btn').addEventListener('click', async () => {
            await db.collection('users').doc(currentUser.uid).collection('plans').doc(plan.id).update({ isCompleted: !plan.isCompleted });
            loadSavedPlans(categoryFilter.value);
        });
        planElement.querySelector('.delete-plan-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`"${plan.topic}" planını silmek istediğinizden emin misiniz?`)) {
                await db.collection('users').doc(currentUser.uid).collection('plans').doc(plan.id).delete();
                loadSavedPlans(categoryFilter.value);
                showToast("Plan başarıyla silindi.");
            }
        });
        savedPlansContainer.appendChild(planElement);
    });
}

// ----- YARDIMCI FONKSİYONLAR -----
function updateStatsAndCategories(allPlans) {
    const totalPlans = allPlans.length;
    const completedPlans = allPlans.filter(p => p.isCompleted).length;
    statsWidget.innerHTML = `<h3>İstatistikler</h3><p><strong>${totalPlans}</strong> Toplam Paket</p><p><strong>${completedPlans}</strong> Tamamlanan Paket</p>`;

    const categories = [...new Set(allPlans.map(p => p.category).filter(Boolean))];
    const currentFilter = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">Tümü</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryFilter.appendChild(option);
    });
    categoryFilter.value = currentFilter;
}

function addChecklistStep(text = '') {
    const stepText = (typeof text === 'string' ? text : newStepInput.value).trim();
    if (!stepText) return;

    const li = document.createElement('li');
    li.innerHTML = `
        <input type="checkbox">
        <span contenteditable="true">${stepText}</span>
        <button class="delete-step-btn">&times;</button>
    `;
    li.querySelector('.delete-step-btn').addEventListener('click', () => li.remove());
    learningPlanChecklist.appendChild(li);
    if (typeof text !== 'string') newStepInput.value = '';
}

function getChecklistData() {
    const items = [];
    learningPlanChecklist.querySelectorAll('li').forEach(li => {
        items.push({
            text: li.querySelector('span').textContent,
            completed: li.querySelector('input').checked
        });
    });
    return items;
}

function renderPlanForEditing(plan) {
    currentPlanId = plan.id;
    currentVideoId = plan.videoId;
    topicInput.value = plan.topic;
    categoryInput.value = plan.category;
    videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${plan.videoId}" frameborder="0" allowfullscreen></iframe>`;
    
    learningPlanChecklist.innerHTML = '';
    if (plan.learningPlan && plan.learningPlan.forEach) {
        plan.learningPlan.forEach(step => {
            addChecklistStep(step.text);
            if (step.completed) {
                learningPlanChecklist.lastChild.querySelector('input').checked = true;
            }
        });
    }
    
    keyConceptsInput.value = plan.keyConcepts || '';
    openQuestionsInput.value = plan.openQuestions || '';
    
    resultsContainer.classList.remove('hidden');
    showView(generatorView);
}

function clearGeneratorForm() {
    topicInput.value = '';
    categoryInput.value = '';
    resultsContainer.classList.add('hidden');
    learningPlanChecklist.innerHTML = '';
    keyConceptsInput.value = '';
    openQuestionsInput.value = '';
    currentPlanId = null;
    currentVideoId = null;
}

async function fetchBestVideo(query) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("YouTube API hatası. Anahtarınızı veya kotanızı kontrol edin.");
    const data = await response.json();
    if (!data.items || data.items.length === 0) throw new Error(`"${query}" araması için video bulunamadı.`);
    return data.items[0].id.videoId;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }, 100);
}

// ----- PROFİL YÖNETİMİ -----
async function handleUpdateDisplayName() {
    const newName = displayNameInput.value.trim();
    if (!newName) return showToast("Görünen ad boş olamaz.", "error");
    try {
        await currentUser.updateProfile({ displayName: newName });
        setupUI(currentUser);
        showToast("Görünen ad başarıyla güncellendi.");
    } catch (error) {
        showToast("İsim güncellenirken bir hata oluştu.", "error");
    }
}

async function handleUpdatePassword() {
    const newPassword = newPasswordInput.value;
    if (newPassword.length < 6) return showToast("Yeni şifre en az 6 karakter olmalıdır.", "error");
    if (newPassword !== confirmPasswordInput.value) return showToast("Şifreler uyuşmuyor.", "error");

    try {
        await currentUser.updatePassword(newPassword);
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        showToast("Şifreniz başarıyla güncellendi.");
    } catch (error) {
        showToast("Şifre güncellenemedi. Tekrar giriş yapmanız gerekebilir.", "error");
    }
}

async function handleDeleteAccount() {
    const confirmation = prompt("Hesabınızı silmek için 'SİL' yazın.");
    if (confirmation === 'SİL') {
        try {
            await currentUser.delete();
            showToast("Hesabınız kalıcı olarak silindi.", "success");
        } catch (error) {
            showToast("Hesap silinemedi. Tekrar giriş yapmanız gerekebilir.", "error");
        }
    } else {
        showToast("Onay metni yanlış, işlem iptal edildi.", "error");
    }
}

function updateStatus(message) {
    statusText.textContent = message;
}
