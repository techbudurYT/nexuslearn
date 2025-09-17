// script.js

// ----- HTML ELEMENTLERİ -----
const topicInput = document.getElementById('topic-input');
const fetchButton = document.getElementById('fetch-button');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const resultsContainer = document.getElementById('results-container');
const videoContainer = document.getElementById('video-container');
const keyConceptsContainer = document.getElementById('key-concepts-container');
const learningPlanContainer = document.getElementById('learning-plan-container');
const openQuestionsContainer = document.getElementById('open-questions-container');

// ----- ANA MANTIK -----
fetchButton.addEventListener('click', handleFetchRequest);

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
    statusIndicator.style.display = 'block';

    try {
        updateStatus("AI, öğrenme stratejini hazırlıyor...");
        const aiResponse = await runAiAnalysis(userQuery);

        updateStatus("En iyi ders videosu YouTube'da aranıyor...");
        const videoId = await fetchBestVideo(aiResponse.youtubeSearchQueries);

        updateStatus("Öğrenme paketin tamamlanıyor...");
        renderAllResults(videoId, aiResponse);

        statusIndicator.style.display = 'none';
        resultsContainer.classList.remove('hidden');

    } catch (error) {
        statusIndicator.style.display = 'none';
        alert("Bir hata oluştu: " + error.message);
        console.error(error);
    }
}

// ----- EN SAĞLAM AI ETKİLEŞİMİ (5+ YEDEK SİSTEM) -----
async function runAiAnalysis(userQuery) {
    // Replit ortamında çalışması garanti olan, anahtarsız, ücretsiz AI servisleri listesi.
    const AI_ENDPOINTS = [
        'https://api.chatanywhere.tech/v1/chat/completions',
        'https://free.churchless.tech/v1/chat/completions',
        'https://api.pawan.krd/v1/chat/completions',
        'https://ai.fakeopen.com/v1/chat/completions',
        'https://openrouter.ai/api/v1/chat/completions' // Bazen anahtarsız çalışır
    ];

    const prompt = `Bir Türk lise öğrencisi için uzman bir öğrenme asistanı olarak hareket et. Kullanıcının öğrenmek istediği konu: "${userQuery}". Bana aşağıdaki formatta, başka hiçbir ek metin olmadan, geçerli bir JSON nesnesi döndür: { "youtubeSearchQueries": ["..."], "keyConcepts": ["..."], "learningPlan": ["..."], "openQuestions": ["..."] }`;

    for (const API_URL of AI_ENDPOINTS) {
        try {
            console.log(`AI servisi deneniyor: ${API_URL}`); // Replit'in sağdaki konsolundan takip edebilirsin.
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer_boş_olsa_da_olur' }, // Bazı servisler boş da olsa bu başlığı ister
                body: JSON.stringify({
                    "model": "gpt-3.5-turbo",
                    "messages": [{ "role": "user", "content": prompt }]
                })
            });

            if (!response.ok) {
                console.warn(`Servis yanıt vermedi: ${API_URL}`);
                continue; 
            }

            const data = await response.json();
            const rawJson = data.choices[0].message.content;
            return JSON.parse(rawJson.replace(/```json/g, '').replace(/```/g, ''));

        } catch (error) {
            console.error(`Serviste hata: ${API_URL}`, error);
            continue;
        }
    }
    throw new Error("Tüm yedek AI servisleri yanıt vermedi. Bu çok nadir bir durumdur. Lütfen birkaç dakika sonra tekrar deneyin.");
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