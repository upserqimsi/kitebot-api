import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import secrets 

# --- Güvenlik Ayarları ---
ADMIN_SECRET_KEY = "Sizin-Gizli-Admin-Sifreniz-120921" # Lütfen bu şifreyi değiştirin!
# --- Uygulama Yapılandırması ---
app = Flask(__name__)
CORS(app) 

# SQLite Veritabanı yapılandırması
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'database.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Veritabanı Modelleri ---

def generate_unique_key():
    """Benzersiz Key üretir."""
    # 4 haneli 4 bloktan oluşan rastgele key üretir (Örn: A1B2-C3D4-E5F6-G7H8)
    key_parts = [secrets.token_hex(2).upper() for _ in range(4)]
    return '-'.join(key_parts)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False) 
    key = db.Column(db.String(100), unique=True)
    key_expiry = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)
    last_ip = db.Column(db.String(45)) # YENİ SÜTUN
    last_key_issue_date = db.Column(db.DateTime) # YENİ SÜTUN

    def __repr__(self):
        return f'<User {self.username}>'

class Feedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    feedback_type = db.Column(db.String(50), nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<Feedback {self.feedback_type} by {self.user_id}>'

# Veritabanını oluşturma (Uygulama ilk kez çalıştırıldığında)
with app.app_context():
    db.create_all()

# --- Yardımcı Fonksiyonlar ---

def generate_trial_key():
    """3 günlük deneme Key'i üretir."""
    key_parts = [secrets.token_hex(2).upper() for _ in range(4)]
    key = '-'.join(key_parts)
    expiry_date = datetime.utcnow() + timedelta(days=3)
    return key, expiry_date

def get_client_ip():
    """İstemcinin IP adresini alır. Reverse proxy (örn: Nginx) arkasında güvenli çalışır."""
    if request.headers.get('X-Forwarded-For'):
        # Proxy arkasındaysa X-Forwarded-For kullan
        return request.headers.getlist('X-Forwarded-For')[0].split(',')[0].strip()
    return request.remote_addr # Normal kullanım

# --- API Uç Noktaları ---

# 1. Kayıt Uç Noktası (GÜNCELLENDİ)
@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.json
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    client_ip = get_client_ip() # İstemci IP'sini al

    if not all([username, email, password]):
        return jsonify({"status": "error", "message": "Eksik bilgi."}), 400

    # IP KISITLAMA KONTROLÜ
    # Bu IP adresinden son 30 gün içinde Key almış kullanıcı var mı?
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    # Aynı IP'den son 30 gün içinde Key almış ve Key'i hala aktif olan kullanıcıları kontrol et
    recent_user_by_ip = User.query.filter(
        User.last_ip == client_ip,
        User.last_key_issue_date > thirty_days_ago
    ).first()
    
    if recent_user_by_ip:
        return jsonify({
            "status": "error", 
            "message": "Bu IP adresi üzerinden son 30 gün içinde zaten deneme Key'i alındı. Lütfen daha sonra deneyin veya tam sürüm Key satın alın."
        }), 403

    # Kullanıcı adı veya e-posta benzersizliğini kontrol et
    if User.query.filter_by(email=email).first() or User.query.filter_by(username=username).first():
        return jsonify({"status": "error", "message": "Kullanıcı adı veya e-posta zaten mevcut."}), 409

    # Key üretimi
    new_key, expiry_date = generate_trial_key()
    
    new_user = User(
        username=username, 
        email=email, 
        password=password, 
        key=new_key,
        key_expiry=expiry_date,
        last_ip=client_ip, # YENİ: IP kaydı
        last_key_issue_date=datetime.utcnow() # YENİ: Key verme tarihini kaydet
    )

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({
            "status": "success", 
            "message": "Kayıt başarılı! 3 günlük deneme key'iniz oluşturuldu.",
            "username": username,
            "key": new_key,
            "expiry": expiry_date.strftime("%Y-%m-%d %H:%M:%S")
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"Kayıt sırasında hata oluştu: {e}"}), 500


# 2. Giriş Uç Noktası
@app.route('/api/login', methods=['POST'])
def login_user():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email).first()

    if user and user.password == password:
        return jsonify({
            "status": "success",
            "message": "Giriş başarılı.",
            "username": user.username,
            "key": user.key,
            "expiry": user.key_expiry.strftime("%Y-%m-%d %H:%M:%S") if user.key_expiry else "Sınırsız"
        })
    else:
        return jsonify({"status": "error", "message": "E-posta veya şifre hatalı."}), 401

# Kullanıcıları Listeleme Uç Noktası (GÜNCELLENDİ)
@app.route('/api/admin/users', methods=['POST'])
def admin_list_users():
    data = request.json
    admin_key = data.get('admin_key')

    # 1. Admin Şifresi Kontrolü
    if admin_key != ADMIN_SECRET_KEY:
        return jsonify({"status": "error", "message": "Yetkisiz Erişim. Admin şifresi yanlış."}), 403
    
    # 2. Tüm Kullanıcıları Çekme
    users = User.query.all()
    user_list = []
    
    for user in users:
        is_expired = user.key_expiry < datetime.utcnow() if user.key_expiry else False
        
        user_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "key": user.key,
            "key_expiry": user.key_expiry.strftime("%Y-%m-%d %H:%M:%S") if user.key_expiry else "Yok/Sınırsız",
            "status": "AKTIF" if user.is_active and not is_expired else ("SÜRESİ DOLDU" if is_expired else "İPTAL EDİLDİ"),
            "is_active": user.is_active,
            "last_ip": user.last_ip or "Bilinmiyor", 
            "last_key_issue_date": user.last_key_issue_date.strftime("%Y-%m-%d %H:%M:%S") if user.last_key_issue_date else "Bilinmiyor"
        }
        user_list.append(user_data)
        
    return jsonify({
        "status": "success",
        "total_users": len(user_list),
        "users": user_list
    }), 200

# Key İptali (Banlama) Uç Noktası
@app.route('/api/admin/invalidate_key', methods=['POST'])
def admin_invalidate_key():
    data = request.json
    admin_key = data.get('admin_key')
    key_or_username = data.get('key_or_username')

    # 1. Admin Şifresi Kontrolü
    if admin_key != ADMIN_SECRET_KEY:
        return jsonify({"status": "error", "message": "Yetkisiz Erişim. Admin şifresi yanlış."}), 403

    if not key_or_username:
        return jsonify({"status": "error", "message": "Key veya kullanıcı adı belirtilmelidir."}), 400

    # 2. Kullanıcıyı Key veya Kullanıcı Adıyla Bulma
    user = User.query.filter(
        (User.key == key_or_username) | 
        (User.username == key_or_username)
    ).first()

    if not user:
        return jsonify({"status": "error", "message": f"Key veya kullanıcı adı '{key_or_username}' bulunamadı."}), 404
    
    if not user.is_active:
        return jsonify({"status": "warning", "message": f"Kullanıcı '{user.username}' Key'i zaten pasif/iptal edilmiş."}), 200

    # 3. Key'i Pasifleştirme
    try:
        user.is_active = False
        db.session.commit()
        return jsonify({
            "status": "success",
            "message": f"Kullanıcı '{user.username}' (Key: {user.key}) Key'i başarıyla iptal edildi.",
            "username": user.username,
            "key": user.key
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"Key iptali sırasında veritabanı hatası: {e}"}), 500


# 3. Key Kontrol Uç Noktası (Bot Tarafından Kullanılacak)
@app.route('/api/check_key', methods=['POST'])
def check_key():
    data = request.json
    key = data.get('key')
    
    if not key:
        return jsonify({"status": "error", "message": "Key gerekli."}), 400

    user = User.query.filter_by(key=key).first()
    
    if not user:
        return jsonify({"status": "error", "message": "Key bulunamadı. Lütfen kontrol edin."}), 404
        
    if not user.is_active:
        return jsonify({"status": "error", "message": "Key iptal edildi. Destek ile iletişime geçin."}), 403

    if user.key_expiry and user.key_expiry < datetime.utcnow():
        return jsonify({"status": "error", "message": "Key süresi doldu. Yeni Key almanız gerekiyor."}), 403

    # Key geçerli
    return jsonify({
        "status": "success", 
        "message": "Key geçerli ve aktif.",
        "username": user.username,
        # Key süresi varsa kalan günü hesapla, yoksa (lifetime) çok büyük bir sayı göster
        "remaining_days": (user.key_expiry - datetime.utcnow()).days if user.key_expiry and user.key_expiry.year != 9999 else 9999
    })


# 4. Geri Bildirim Uç Noktası
@app.route('/api/submit_feedback', methods=['POST'])
def submit_feedback():
    data = request.json
    key = data.get('key') 
    feedback_type = data.get('type')
    content = data.get('content')

    if not all([key, feedback_type, content]):
        return jsonify({"status": "error", "message": "Eksik bilgi."}), 400

    user = User.query.filter_by(key=key).first()
    
    if not user:
        return jsonify({"status": "error", "message": "Geçersiz key ile geri bildirim gönderilemez."}), 401

    new_feedback = Feedback(
        user_id=user.id,
        feedback_type=feedback_type,
        content=content
    )

    try:
        db.session.add(new_feedback)
        db.session.commit()
        return jsonify({"status": "success", "message": "Geri bildiriminiz başarıyla alındı. Teşekkürler!"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"Geri bildirim kaydedilirken hata oluştu: {e}"}), 500
        
@app.route('/api/admin/generate', methods=['POST'])
def admin_generate_key():
    data = request.json
    admin_key = data.get('admin_key')
    duration = data.get('duration')
    assign_username = data.get('assign_to_username')

    # 1. Admin Şifresi Kontrolü
    if admin_key != ADMIN_SECRET_KEY:
        return jsonify({"status": "error", "message": "Yetkisiz Erişim. Admin şifresi yanlış."}), 403

    # 2. Süre Hesaplama
    expiry_date = None
    if duration == 'lifetime':
        expiry_date = datetime.strptime("9999-12-31", "%Y-%m-%d")
    elif duration and duration.endswith('d'):
        try:
            days = int(duration.replace('d', ''))
            expiry_date = datetime.utcnow() + timedelta(days=days)
        except ValueError:
            return jsonify({"status": "error", "message": "Geçersiz süre formatı (Örn: 1d, 7d, 30d, lifetime)."}), 400
    else:
        return jsonify({"status": "error", "message": "Geçerli bir süre (duration) belirtilmelidir."}), 400

    new_key = generate_unique_key()

    # 3. Key'i Atama veya Yeni Lisans Oluşturma
    user = None
    if assign_username:
        user = User.query.filter_by(username=assign_username).first()
        if not user:
            return jsonify({"status": "error", "message": f"Kullanıcı '{assign_username}' bulunamadı."}), 404
        
        user.key = new_key
        user.key_expiry = expiry_date
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "message": f"'{assign_username}' kullanıcısına yeni Key atandı.",
            "assigned_key": new_key,
            "expiry": expiry_date.strftime("%Y-%m-%d %H:%M:%S")
        }), 200

    else:
        temp_username = f"admin_lic_{new_key.replace('-', '')[:8]}"
        
        new_license = User(
            username=temp_username,
            email=f"{temp_username}@adminlicense.com",
            password=secrets.token_hex(16), 
            key=new_key,
            key_expiry=expiry_date
        )
        
        try:
            db.session.add(new_license)
            db.session.commit()
            return jsonify({
                "status": "success",
                "message": f"Yeni {duration} süreli lisans key'i başarıyla üretildi.",
                "generated_key": new_key,
                "expiry": expiry_date.strftime("%Y-%m-%d %H:%M:%S")
            }), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"Key üretimi sırasında veritabanı hatası: {e}"}), 500

@app.route('/api/admin/feedback', methods=['POST'])
def admin_list_feedback():
    data = request.json
    admin_key = data.get('admin_key')

    # 1. Admin Şifresi Kontrolü
    if admin_key != ADMIN_SECRET_KEY:
        return jsonify({"status": "error", "message": "Yetkisiz Erişim. Admin şifresi yanlış."}), 403
    
    # 2. Tüm Geri Bildirimleri Çekme
    feedback_entries = Feedback.query.all()
    feedback_list = []
    
    for entry in feedback_entries:
        user = User.query.filter_by(id=entry.user_id).first()
        
        feedback_data = {
            "id": entry.id,
            "user_id": entry.user_id,
            "username": user.username if user else "Kullanıcı Silinmiş",
            "feedback_type": entry.feedback_type,
            "content": entry.content,
            "timestamp": entry.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        }
        feedback_list.append(feedback_data)
        
    return jsonify({
        "status": "success",
        "total_feedback": len(feedback_list),
        "feedback": feedback_list
    }), 200

# --- Uygulamanın Çalıştırılması ---
if __name__ == '__main__':
    # Hata ayıklama modunda çalışırken, bu, veritabanını yeni sütunlarla yeniden oluşturacaktır.
    app.run(debug=True, port=5000)