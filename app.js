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
const learningPlanChecklist = document.getElementById('learning-plan-checklist');
const newStepInput = document.getElementById('new-step-input');
const addStepButton = document.getElementById('add-step-button');
const keyConceptsInput = document.getElementById('key-concepts-input');
const savePlanButton = document.getElementById('save-plan-button');

// Quiz
const quizContent = document.getElementById('quiz-content');
const quizResultsContainer = document.getElementById('quiz-results-container');

// Profil & Diğerleri
const displayNameInput = document.getElementById('display-name-input');
const updateDisplayNameButton = document.getElementById('update-display-name-button');
const newPasswordInput = document.getElementById('new-password-input');
const updatePasswordButton = document.getElementById('update-password-button');
const deleteAccountButton = document.getElementById('delete-account-button');
const pomoTimerDisplay = document.getElementById('pomodoro-timer');
const pomoStartPauseBtn = document.getElementById('pomo-start-pause');
const pomoResetBtn = document.getElementById('pomo-reset');
const logoutButton = document.getElementById('logout-button');

// ----- UYGULAMA STATE'İ -----
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser, currentPlanId, currentVideoId, categoryChart, currentQuizData = null;
let pomoInterval, pomoMinutes = 25, pomoSeconds = 0, isPomoPaused = true;

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
    navLinks.forEach(link => link.addEventListener('click', (e) => handleNavClick(e.currentTarget)));
    fetchButton.addEventListener('click', handleFetchRequest);
    savePlanButton.addEventListener('click', saveCurrentPlan);
    addStepButton.addEventListener('click', () => addChecklistStep());
    categoryFilter.addEventListener('change', () => loadSavedPlans(categoryFilter.value));
    updateDisplayNameButton.addEventListener('click', handleUpdateDisplayName);
    updatePasswordButton.addEventListener('click', handleUpdatePassword);
    deleteAccountButton.addEventListener('click', handleDeleteAccount);
    pomoStartPauseBtn.addEventListener('click', togglePomodoro);
    pomoResetBtn.addEventListener('click', resetPomodoro);
    logoutButton.addEventListener('click', async () => await auth.signOut());
    quizContent.addEventListener('click', handleQuizActions);
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
        resultsContainer.classList.remove('hidden');
        renderQuizGeneratorButton(); // Quiz oluşturma butonunu göster
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
        quiz: currentQuizData, // AI tarafından oluşturulan quiz verisi
        isCompleted: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (!planData.topic) return showToast("Konu başlığı boş olamaz.", "error");

    try {
        savePlanButton.disabled = true;
        const planRef = db.collection('users').doc(currentUser.uid).collection('plans');

        if (currentPlanId) {
            await planRef.doc(currentPlanId).update(planData);
            showToast(`Plan güncellendi!`);
        } else {
            planData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await planRef.add(planData);
            showToast(`Plan kaydedildi!`);
        }
        
        loadSavedPlans();
        handleNavClick(document.querySelector('.nav-link[data-view="dashboard-view"]'));

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
                ${plan.quiz ? '<button class="quiz-plan-btn"><i class="fas fa-rocket"></i> Testi Çöz</button>' : ''}
                <button class="view-plan-btn">Düzenle</button>
            </div>
        `;
        
        planElement.querySelector('.view-plan-btn').addEventListener('click', () => renderPlanForEditing(plan));
        if(plan.quiz) {
            planElement.querySelector('.quiz-plan-btn').addEventListener('click', () => renderPlanForEditing(plan, true));
        }
        
        savedPlansContainer.appendChild(planElement);
    });
}

// ----- QUIZ FONKSİYONLARI -----
async function handleQuizActions(e) {
    if (e.target.id === 'generate-quiz-btn') {
        const topic = topicInput.value.trim();
        if (!topic) return showToast("Test oluşturmak için konu başlığı gereklidir.", "error");

        quizContent.innerHTML = '<div class="spinner"></div><p>AI, soruları hazırlıyor...</p>';
        try {
            if (!(await puter.auth.isLoggedIn())) {
                showToast("AI özelliğini kullanmak için Puter'a giriş yapmalısınız.", "info");
                await puter.auth.login();
            }
            const quizData = await runQuizAiAnalysis(topic);
            currentQuizData = quizData.quiz; // Sadece quiz array'ini al
            renderQuiz(currentQuizData);
        } catch (error) {
            showToast("AI test oluşturamadı. Lütfen tekrar deneyin.", "error");
            renderQuizGeneratorButton();
            console.error(error);
        }
    } else if (e.target.id === 'submit-quiz-btn') {
        handleSubmitQuiz();
    }
}

async function runQuizAiAnalysis(topic) {
    const prompt = `Bir Türk lise öğrencisinin "${topic}" konusundaki bilgisini ölçmek için 5 soruluk çoktan seçmeli bir test hazırla. Sadece ve sadece aşağıdaki formatta geçerli bir JSON nesnesi döndür: {"quiz": [{"question": "Soru metni...", "options": ["Seçenek A", "Seçenek B", "Seçenek C", "Seçenek D"], "correctAnswer": doğru_seçeneğin_indeksi_0_dan_başlayarak}]}`;
    const result = await puter.ai.chat([{ role: 'user', content: prompt }], { model: 'gpt-4o' });
    const rawJson = result.message.content.replace(/```json/g, '').replace(/```/g, '');
    return JSON.parse(rawJson);
}

function renderQuiz(quizData, reviewMode = false) {
    let quizHTML = quizData.map((q, index) => `
        <div class="quiz-question" id="question-${index}">
            <p>${index + 1}. ${q.question}</p>
            <div class="quiz-options">
                ${q.options.map((opt, i) => `
                    <label>
                        <input type="radio" name="q${index}" value="${i}" ${reviewMode ? 'disabled' : ''}>
                        <span>${opt}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
    
    if (!reviewMode) {
        quizHTML += '<button id="submit-quiz-btn" class="primary-button">Testi Bitir</button>';
    }
    
    quizContent.innerHTML = quizHTML;
    quizResultsContainer.innerHTML = '';
}

function handleSubmitQuiz() {
    let score = 0;
    currentQuizData.forEach((q, index) => {
        const questionDiv = document.getElementById(`question-${index}`);
        const selectedOption = questionDiv.querySelector(`input[name="q${index}"]:checked`);
        
        questionDiv.querySelectorAll('label').forEach(label => label.classList.remove('correct', 'incorrect'));

        if (selectedOption) {
            const selectedAnswer = parseInt(selectedOption.value);
            const correctAnswer = q.correctAnswer;
            const correctLabel = questionDiv.querySelector(`input[value="${correctAnswer}"]`).parentElement;
            correctLabel.classList.add('correct');

            if (selectedAnswer === correctAnswer) {
                score++;
            } else {
                selectedOption.parentElement.classList.add('incorrect');
            }
        }
        questionDiv.querySelectorAll('input').forEach(input => input.disabled = true);
    });

    quizResultsContainer.innerHTML = `<h3>Sonuç: ${currentQuizData.length} soruda ${score} doğru!</h3>`;
    document.getElementById('submit-quiz-btn').style.display = 'none';
}

// ----- YARDIMCI FONKSİYONLAR -----
function handleNavClick(targetLink) {
    const viewId = targetLink.getAttribute('data-view');
    if (viewId === 'generator-view') {
        currentPlanId = null;
        clearGeneratorForm();
    }
    views.forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    navLinks.forEach(nav => nav.classList.remove('active'));
    targetLink.classList.add('active');
}

function updateStatsAndCategories(allPlans) {
    const totalPlans = allPlans.length;
    const completedPlans = allPlans.filter(p => p.isCompleted).length;
    statsWidget.innerHTML = `<div><strong>${totalPlans}</strong><span>Toplam Paket</span></div><div><strong>${completedPlans}</strong><span>Tamamlanan</span></div>`;

    const categories = [...new Set(allPlans.map(p => p.category).filter(Boolean))];
    const currentFilter = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">Tüm Kategoriler</option>';
    categories.forEach(cat => categoryFilter.innerHTML += `<option value="${cat}">${cat}</option>`);
    categoryFilter.value = currentFilter;

    const categoryCounts = allPlans.reduce((acc, plan) => { (acc[plan.category] = (acc[plan.category] || 0) + 1); return acc; }, {});
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(categoryChartCanvas, {
        type: 'pie', data: { labels: Object.keys(categoryCounts), datasets: [{ data: Object.values(categoryCounts), backgroundColor: ['#BB86FC', '#03DAC6', '#FF0266', '#02A6FF', '#FFDE03'], borderColor: '#1E1E1E' }] },
        options: { responsive: true, plugins: { legend: { position: 'top', labels: { color: '#E1E1E1' } } } }
    });
}

function renderPlanForEditing(plan, startWithQuiz = false) {
    currentPlanId = plan.id;
    currentVideoId = plan.videoId;
    topicInput.value = plan.topic;
    categoryInput.value = plan.category;
    videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${plan.videoId}" frameborder="0" allowfullscreen></iframe>`;
    
    learningPlanChecklist.innerHTML = '';
    if (plan.learningPlan?.forEach) {
        plan.learningPlan.forEach(step => addChecklistStep(step.text, step.completed));
    }
    
    keyConceptsInput.value = plan.keyConcepts || '';
    
    if (plan.quiz) {
        currentQuizData = plan.quiz;
        renderQuiz(plan.quiz, startWithQuiz);
        if (startWithQuiz) handleSubmitQuiz(); // Simüle edilmiş, sadece cevapları gösterir
    } else {
        renderQuizGeneratorButton();
    }
    
    resultsContainer.classList.remove('hidden');
    handleNavClick(document.querySelector('.nav-link[data-view="generator-view"]'));
}

function renderQuizGeneratorButton() {
    quizContent.innerHTML = '<button id="generate-quiz-btn" class="secondary-action-button full-width"><i class="fas fa-magic"></i> AI ile Test Oluştur</button>';
    quizResultsContainer.innerHTML = '';
    currentQuizData = null;
}

async function fetchBestVideo(query) {
    let searchQuery = query;
    if (query.toLowerCase().includes('matematik')) {
        searchQuery = query + " Rehber Matematik";
    }
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("YouTube API hatası.");
    const data = await response.json();
    if (!data.items?.length) throw new Error(`"${query}" için video bulunamadı.`);
    return { id: data.items[0].id.videoId, title: data.items[0].snippet.title };
}

function addChecklistStep(text = '', isChecked = false) {
    const stepText = (typeof text === 'string' ? text : newStepInput.value).trim();
    if (!stepText) return;
    const li = document.createElement('li');
    li.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''}><span contenteditable="true">${stepText}</span><button class="delete-step-btn">&times;</button>`;
    li.querySelector('.delete-step-btn').addEventListener('click', () => li.remove());
    learningPlanChecklist.appendChild(li);
    if (typeof text !== 'string') newStepInput.value = '';
}

function getChecklistData() {
    return Array.from(learningPlanChecklist.querySelectorAll('li')).map(li => ({ text: li.querySelector('span').textContent, completed: li.querySelector('input').checked }));
}

function clearGeneratorForm() {
    topicInput.value = ''; categoryInput.value = '';
    resultsContainer.classList.add('hidden');
    learningPlanChecklist.innerHTML = ''; keyConceptsInput.value = '';
    currentPlanId = null; currentVideoId = null; currentQuizData = null;
    renderQuizGeneratorButton();
}

function togglePomodoro() {
    isPomoPaused = !isPomoPaused;
    pomoStartPauseBtn.innerHTML = isPomoPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
    if (!isPomoPaused) { pomoInterval = setInterval(updatePomodoro, 1000); } else { clearInterval(pomoInterval); }
}
function resetPomodoro() {
    clearInterval(pomoInterval); isPomoPaused = true;
    pomoMinutes = 25; pomoSeconds = 0;
    updatePomoDisplay(); pomoStartPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
}
function updatePomodoro() {
    if (pomoSeconds === 0) { if (pomoMinutes === 0) { showToast("Pomodoro seansı tamamlandı!", "success"); resetPomodoro(); return; } pomoMinutes--; pomoSeconds = 59; } else { pomoSeconds--; }
    updatePomoDisplay();
}
function updatePomoDisplay() { pomoTimerDisplay.textContent = `${pomoMinutes.toString().padStart(2, '0')}:${pomoSeconds.toString().padStart(2, '0')}`; }
function updateStatus(message) { statusText.textContent = message; }
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`; toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 3000); }, 100);
}

// ----- Profil Yönetimi -----
async function handleUpdateDisplayName() {
    const newName = displayNameInput.value.trim();
    if (!newName) return showToast("Görünen ad boş olamaz.", "error");
    try { await currentUser.updateProfile({ displayName: newName }); setupUI(currentUser); showToast("Görünen ad güncellendi."); } catch (error) { showToast("İsim güncellenemedi.", "error"); }
}
async function handleUpdatePassword() {
    const newPassword = newPasswordInput.value;
    if (newPassword.length < 6) return showToast("Şifre en az 6 karakter olmalıdır.", "error");
    try { await currentUser.updatePassword(newPassword); newPasswordInput.value = ''; showToast("Şifreniz güncellendi."); } catch (error) { showToast("Şifre güncellenemedi. Tekrar giriş yapmanız gerekebilir.", "error"); }
}
async function handleDeleteAccount() {
    if (prompt("Hesabınızı silmek için 'SİL' yazın.") === 'SİL') {
        try { await currentUser.delete(); } catch (error) { showToast("Hesap silinemedi.", "error"); }
    } else { showToast("İşlem iptal edildi.", "error"); }
}