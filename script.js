let isLoggedIn = false;
let currentUsername = "";
let currentKey = ""; // Kullanıcının aktif key'ini burada saklayacağız
const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Flask API adresiniz

// --- GLOBAL FONKSİYONLAR (Gezinti ve Görünüm) ---

// Bu fonksiyon, tüm HTML onclick olaylarının global olarak çalışabilmesi için tanımlanmıştır.
function changePage(targetPageId) {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    
    // Tüm sayfaları gizle
    pages.forEach(page => {
        page.classList.remove('active');
        page.classList.add('hidden');
    });

    // Hedef sayfayı göster
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.classList.remove('hidden');
    }
    
    // Aktif linki işaretle
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === targetPageId) {
            link.classList.add('active');
        }
    });
    
    // URL hash'ini güncelle (tarayıcı geçmişi için)
    window.history.pushState(null, null, `#${targetPageId}`);
}

// Navigasyon menülerini giriş durumuna göre günceller
function updateNavState() {
    const navLogin = document.getElementById('nav-login');
    const navProfile = document.getElementById('nav-profile');
    const navFeedback = document.getElementById('nav-feedback');
    const navDownload = document.getElementById('nav-download');
    const profileUsername = document.getElementById('profile-username');
    const trialKeyElement = document.getElementById('trial-key');
    const expiryDateElement = document.getElementById('key-expiry-date');

    if (isLoggedIn) {
        // Giriş yapmış kullanıcı menüsü
        navLogin.style.display = 'none';
        navProfile.style.display = 'block';
        navFeedback.style.display = 'block';
        navDownload.style.display = 'block';

        if (profileUsername) profileUsername.textContent = currentUsername;
        if (trialKeyElement) trialKeyElement.textContent = currentKey;
        // Expiry bilgisini burada güncellemiyoruz, girişten sonra updateAuthInfo içinde güncellenecek.
    } else {
        // Misafir menüsü
        navLogin.style.display = 'block';
        navProfile.style.display = 'none';
        navFeedback.style.display = 'none';
        navDownload.style.display = 'none';
    }
}

// Hash Kontrolü ve İlk Yükleme
function loadPageFromHash() {
    const hash = window.location.hash.substring(1);
    const defaultPage = 'about'; 
    let targetId = hash || defaultPage;
    
    // Korumalı sayfaya anonim erişimi engelle
    const protectedPages = ['profile', 'feedback', 'download'];
    if (protectedPages.includes(targetId) && !isLoggedIn) {
        targetId = 'auth';
    }

    changePage(targetId);
}

// Auth Sayfası Geçişi (Giriş/Kayıt)
window.showAuth = (type) => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const title = document.getElementById('auth-title');
    
    document.querySelectorAll('.auth-toggle .toggle-btn').forEach(btn => btn.classList.remove('active'));

    if (type === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        title.textContent = "Kullanıcı Girişi";
        document.querySelector('.auth-toggle .toggle-btn:nth-child(1)').classList.add('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        title.textContent = "Yeni Kullanıcı Kaydı";
        document.querySelector('.auth-toggle .toggle-btn:nth-child(2)').classList.add('active');
    }
}

// --- API ETKİLEŞİMİ FONKSİYONLARI ---

// Kullanıcı durumu ve Key bilgilerini güncelleyen ve localStorage'a kaydeden fonksiyon
function setAuthStatus(loggedIn, username = "", key = "", expiry = "") {
    isLoggedIn = loggedIn;
    currentUsername = username;
    currentKey = key;
    
    if (loggedIn) {
        localStorage.setItem('kitebot_logged_in', 'true');
        localStorage.setItem('kitebot_username', username);
        localStorage.setItem('kitebot_key', key);
        localStorage.setItem('kitebot_expiry', expiry);
    } else {
        localStorage.clear();
    }
}

// Giriş veya Kayıt başarılı olduktan sonra Key bilgilerini DOM'a yazar
function updateAuthInfo(key, expiry) {
    const trialKeyElement = document.getElementById('trial-key');
    const expiryDateElement = document.getElementById('key-expiry-date');

    if (trialKeyElement) trialKeyElement.textContent = key;
    if (expiryDateElement) {
        const date = new Date(expiry);
        expiryDateElement.textContent = date.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
    }
}

// Giriş/Kayıt Formu İşleyicisi (GERÇEK API ENTEGRASYONU)
window.handleAuth = async (e, type) => {
    e.preventDefault();
    const formId = type === 'login' ? 'login-form' : 'register-form';
    const msgId = type === 'login' ? 'login-message' : 'register-message';
    const messageElement = document.getElementById(msgId);
    
    const form = document.getElementById(formId);
    const data = {
        email: form.querySelector(`input[type="email"]`).value,
        password: form.querySelector(`input[type="password"]`).value,
    };
    if (type === 'register') {
         data.username = form.querySelector(`input[type="text"]`).value;
    }
    
    messageElement.textContent = 'Sunucuya bağlanılıyor...';
    messageElement.style.color = '#FFD700';

    try {
        const response = await fetch(`${API_BASE_URL}/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            
            // Başarılı giriş/kayıt sonrası KEY ve kullanıcı adını sakla
            const key = result.key;
            const expiry = result.expiry;
            const username = result.username; 
            
            setAuthStatus(true, username, key, expiry); 
            updateNavState();
            updateAuthInfo(key, expiry);

            messageElement.textContent = result.message + " Yönlendiriliyorsunuz...";
            messageElement.style.color = '#00FF00';

            // Profil sayfasına yönlendir
            setTimeout(() => changePage('profile'), 1000);
            
        } else {
            // Sunucu hatası (400, 409, 401 vb.)
            messageElement.textContent = `Hata: ${result.message}`;
            messageElement.style.color = '#FF0000';
        }

    } catch (error) {
        messageElement.textContent = `Ağ Hatası: Sunucuya ulaşılamıyor (${API_BASE_URL}). Flask sunucunuz çalışıyor mu?`;
        messageElement.style.color = '#FF0000';
        console.error('API Hatası:', error);
    }
}

// Çıkış İşleyicisi
window.handleLogout = () => {
    setAuthStatus(false);
    updateNavState();
    changePage('about'); // Ana sayfaya yönlendir
}

// Geri Bildirim Formu İşleyicisi (GERÇEK API ENTEGRASYONU)
window.submitFeedback = async (e) => {
    e.preventDefault();
    const feedbackText = document.getElementById('feedback-text').value;
    const feedbackType = document.querySelector('input[name="feedback-type"]:checked')?.value;
    const messageElement = document.getElementById('feedback-message');
    
    if (!feedbackType || !feedbackText) {
        messageElement.textContent = 'Lütfen tür ve içerik girin.';
        messageElement.style.color = '#FF0000';
        return;
    }
    
    messageElement.textContent = 'Geri bildiriminiz gönderiliyor...';
    messageElement.style.color = '#FFD700';

    try {
        const response = await fetch(`${API_BASE_URL}/submit_feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                key: currentKey, // Oturum açmış kullanıcının key'ini gönderiyoruz
                type: feedbackType, 
                content: feedbackText 
            })
        });

        const result = await response.json();

        if (response.ok && result.status === 'success') {
            messageElement.textContent = result.message;
            messageElement.style.color = '#00FF00';
            document.getElementById('feedback-form').reset();
        } else {
             messageElement.textContent = `Hata: ${result.message}`;
             messageElement.style.color = '#FF0000';
        }
    } catch (error) {
        messageElement.textContent = `Ağ Hatası: Geri bildirim sunucusuna ulaşılamıyor.`;
        messageElement.style.color = '#FF0000';
        console.error('API Hatası:', error);
    }
}

// Sayfa yüklendiğinde localStorage'dan durumu geri yükle
function loadInitialStatus() {
    if (localStorage.getItem('kitebot_logged_in') === 'true') {
        const key = localStorage.getItem('kitebot_key');
        const expiry = localStorage.getItem('kitebot_expiry');
        
        setAuthStatus(
            true,
            localStorage.getItem('kitebot_username'),
            key,
            expiry
        );
        updateAuthInfo(key, expiry);
    }
}


// Uygulama yüklendiğinde çalışacak ana blok
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    
    // Navigasyon linklerine olay dinleyici ekle
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPageId = e.target.getAttribute('data-page');
            changePage(targetPageId);
        });
    });

    // İlk yüklemede durumu kontrol et ve sayfayı yükle
    loadInitialStatus();
    loadPageFromHash();
    window.addEventListener('hashchange', loadPageFromHash);
});