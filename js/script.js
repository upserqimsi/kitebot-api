let isLoggedIn = false;
let currentUsername = "";
let currentKey = ""; // Kullanıcının aktif key'ini burada saklayacağız

// HATA ÇÖZÜMÜ: API rotaları /api ön ekiyle tanımlandığı için, BASE URL'ye /api eklenmelidir.
const API_BASE_URL = 'https://kitebot-api.onrender.com/api'; // Flask API adresiniz

// --- GLOBAL FONKSİYONLAR (Gezinti ve Görünüm) ---

/**
 * Sayfa görünümünü değiştirir ve URL hash'ini günceller.
 * Bu fonksiyon, HTML onclick olaylarında kullanılabilmesi için window'a bağlanmıştır.
 * @param {string} targetPageId - Gösterilecek sayfanın ID'si.
 */
window.changePage = (targetPageId) => {
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

    if (isLoggedIn) {
        // Giriş yapmış kullanıcı menüsü
        if (navLogin) navLogin.style.display = 'none';
        if (navProfile) navProfile.style.display = 'block';
        if (navFeedback) navFeedback.style.display = 'block';
        if (navDownload) navDownload.style.display = 'block';

        if (profileUsername) profileUsername.textContent = currentUsername;
        if (trialKeyElement) trialKeyElement.textContent = currentKey;
    } else {
        // Misafir menüsü
        if (navLogin) navLogin.style.display = 'block';
        if (navProfile) navProfile.style.display = 'none';
        if (navFeedback) navFeedback.style.display = 'none';
        if (navDownload) navDownload.style.display = 'none';
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

    window.changePage(targetId);
}

/**
 * Auth Sayfası Geçişi (Giriş/Kayıt)
 * @param {('login'|'register')} type - Gösterilecek form tipi.
 */
window.showAuth = (type) => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const title = document.getElementById('auth-title');
    
    document.querySelectorAll('.auth-toggle .toggle-btn').forEach(btn => btn.classList.remove('active'));

    if (loginForm && registerForm && title) {
        if (type === 'login') {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            title.textContent = "Kullanıcı Girişi";
            document.querySelector('.auth-toggle .toggle-btn:nth-child(1)')?.classList.add('active');
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            title.textContent = "Yeni Kullanıcı Kaydı";
            document.querySelector('.auth-toggle .toggle-btn:nth-child(2)')?.classList.add('active');
        }
    }
}

// --- API ETKİLEŞİMİ FONKSİYONLARI ---

/**
 * Kullanıcı durumu ve Key bilgilerini güncelleyen ve localStorage'a kaydeden fonksiyon
 * @param {boolean} loggedIn - Giriş yapılıp yapılmadığı.
 * @param {string} [username=""] - Kullanıcı adı.
 * @param {string} [key=""] - API Key.
 * @param {string} [expiry=""] - Key son kullanma tarihi.
 */
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
        // İYİLEŞTİRME: Yalnızca kendi key'lerimizi sileriz, tüm localStorage'ı değil.
        localStorage.removeItem('kitebot_logged_in');
        localStorage.removeItem('kitebot_username');
        localStorage.removeItem('kitebot_key');
        localStorage.removeItem('kitebot_expiry');
    }
}

/**
 * Giriş veya Kayıt başarılı olduktan sonra Key bilgilerini DOM'a yazar.
 * @param {string} key - API Key.
 * @param {string} expiry - Key son kullanma tarihi (ISO string).
 */
function updateAuthInfo(key, expiry) {
    const trialKeyElement = document.getElementById('trial-key');
    const expiryDateElement = document.getElementById('key-expiry-date');

    if (trialKeyElement) trialKeyElement.textContent = key;
    if (expiryDateElement && expiry) {
        // Hata yakalama eklendi: Eğer expiry geçerli bir tarih değilse, 'Bilinmiyor' yazar.
        try {
            const date = new Date(expiry);
            if (!isNaN(date)) {
                 expiryDateElement.textContent = date.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
            } else {
                 expiryDateElement.textContent = "Tarih Bilgisi Geçersiz";
            }
        } catch (e) {
            expiryDateElement.textContent = "Tarih Bilinmiyor";
        }
    }
}

/**
 * Giriş/Kayıt Formu İşleyicisi
 * @param {Event} e - Form event objesi.
 * @param {('login'|'register')} type - İşlem tipi.
 */
window.handleAuth = async (e, type) => {
    e.preventDefault();
    const formId = type === 'login' ? 'login-form' : 'register-form';
    const msgId = type === 'login' ? 'login-message' : 'register-message';
    const messageElement = document.getElementById(msgId);
    
    const form = document.getElementById(formId);
    if (!form || !messageElement) return;

    const data = {
        email: form.querySelector(`input[type="email"]`)?.value,
        password: form.querySelector(`input[type="password"]`)?.value,
    };
    
    if (type === 'register') {
         data.username = form.querySelector(`input[type="text"]`)?.value;
    }
    
    messageElement.textContent = 'Sunucuya bağlanılıyor...';
    messageElement.style.color = '#FFD700';

    try {
        // DÜZELTME: API_BASE_URL şimdi '/api' içerdiği için istek rotası doğru çalışacak.
        const response = await fetch(`${API_BASE_URL}/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            
            // Başarılı giriş/kayıt sonrası KEY ve kullanıcı adını sakla
            const key = result.key || currentKey; // Key'in gelmesi beklenir
            const expiry = result.expiry || localStorage.getItem('kitebot_expiry') || "";
            const username = result.username || data.username || currentUsername; // Register'da username doğrudan gelmeli
            
            setAuthStatus(true, username, key, expiry); 
            updateNavState();
            updateAuthInfo(key, expiry);

            messageElement.textContent = result.message + " Yönlendiriliyorsunuz...";
            messageElement.style.color = '#00FF00';

            // Profil sayfasına yönlendir
            setTimeout(() => window.changePage('profile'), 1000);
            
        } else {
            // Sunucu hatası (400, 409, 401 vb.)
            const errorMessage = result.message || "Bilinmeyen bir hata oluştu.";
            messageElement.textContent = `Hata: ${errorMessage}`;
            messageElement.style.color = '#FF0000';
        }

    } catch (error) {
        // HATA MESAJI: Base URL'nin doğru olduğunu hatırlatmak için güncellendi
        messageElement.textContent = `Ağ Hatası: Sunucuya ulaşılamıyor (${API_BASE_URL}). Lütfen Render.com sunucunuzun aktif olduğundan emin olun.`;
        messageElement.style.color = '#FF0000';
        console.error('API Hatası:', error);
    }
}

// Çıkış İşleyicisi
window.handleLogout = () => {
    setAuthStatus(false);
    updateNavState();
    window.changePage('about'); // Ana sayfaya yönlendir
}

// Geri Bildirim Formu İşleyicisi
window.submitFeedback = async (e) => {
    e.preventDefault();
    const feedbackText = document.getElementById('feedback-text')?.value;
    const feedbackType = document.querySelector('input[name="feedback-type"]:checked')?.value;
    const messageElement = document.getElementById('feedback-message');
    const form = document.getElementById('feedback-form');
    
    if (!feedbackType || !feedbackText || !messageElement || !form) {
        if (messageElement) {
             messageElement.textContent = 'Lütfen tür ve içerik girin.';
             messageElement.style.color = '#FF0000';
        }
        return;
    }
    
    if (!currentKey) {
        messageElement.textContent = 'Hata: Geri bildirim göndermek için giriş yapmış olmalısınız.';
        messageElement.style.color = '#FF0000';
        return;
    }

    messageElement.textContent = 'Geri bildiriminiz gönderiliyor...';
    messageElement.style.color = '#FFD700';

    try {
        // DÜZELTME: API_BASE_URL'ye '/submit_feedback' eklenirken API_BASE_URL'nin /api içerdiğinden eminiz.
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
            form.reset();
        } else {
             const errorMessage = result.message || "Bilinmeyen bir API hatası oluştu.";
             messageElement.textContent = `Hata: ${errorMessage}`;
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
            // changePage'i doğrudan window'dan çağırıyoruz
            if (targetPageId) {
                window.changePage(targetPageId);
            }
        });
    });

    // İlk yüklemede durumu kontrol et ve sayfayı yükle
    loadInitialStatus();
    updateNavState(); // Navigasyon durumunu yüklemeden hemen sonra güncelle
    loadPageFromHash();
    window.addEventListener('hashchange', loadPageFromHash);
    
    // Auth sayfasında default olarak Giriş formunu göster
    if (window.location.hash.substring(1) === 'auth') {
        window.showAuth('login');
    }

});
