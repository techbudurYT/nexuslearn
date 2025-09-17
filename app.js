// ----- HTML ELEMENTLERİ -----
const toastContainer = document.getElementById('toast-container');
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');
const userDisplayName = document.getElementById('user-display-name');

// Dashboard
const statsWidget = document.getElementById('stats-widget');
const categoryFilter = document.getElementById('category-filter');
const savedPlansContainer = document.getElementById('saved-plans-container');
const categoryChartCanvas = document.getElementById('categoryChart');

// Generator
const topicInput = document.getElementById('topic-input');
const categoryInput = document.getElementById('category-input');
const fetchButton = document.getElementById('fetch-button');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const resultsContainer = document.getElementById('results-container');
const videoContainer = document.getElementById('video-container');
const aiSummaryContainer = document.getElementById('ai-summary-container');
const learningPlanChecklist = document.getElementById('learning-plan-checklist');
const newStepInput = document.getElementById('new-step-input');
const addStepButton = document.getElementById('add-step-button');
const keyConceptsInput = document.getElementById('key-concepts-input');
const savePlanButton = document.getElementById('save-plan-button');

// Profil
const displayNameInput = document.getElementById('display-name-input');
const updateDisplayNameButton = document.getElementById('update-display-name-button');
const newPasswordInput = document.getElementById('new-password-input');
const updatePasswordButton = document.getElementById('update-password-button');
const deleteAccountButton = document.getElementById('delete-account-button');

// Pomodoro
const pomoTimerDisplay = document.getElementById('pomodoro-timer');
const pomoStartPauseBtn = document.getElementById('pomo-start-pause');
const pomoResetBtn = document.getElementById('pomo-reset');

// Çıkış
const logoutButton = document.getElementById('logout-button');

// ----- UYGULAMA STATE'İ -----
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser;
let currentPlanId = null;
let currentVideoId = null;
let categoryChart = null;

// Pomodoro State'i
let pomoInterval;
let pomoMinutes = 25;
let pomoSeconds = 0;
let isPomoPaused = true;

// ----- UYGULAMA BAŞLANGICI -----
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        setupUI(user);
        loadSavedPlans();
        setupEventListeners();
    } else {
        window.location.href = 'login.html';
    }
});

function setupUI(user) {
    const name = user.displayName || user.email.split('@')[0];
    userDisplayName.textContent = `Hoş Geldin, ${name}`;
    displayNameInput.value = user.displayName || '';
}

function setupEventListeners() {
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = link.getAttribute('data-view');
            
            if (viewId === 'generator-view') {
                currentPlanId = null;
                clearGeneratorForm();
            }

            views.forEach(view => view.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            
            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');
        });
    });
    
    fetchButton.addEventListener('click', handleFetchRequest);
    savePlanButton.addEventListener('click', saveCurrentPlan);
    addStepButton.addEventListener('click', addChecklistStep);
    categoryFilter.addEventListener('change', () => loadSavedPlans(categoryFilter.value));
    updateDisplayNameButton.addEventListener('click', handleUpdateDisplayName);
    updatePasswordButton.addEventListener('click', handleUpdatePassword);
    deleteAccountButton.addEventListener('click', handleDeleteAccount);
    pomoStartPauseBtn.addEventListener('click', togglePomodoro);
    pomoResetBtn.addEventListener('click', resetPomodoro);
    logoutButton.addEventListener('click', async () => await auth.signOut());
}

// ----- ANA FONKSİYONLAR -----
async function handleFetchRequest() {
    const userQuery = topicInput.value.trim();
    if (!userQuery) return showToast("Lütfen bir konu başlığı girin.", "error");

    resultsContainer.classList.add('hidden');
    statusIndicator.style.display = 'block';
    updateStatus("Video aranıyor...");

    try {
        const videoData = await fetchBestVideo(userQuery);
        currentVideoId = videoData.id;
        videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoData.id}" frameborder="0" allowfullscreen></iframe>`;
        
        updateStatus("AI video özeti oluşturuyor (simülasyon)...");
        aiSummaryContainer.innerHTML = `<p><strong>${videoData.title}</strong> başlıklı video analiz ediliyor... Bu özellik şu anda geliştirme aşamasındadır ve yakında videonun anahtar noktalarını burada özetleyecektir.</p>`;
        
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        statusIndicator.style.display = 'none';
    }
}

async function saveCurrentPlan() {
    if (!currentUser || !currentVideoId) return showToast("Kaydedilecek bir video bulunamadı.", "error");

    const planData = {
        topic: topicInput.value.trim(),
        category: categoryInput.value.trim() || 'Genel',
        videoId: currentVideoId,
        learningPlan: getChecklistData(),
        keyConcepts: keyConceptsInput.value.trim(),
        aiSummary: aiSummaryContainer.innerHTML, // Simüle edilmiş özeti kaydet
        isCompleted: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (!planData.topic) return showToast("Konu başlığı boş olamaz.", "error");

    try {
        savePlanButton.disabled = true;
        const planRef = db.collection('users').doc(currentUser.uid).collection('plans');

        if (currentPlanId) {
            await planRef.doc(currentPlanId).update(planData);
            showToast(`"${planData.topic}" planı güncellendi!`);
        } else {
            planData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await planRef.add(planData);
            showToast(`"${planData.topic}" planı kaydedildi!`);
        }
        
        loadSavedPlans();
        document.querySelector('.nav-link[data-view="dashboard-view"]').click();

    } catch (error) {
        showToast("Plan kaydedilirken bir hata oluştu.", "error");
    } finally {
        savePlanButton.disabled = false;
    }
}

async function loadSavedPlans(filterCategory = 'all') {
    if (!currentUser) return;
    savedPlansContainer.innerHTML = '<div class="spinner"></div>';
    
    const snapshot = await db.collection('users').doc(currentUser.uid).collection('plans').orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
        statsWidget.innerHTML = '<h3>İstatistikler</h3><p>Henüz paket oluşturulmadı.</p>';
        savedPlansContainer.innerHTML = '';
        if (categoryChart) categoryChart.destroy();
        return;
    }

    const allPlans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateStatsAndCategories(allPlans);

    const filteredPlans = filterCategory === 'all' ? allPlans : allPlans.filter(plan => plan.category === filterCategory);

    savedPlansContainer.innerHTML = '';
    if (filteredPlans.length === 0) {
        savedPlansContainer.innerHTML = '<p class="empty-state">Bu kategoride paket bulunamadı.</p>';
        return;
    }

    filteredPlans.forEach(plan => {
        const planElement = document.createElement('div');
        planElement.className = `plan-card ${plan.isCompleted ? 'completed' : ''}`;
        planElement.innerHTML = `
            <span class="plan-category">${plan.category}</span>
            <h4>${plan.topic}</h4>
            <div class="plan-actions">
                <button class="toggle-complete-btn">${plan.isCompleted ? 'Geri Al' : 'Tamamla'}</button>
                <button class="view-plan-btn">Düzenle</button>
                <button class="delete-plan-btn danger-button"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        planElement.querySelector('.view-plan-btn').addEventListener('click', () => renderPlanForEditing(plan));
        planElement.querySelector('.toggle-complete-btn').addEventListener('click', async () => {
            await db.collection('users').doc(currentUser.uid).collection('plans').doc(plan.id).update({ isCompleted: !plan.isCompleted });
            loadSavedPlans(categoryFilter.value);
        });
        planElement.querySelector('.delete-plan-btn').addEventListener('click', async () => {
            if (confirm(`"${plan.topic}" planını silmek istediğinizden emin misiniz?`)) {
                await db.collection('users').doc(currentUser.uid).collection('plans').doc(plan.id).delete();
                loadSavedPlans(categoryFilter.value);
                showToast("Plan silindi.");
            }
        });
        savedPlansContainer.appendChild(planElement);
    });
}

// ----- YARDIMCI FONKSİYONLAR -----
function updateStatsAndCategories(allPlans) {
    const totalPlans = allPlans.length;
    const completedPlans = allPlans.filter(p => p.isCompleted).length;
    statsWidget.innerHTML = `<div><strong>${totalPlans}</strong><span>Toplam Paket</span></div><div><strong>${completedPlans}</strong><span>Tamamlanan</span></div>`;

    const categories = [...new Set(allPlans.map(p => p.category).filter(Boolean))];
    const currentFilter = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">Tüm Kategoriler</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryFilter.appendChild(option);
    });
    categoryFilter.value = currentFilter;

    // Chart.js Güncelleme
    const categoryCounts = allPlans.reduce((acc, plan) => {
        acc[plan.category] = (acc[plan.category] || 0) + 1;
        return acc;
    }, {});

    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(categoryChartCanvas, {
        type: 'pie',
        data: {
            labels: Object.keys(categoryCounts),
            datasets: [{
                data: Object.values(categoryCounts),
                backgroundColor: ['#BB86FC', '#03DAC6', '#FF0266', '#02A6FF', '#FFDE03'],
                borderColor: '#1E1E1E',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#E1E1E1' }
                }
            }
        }
    });
}

function renderPlanForEditing(plan) {
    currentPlanId = plan.id;
    currentVideoId = plan.videoId;
    topicInput.value = plan.topic;
    categoryInput.value = plan.category;
    videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${plan.videoId}" frameborder="0" allowfullscreen></iframe>`;
    aiSummaryContainer.innerHTML = plan.aiSummary || '<p>Bu plan için özet bulunamadı.</p>';
    
    learningPlanChecklist.innerHTML = '';
    if (plan.learningPlan && plan.learningPlan.forEach) {
        plan.learningPlan.forEach(step => {
            addChecklistStep(step.text, step.completed);
        });
    }
    
    keyConceptsInput.value = plan.keyConcepts || '';
    
    resultsContainer.classList.remove('hidden');
    document.querySelector('.nav-link[data-view="generator-view"]').click();
}

// Akıllı Video Arama
async function fetchBestVideo(query) {
    let searchQuery = query;
    if (query.toLowerCase().includes('matematik')) {
        searchQuery = query + " Rehber Matematik";
    }
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("YouTube API hatası.");
    const data = await response.json();
    if (!data.items || data.items.length === 0) throw new Error(`"${query}" için video bulunamadı.`);
    return { id: data.items[0].id.videoId, title: data.items[0].snippet.title };
}

// ----- Dinamik Checklist Fonksiyonları -----
function addChecklistStep(text = '', isChecked = false) {
    const stepText = (typeof text === 'string' ? text : newStepInput.value).trim();
    if (!stepText) return;

    const li = document.createElement('li');
    li.innerHTML = `
        <input type="checkbox" ${isChecked ? 'checked' : ''}>
        <span contenteditable="true">${stepText}</span>
        <button class="delete-step-btn">&times;</button>
    `;
    li.querySelector('.delete-step-btn').addEventListener('click', () => li.remove());
    learningPlanChecklist.appendChild(li);
    if (typeof text !== 'string') newStepInput.value = '';
}

function getChecklistData() {
    return Array.from(learningPlanChecklist.querySelectorAll('li')).map(li => ({
        text: li.querySelector('span').textContent,
        completed: li.querySelector('input').checked
    }));
}

function clearGeneratorForm() {
    topicInput.value = '';
    categoryInput.value = '';
    resultsContainer.classList.add('hidden');
    learningPlanChecklist.innerHTML = '';
    keyConceptsInput.value = '';
    aiSummaryContainer.innerHTML = '<p>Video bulunduktan sonra, AI içeriği burada özetleyecektir.</p>';
    currentPlanId = null;
    currentVideoId = null;
}

// ----- Pomodoro Fonksiyonları -----
function togglePomodoro() {
    isPomoPaused = !isPomoPaused;
    pomoStartPauseBtn.innerHTML = isPomoPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
    if (!isPomoPaused) {
        pomoInterval = setInterval(updatePomodoro, 1000);
    } else {
        clearInterval(pomoInterval);
    }
}

function resetPomodoro() {
    clearInterval(pomoInterval);
    isPomoPaused = true;
    pomoMinutes = 25;
    pomoSeconds = 0;
    updatePomoDisplay();
    pomoStartPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
}

function updatePomodoro() {
    if (pomoSeconds === 0) {
        if (pomoMinutes === 0) {
            showToast("Pomodoro seansı tamamlandı!", "success");
            resetPomodoro();
            return;
        }
        pomoMinutes--;
        pomoSeconds = 59;
    } else {
        pomoSeconds--;
    }
    updatePomoDisplay();
}

function updatePomoDisplay() {
    pomoTimerDisplay.textContent = `${pomoMinutes.toString().padStart(2, '0')}:${pomoSeconds.toString().padStart(2, '0')}`;
}

// ----- Diğerleri -----
function updateStatus(message) {
    statusText.textContent = message;
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

// ----- Profil Yönetimi -----
async function handleUpdateDisplayName() {
    const newName = displayNameInput.value.trim();
    if (!newName) return showToast("Görünen ad boş olamaz.", "error");
    try {
        await currentUser.updateProfile({ displayName: newName });
        setupUI(currentUser);
        showToast("Görünen ad güncellendi.");
    } catch (error) { showToast("İsim güncellenemedi.", "error"); }
}

async function handleUpdatePassword() {
    const newPassword = newPasswordInput.value;
    if (newPassword.length < 6) return showToast("Şifre en az 6 karakter olmalıdır.", "error");
    try {
        await currentUser.updatePassword(newPassword);
        newPasswordInput.value = '';
        showToast("Şifreniz güncellendi.");
    } catch (error) { showToast("Şifre güncellenemedi. Tekrar giriş yapmanız gerekebilir.", "error"); }
}

async function handleDeleteAccount() {
    if (prompt("Hesabınızı silmek için 'SİL' yazın.") === 'SİL') {
        try { await currentUser.delete(); } 
        catch (error) { showToast("Hesap silinemedi.", "error"); }
    } else {
        showToast("İşlem iptal edildi.", "error");
    }
}