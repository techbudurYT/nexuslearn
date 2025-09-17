// ----- HTML ELEMENTLERİ -----
const userDisplayName = document.getElementById('user-display-name');
const logoutButton = document.getElementById('logout-button');

const dashboardView = document.getElementById('dashboard-view');
const generatorView = document.getElementById('generator-view');
const newPlanButton = document.getElementById('new-plan-button');
const savedPlansContainer = document.getElementById('saved-plans-container');

const topicInput = document.getElementById('topic-input');
const fetchButton = document.getElementById('fetch-button');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const resultsContainer = document.getElementById('results-container');
const videoContainer = document.getElementById('video-container');
const keyConceptsContainer = document.getElementById('key-concepts-container');
const learningPlanContainer = document.getElementById('learning-plan-container');
const openQuestionsContainer = document.getElementById('open-questions-container');
const backToDashboardButton = document.getElementById('back-to-dashboard-button');
const savePlanButton = document.getElementById('save-plan-button');


// ----- FIREBASE REFERANSLARI -----
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser;
let currentGeneratedPlan = null; // Geçici olarak oluşturulan planı tutar

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
    document.body.style.display = 'block'; // Sayfayı göster
}

function showView(view) {
    dashboardView.classList.add('hidden');
    generatorView.classList.add('hidden');
    view.classList.remove('hidden');
}


// ----- EVENT LISTENERS -----
logoutButton.addEventListener('click', async () => {
    await auth.signOut();
});

newPlanButton.addEventListener('click', () => {
    resultsContainer.classList.add('hidden');
    topicInput.value = '';
    showView(generatorView);
});

fetchButton.addEventListener('click', handleFetchRequest);
backToDashboardButton.addEventListener('click', () => showView(dashboardView));
savePlanButton.addEventListener('click', saveCurrentPlan);


// ----- ANA FONKSİYONLAR -----
async function handleFetchRequest() {
    const userQuery = topicInput.value.trim();
    if (!userQuery) {
        alert("Lütfen bir ders ve konu girin.");
        return;
    }
    if (typeof YOUTUBE_API_KEY === 'undefined' || YOUTUBE_API_KEY === 'SENİN_YOUTUBE_API_ANAHTARIN') {
        alert("Hata: config.js dosyasında geçerli bir YOUTUBE_API_KEY bulunamadı. Lütfen anahtarınızı kontrol edin.");
        return;
    }

    resultsContainer.classList.add('hidden');
    savePlanButton.classList.add('hidden');
    statusIndicator.style.display = 'block';

    try {
        updateStatus("AI, öğrenme stratejini hazırlıyor...");
        const aiResponse = await runAiAnalysis(userQuery);

        updateStatus("En iyi ders videosu YouTube'da aranıyor...");
        const videoId = await fetchBestVideo(aiResponse.youtubeSearchQueries);

        updateStatus("Öğrenme paketin tamamlanıyor...");
        
        currentGeneratedPlan = {
            topic: userQuery,
            videoId: videoId,
            aiData: aiResponse,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        renderAllResults(videoId, aiResponse);
        
        statusIndicator.style.display = 'none';
        resultsContainer.classList.remove('hidden');
        savePlanButton.classList.remove('hidden');

    } catch (error) {
        statusIndicator.style.display = 'none';
        alert("Bir hata oluştu: " + error.message);
        console.error(error);
    }
}

async function saveCurrentPlan() {
    if (!currentGeneratedPlan || !currentUser) return;
    try {
        savePlanButton.disabled = true;
        savePlanButton.textContent = "Kaydediliyor...";
        await db.collection('users').doc(currentUser.uid).collection('plans').add(currentGeneratedPlan);
        alert(`"${currentGeneratedPlan.topic}" konulu plan başarıyla kaydedildi!`);
        currentGeneratedPlan = null;
        loadSavedPlans();
        showView(dashboardView);
    } catch (error) {
        console.error("Plan kaydetme hatası: ", error);
        alert("Plan kaydedilirken bir hata oluştu.");
    } finally {
        savePlanButton.disabled = false;
        savePlanButton.textContent = "Planı Kaydet ve Panele Dön";
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
            <h3>${plan.topic}</h3>
            <p>Oluşturulma: ${plan.createdAt ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : 'Bilinmiyor'}</p>
            <button class="view-plan-btn">Görüntüle</button>
            <button class="delete-plan-btn">Sil</button>
        `;
        
        planElement.querySelector('.view-plan-btn').addEventListener('click', () => {
            renderAllResults(plan.videoId, plan.aiData);
            savePlanButton.classList.add('hidden'); // Kayıtlı planı tekrar kaydetme
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

// ----- YENİ: PUTER.JS İLE AI ETKİLEŞİMİ -----
async function runAiAnalysis(userQuery) {
    const prompt = `Bir Türk lise öğrencisi için uzman bir öğrenme asistanı olarak hareket et. Kullanıcının öğrenmek istediği konu: "${userQuery}". Bana aşağıdaki formatta, başka hiçbir ek metin olmadan, geçerli bir JSON nesnesi döndür: { "youtubeSearchQueries": ["..."], "keyConcepts": ["..."], "learningPlan": ["..."], "openQuestions": ["..."] }`;

    try {
        console.log("Puter.js AI servisi çağrılıyor...");
        // Puter.js'in `ai.chat` metodunu kullanarak AI'dan yanıt alıyoruz.
        // GPT-4o gibi daha güçlü bir model kullanarak daha kaliteli sonuçlar elde ediyoruz.
        const result = await puter.ai.chat([{
            role: 'user',
            content: prompt
        }], { model: 'gpt-4o' });

        const rawJson = result.message.content;
        // AI'ın başına veya sonuna ekleyebileceği markdown formatını temizliyoruz.
        return JSON.parse(rawJson.replace(/```json/g, '').replace(/```/g, ''));

    } catch (error) {
        console.error("Puter.js AI servisinde hata:", error);
        throw new Error("AI analizi sırasında bir hata oluştu. Lütfen Puter.js entegrasyonunu kontrol edin veya daha sonra tekrar deneyin.");
    }
}


// ----- YOUTUBE ETKİLEŞİMİ -----
async function fetchBestVideo(searchQueries) {
    const query = searchQueries[0];
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("YouTube API hatası. config.js'deki anahtarınızı veya günlük kotanızı kontrol edin.");
    const data = await response.json();
    if (!data.items || data.items.length === 0) throw new Error(`"${query}" araması için video bulunamadı.`);
    return data.items[0].id.videoId;
}

// ----- ARAYÜZ GÜNCELLEME -----
function renderAllResults(videoId, aiData) {
    videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
    keyConceptsContainer.innerHTML = `<ul>${aiData.keyConcepts.map(c => `<li>${c}</li>`).join('')}</ul>`;
    learningPlanContainer.innerHTML = `<ol>${aiData.learningPlan.map(s => `<li>${s}</li>`).join('')}</ol>`;
    openQuestionsContainer.innerHTML = `<ul>${aiData.openQuestions.map(q => `<li>${q}</li>`).join('')}</ul>`;
}

function updateStatus(message) {
    statusText.textContent = message;
}
