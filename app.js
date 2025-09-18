// ----- HTML ELEMENTLERİ -----
const toastContainer = document.getElementById('toast-container');
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');
const userDisplayName = document.getElementById('user-display-name');

// Dashboard
const statsContainer = document.getElementById('stats-container');
const gpDisplay = document.getElementById('gp-display');
const badgeContainer = document.getElementById('badge-container');
const categoryFilter = document.getElementById('category-filter');
const savedPlansContainer = document.getElementById('saved-plans-container');
const masteryChartCanvas = document.getElementById('masteryChart');
const todaysReviewsContainer = document.getElementById('todays-reviews-container');

// Generator
const topicInput = document.getElementById('topic-input');
const categoryInput = document.getElementById('category-input');
const fetchButton = document.getElementById('fetch-button');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const pathwayContainer = document.getElementById('pathway-container');
const prerequisitesContainer = document.getElementById('prerequisites-container');
const learningPathComponent = document.getElementById('learning-path-container');
const preTestContainer = document.getElementById('pre-test-container');
const remediationContainer = document.getElementById('remediation-container');
const quizContent = document.getElementById('quiz-content');
const quizResultsContainer = document.getElementById('quiz-results-container');
const savePlanButton = document.getElementById('save-plan-button');

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
let currentUser, currentPlanId, currentPathwayData = null;
let masteryChart;
let pomoInterval, pomoMinutes = 25, pomoSeconds = 0, isPomoPaused = true;

const BADGE_DEFINITIONS = {
    newbie: { icon: 'fas fa-baby', title: 'İlk Adım' },
    diligent: { icon: 'fas fa-pencil-alt', title: '5 Patika Tamamlandı' },
    master: { icon: 'fas fa-brain', title: 'Bir Konuda %100 Ustalık' },
    perfect: { icon: 'fas fa-bullseye', title: 'İlk %100 Test Sonucu' },
    focused: { icon: 'fas fa-stopwatch', title: '10 Pomodoro Seansı' },
};

// ----- UYGULAMA BAŞLANGICI -----
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        setupUI(user);
        loadDashboardData();
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
    fetchButton.addEventListener('click', generateLearningPathway);
    savePlanButton.addEventListener('click', saveCurrentPlan);
    categoryFilter.addEventListener('change', () => loadDashboardData(categoryFilter.value));
    updateDisplayNameButton.addEventListener('click', handleUpdateDisplayName);
    updatePasswordButton.addEventListener('click', handleUpdatePassword);
    deleteAccountButton.addEventListener('click', handleDeleteAccount);
    pomoStartPauseBtn.addEventListener('click', togglePomodoro);
    pomoResetBtn.addEventListener('click', resetPomodoro);
    logoutButton.addEventListener('click', async () => await auth.signOut());
    quizContent.addEventListener('click', handleQuizActions);
}

// ----- ANA FONKSİYONLAR -----
async function generateLearningPathway() {
    const userQuery = topicInput.value.trim();
    if (!userQuery) return showToast("Lütfen bir konu başlığı girin.", "error");

    pathwayContainer.classList.add('hidden');
    statusIndicator.style.display = 'block';
    fetchButton.disabled = true;

    try {
        updateStatus("AI, ön koşul analizi yapıyor...");
        const prompt = `Bir Türk lise öğrencisinin "${userQuery}" konusunu sıfırdan en verimli şekilde öğrenmesi için bir "Gelişim Patikası" oluştur. Cevabın SADECE ve SADECE aşağıdaki formatta, başka hiçbir metin olmadan geçerli bir JSON nesnesi olsun:
        {
          "prerequisites": ["...", "..."],
          "microLessons": [
            { "id": "ders_1", "title": "...", "youtubeSearchQuery": "...", "memoryTechnique": "..." },
            { "id": "ders_2", "title": "...", "youtubeSearchQuery": "...", "memoryTechnique": "..." }
          ],
          "preTest": [
            { "lessonId": "ders_1", "question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": 0_dan_başlayan_indeks }
          ]
        }`;
        const result = await puter.ai.chat([{ role: 'user', content: prompt }], { model: 'gpt-4o' });
        const rawJson = result.message.content.replace(/```json/g, '').replace(/```/g, '');
        currentPathwayData = JSON.parse(rawJson);

        updateStatus("Öğrenme materyalleri hazırlanıyor...");
        renderLearningPathway(currentPathwayData);
        pathwayContainer.classList.remove('hidden');

    } catch (error) {
        showToast("AI Gelişim Patikası oluşturamadı. Lütfen tekrar deneyin.", "error");
        console.error(error);
    } finally {
        statusIndicator.style.display = 'none';
        fetchButton.disabled = false;
    }
}

async function saveCurrentPlan() {
    if (!currentUser || !currentPathwayData) return showToast("Kaydedilecek bir patika bulunamadı.", "error");

    const planData = {
        topic: topicInput.value.trim(),
        category: categoryInput.value.trim() || 'Genel',
        pathway: currentPathwayData,
        mastery: currentPathwayData.microLessons.reduce((acc, lesson) => ({ ...acc, [lesson.id]: 0 }), {}),
        isCompleted: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (!planData.topic) return showToast("Konu başlığı boş olamaz.", "error");

    try {
        savePlanButton.disabled = true;
        const planRef = db.collection('users').doc(currentUser.uid).collection('plans');
        if (currentPlanId) {
            await planRef.doc(currentPlanId).update(planData);
            showToast(`Patika güncellendi!`);
        } else {
            planData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await planRef.add(planData);
            currentPlanId = docRef.id;
            showToast(`Patika kaydedildi!`);
        }
        await awardPoints(25, 'Yeni Patika Kaydedildi');
        loadDashboardData();
    } catch (error) {
        showToast("Patika kaydedilirken bir hata oluştu.", "error");
    } finally {
        savePlanButton.disabled = false;
    }
}

async function loadDashboardData(filterCategory = 'all') {
    if (!currentUser) return;
    savedPlansContainer.innerHTML = '<div class="spinner"></div>';
    
    const plansSnapshot = await db.collection('users').doc(currentUser.uid).collection('plans').orderBy('createdAt', 'desc').get();
    const allPlans = plansSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data() || {};

    renderDashboard(allPlans, userData, filterCategory);
    renderSavedPlans(allPlans, filterCategory);
}

// ----- QUIZ FONKSİYONLARI -----
async function handleQuizActions(e) {
    if (e.target.id === 'submit-quiz-btn') {
        handleSubmitQuiz();
    }
}

async function handleSubmitQuiz() {
    let score = 0;
    const incorrectLessons = new Set();
    const testData = currentPathwayData.preTest;

    testData.forEach((q, index) => {
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
                updateMastery(q.lessonId, 20); // +20 puan
            } else {
                selectedOption.parentElement.classList.add('incorrect');
                incorrectLessons.add(q.lessonId);
                updateMastery(q.lessonId, -10); // -10 puan
            }
        }
        questionDiv.querySelectorAll('input').forEach(input => input.disabled = true);
    });

    const scorePercentage = (score / testData.length) * 100;
    quizResultsContainer.innerHTML = `<h3>Sonuç: ${testData.length} soruda ${score} doğru! (%${scorePercentage.toFixed(0)})</h3>`;
    document.getElementById('submit-quiz-btn').style.display = 'none';

    await awardPoints(score * 5, 'Test Çözüldü');
    if (scorePercentage === 100) {
        await checkAndAwardBadges('perfect');
    }

    if (incorrectLessons.size > 0) {
        generateRemediation(incorrectLessons);
    } else {
        remediationContainer.innerHTML = `<div class="widget"><h4>Harika iş!</h4><p>Tüm konuları doğru anladın. Bu patikayı tamamlayabilirsin.</p></div>`;
    }
}

async function generateRemediation(lessonIds) {
    remediationContainer.innerHTML = `<div class="widget"><div class="spinner"></div><p>AI, zayıf olduğun konular için telafi modülü hazırlıyor...</p></div>`;
    const failedTopics = currentPathwayData.microLessons
        .filter(l => lessonIds.has(l.id))
        .map(l => l.title);

    try {
        const prompt = `Bir öğrenci "${topicInput.value.trim()}" konusunda yaptığı testte şu alt başlıklarda hata yaptı: ${failedTopics.join(', ')}. Bu konuları daha iyi anlaması için her bir başlık için farklı bir yaklaşımla kısa bir açıklama veya bir analoji sun. Cevabın SADECE ve SADECE HTML formatında, class'ı "remediation-box" olan bir div içinde olsun.`;
        const result = await puter.ai.chat([{ role: 'user', content: prompt }], { model: 'gpt-4o' });
        remediationContainer.innerHTML = result.message.content;
    } catch (error) {
        remediationContainer.innerHTML = `<p class="error-message">Telafi modülü oluşturulamadı.</p>`;
    }
}

// ----- ARAYÜZ RENDER FONKSİYONLARI -----
function renderLearningPathway(data) {
    // 1. Ön koşullar
    if (data.prerequisites && data.prerequisites.length > 0) {
        prerequisitesContainer.innerHTML = `
            <div class="prerequisites-box widget">
                <h4><i class="fas fa-exclamation-triangle"></i> Başlamadan Önce</h4>
                <p>Bu konuyu tam olarak anlayabilmek için aşağıdaki konulara hakim olman önerilir:</p>
                <ul>${data.prerequisites.map(p => `<li>${p}</li>`).join('')}</ul>
            </div>`;
    } else {
        prerequisitesContainer.innerHTML = '';
    }

    // 2. Mikro Dersler
    learningPathComponent.innerHTML = '<h3><i class="fas fa-shoe-prints"></i> Öğrenme Adımları</h3>';
    data.microLessons.forEach((lesson, index) => {
        const lessonEl = document.createElement('div');
        lessonEl.className = 'micro-lesson-card';
        lessonEl.innerHTML = `
            <div class="lesson-header">
                <h4>${index + 1}. ${lesson.title}</h4>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="lesson-content" style="display: none;">
                <p class="memory-technique"><i class="fas fa-lightbulb"></i> <b>Hafıza Tekniği:</b> ${lesson.memoryTechnique}</p>
                <div class="video-placeholder" id="video-${lesson.id}">
                    <button class="primary-button load-video-btn" data-query="${lesson.youtubeSearchQuery}" data-target="video-${lesson.id}"><i class="fab fa-youtube"></i> Videoyu Yükle</button>
                </div>
                <label><input type="checkbox" class="lesson-complete-cb" data-lesson-id="${lesson.id}"> Bu adımı anladım ve tamamladım.</label>
            </div>
        `;
        learningPathComponent.appendChild(lessonEl);
    });
    
    // Akordiyon ve Video Yükleme Eventleri
    learningPathComponent.querySelectorAll('.lesson-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            content.style.display = content.style.display === 'none' ? 'flex' : 'none';
            header.querySelector('i').classList.toggle('fa-chevron-down');
            header.querySelector('i').classList.toggle('fa-chevron-up');
        });
    });

    learningPathComponent.querySelectorAll('.load-video-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const query = e.target.dataset.query;
            const targetId = e.target.dataset.target;
            const container = document.getElementById(targetId);
            container.innerHTML = '<div class="spinner"></div>';
            try {
                const videoData = await fetchBestVideo(query);
                container.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoData.id}" frameborder="0" allowfullscreen></iframe>`;
            } catch (error) {
                container.innerHTML = `<p class="error-message">Video yüklenemedi.</p>`;
                showToast(error.message, "error");
            }
        });
    });
    
    learningPathComponent.querySelectorAll('.lesson-complete-cb').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                updateMastery(e.target.dataset.lessonId, 5); // +5 tamamlama puanı
                scheduleNextReview(e.target.dataset.lessonId);
            }
        });
    });

    // 3. Ön Test
    renderQuiz(data.preTest);
    remediationContainer.innerHTML = '';
}

function renderDashboard(allPlans, userData, filterCategory) {
    // 1. İstatistikler, GP ve Rozetler
    const totalPlans = allPlans.length;
    const completedPlans = allPlans.filter(p => p.isCompleted).length;
    statsContainer.innerHTML = `<div><strong>${totalPlans}</strong><span>Toplam Patika</span></div><div><strong>${completedPlans}</strong><span>Tamamlanan</span></div>`;
    gpDisplay.textContent = userData.gp || 0;
    badgeContainer.innerHTML = (userData.badges || []).map(badgeId => 
        `<i class="${BADGE_DEFINITIONS[badgeId].icon} badge" title="${BADGE_DEFINITIONS[badgeId].title}"></i>`
    ).join('');

    // 2. Kategori Filtresi ve Ustalık Haritası
    const categories = [...new Set(allPlans.map(p => p.category).filter(Boolean))];
    const currentFilter = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">Tüm Kategoriler</option>';
    categories.forEach(cat => categoryFilter.innerHTML += `<option value="${cat}">${cat}</option>`);
    categoryFilter.value = currentFilter;

    renderMasteryChart(allPlans);
    renderTodaysReviews(allPlans);
}

function renderMasteryChart(allPlans) {
    const masteryData = {};
    allPlans.forEach(plan => {
        if (plan.mastery) {
            const topic = plan.topic;
            const scores = Object.values(plan.mastery);
            const avgMastery = scores.reduce((a, b) => a + b, 0) / scores.length;
            masteryData[topic] = avgMastery;
        }
    });

    if (masteryChart) masteryChart.destroy();
    masteryChart = new Chart(masteryChartCanvas, {
        type: 'polarArea',
        data: {
            labels: Object.keys(masteryData),
            datasets: [{
                data: Object.values(masteryData),
                backgroundColor: ['rgba(187, 134, 252, 0.5)', 'rgba(3, 218, 198, 0.5)', 'rgba(255, 2, 102, 0.5)', 'rgba(2, 166, 255, 0.5)', 'rgba(255, 222, 3, 0.5)'],
            }]
        },
        options: {
            responsive: true,
            scales: { r: { suggestedMin: 0, suggestedMax: 100, ticks: { backdropColor: 'transparent' }, grid: { color: 'rgba(255,255,255,0.1)' } } },
            plugins: { legend: { display: false } }
        }
    });
}

function renderTodaysReviews(allPlans) {
    const dueReviews = [];
    const today = new Date().setHours(0, 0, 0, 0);
    allPlans.forEach(plan => {
        if(plan.pathway.microLessons) {
            plan.pathway.microLessons.forEach(lesson => {
                if(lesson.nextReviewDate && lesson.nextReviewDate.toDate().setHours(0,0,0,0) === today) {
                    dueReviews.push({planId: plan.id, planTopic: plan.topic, lesson: lesson});
                }
            });
        }
    });

    if (dueReviews.length === 0) {
        todaysReviewsContainer.innerHTML = '<p>Bugün için planlanmış tekrar bulunmuyor.</p>';
        return;
    }

    todaysReviewsContainer.innerHTML = dueReviews.map(review => `
        <div class="review-item">
            <span><strong>${review.planTopic}</strong>: ${review.lesson.title} konusunu tekrar et.</span>
            <button class="primary-button review-btn" data-plan-id="${review.planId}">Git</button>
        </div>
    `).join('');
    
    todaysReviewsContainer.querySelectorAll('.review-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const plan = allPlans.find(p => p.id === btn.dataset.planId);
            if(plan) renderPlanForEditing(plan);
        });
    });
}


function renderSavedPlans(allPlans, filterCategory) {
    const filteredPlans = filterCategory === 'all' ? allPlans : allPlans.filter(plan => plan.category === filterCategory);
    if (filteredPlans.length === 0) {
        savedPlansContainer.innerHTML = '<p>Bu kategoride patika bulunamadı.</p>';
        return;
    }
    
    savedPlansContainer.innerHTML = filteredPlans.map(plan => `
        <div class="plan-card ${plan.isCompleted ? 'completed' : ''}">
            <span class="plan-category">${plan.category}</span>
            <h4>${plan.topic}</h4>
            <div class="plan-actions">
                <button class="view-plan-btn" data-plan-id="${plan.id}"><i class="fas fa-edit"></i> Görüntüle</button>
            </div>
        </div>
    `).join('');
    
    savedPlansContainer.querySelectorAll('.view-plan-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const plan = allPlans.find(p => p.id === btn.dataset.planId);
            if (plan) renderPlanForEditing(plan);
        });
    });
}


function renderQuiz(quizData) {
    let quizHTML = quizData.map((q, index) => `
        <div class="quiz-question" id="question-${index}">
            <p>${index + 1}. ${q.question}</p>
            <div class="quiz-options">
                ${q.options.map((opt, i) => `
                    <label>
                        <input type="radio" name="q${index}" value="${i}">
                        <span>${opt}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
    
    quizHTML += '<button id="submit-quiz-btn" class="primary-button">Testi Bitir</button>';
    quizContent.innerHTML = quizHTML;
    quizResultsContainer.innerHTML = '';
}

function renderPlanForEditing(plan) {
    clearGeneratorForm();
    currentPlanId = plan.id;
    topicInput.value = plan.topic;
    categoryInput.value = plan.category;
    currentPathwayData = plan.pathway;
    
    renderLearningPathway(currentPathwayData);
    renderQuiz(currentPathwayData.preTest);

    pathwayContainer.classList.remove('hidden');
    handleNavClick(document.querySelector('.nav-link[data-view="generator-view"]'));
}

// ----- YARDIMCI & VERİ FONKSİYONLARI -----
function handleNavClick(targetLink) {
    const viewId = targetLink.getAttribute('data-view');
    if (viewId === 'generator-view') {
        clearGeneratorForm();
    }
    views.forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    navLinks.forEach(nav => nav.classList.remove('active'));
    targetLink.classList.add('active');
}

async function fetchBestVideo(query) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("YouTube API hatası.");
    const data = await response.json();
    if (!data.items?.length) throw new Error(`"${query}" için video bulunamadı.`);
    return { id: data.items[0].id.videoId, title: data.items[0].snippet.title };
}

async function updateMastery(lessonId, pointsToAdd) {
    if (!currentPlanId) await saveCurrentPlan();
    
    const planRef = db.collection('users').doc(currentUser.uid).collection('plans').doc(currentPlanId);
    const doc = await planRef.get();
    const currentMastery = doc.data().mastery[lessonId] || 0;
    const newMastery = Math.max(0, Math.min(100, currentMastery + pointsToAdd));

    await planRef.update({ [`mastery.${lessonId}`]: newMastery });

    if (newMastery === 100) {
        await checkAndAwardBadges('master');
    }
}

async function awardPoints(points, reason) {
    const userRef = db.collection('users').doc(currentUser.uid);
    await userRef.set({
        gp: firebase.firestore.FieldValue.increment(points)
    }, { merge: true });
    showToast(`+${points} GP (${reason})`, 'success');
}

async function checkAndAwardBadges(badgeToOrCheck) {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    const userData = doc.data() || { badges: [] };
    const currentBadges = userData.badges || [];
    
    if (!currentBadges.includes(badgeToOrCheck)) {
        await userRef.update({
            badges: firebase.firestore.FieldValue.arrayUnion(badgeToOrCheck)
        });
        showToast(`Yeni Rozet Kazandın: ${BADGE_DEFINITIONS[badgeToOrCheck].title}!`, 'success');
    }
}

function scheduleNextReview(lessonId) {
    if (!currentPlanId) return;
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + 1); // Basitçe 1 gün sonraya ayarla

    const planRef = db.collection('users').doc(currentUser.uid).collection('plans').doc(currentPlanId);
    
    const lessonPath = `pathway.microLessons`;
    planRef.get().then(doc => {
        const plan = doc.data();
        const lessonIndex = plan.pathway.microLessons.findIndex(l => l.id === lessonId);
        if(lessonIndex !== -1) {
            plan.pathway.microLessons[lessonIndex].nextReviewDate = firebase.firestore.Timestamp.fromDate(nextReviewDate);
            planRef.update({ pathway: plan.pathway });
        }
    });
}

function clearGeneratorForm() {
    topicInput.value = ''; categoryInput.value = '';
    pathwayContainer.classList.add('hidden');
    prerequisitesContainer.innerHTML = '';
    learningPathComponent.innerHTML = '';
    preTestContainer.innerHTML = '';
    currentPlanId = null; currentPathwayData = null;
}

function updateStatus(message) { statusText.textContent = message; }
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`; toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 4000); }, 100);
}

// ----- Pomodoro & Profil Yönetimi -----
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
    if (pomoSeconds === 0) { 
        if (pomoMinutes === 0) { 
            showToast("Pomodoro seansı tamamlandı!", "success"); 
            awardPoints(15, 'Pomodoro Tamamlandı');
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
function updatePomoDisplay() { pomoTimerDisplay.textContent = `${pomoMinutes.toString().padStart(2, '0')}:${pomoSeconds.toString().padStart(2, '0')}`; }

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