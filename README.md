<div align="center">

# 🪙 Altın Takip Uygulaması

**Kişisel altın yatırımlarınızı gerçek zamanlı fiyatlarla takip edin.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## 📖 Proje Açıklaması

Altın Takip Uygulaması; alım-satım işlemlerinizi kayıt altına alabileceğiniz, portföyünüzün anlık değerini görebileceğiniz ve finansal analizlere ulaşabileceğiniz modern bir web uygulamasıdır. Fiyatlar, **Harem Altın** canlı WebSocket bağlantısı üzerinden gerçek zamanlı olarak çekilir.

---

## ✨ Özellikler

| Özellik | Açıklama |
|---|---|
| 🔐 **Güvenli Kimlik Doğrulama** | JWT tabanlı oturum yönetimi, e-posta doğrulama |
| 📊 **Canlı Fiyatlar** | Harem Altın WebSocket ile anlık altın/gümüş fiyatları |
| 💼 **Portföy Yönetimi** | Alım/satım kaydı, kâr-zarar hesabı, ortalama maliyet |
| 📈 **Finansal Analiz** | Dashboard'da görsel portföy dağılımı ve yatırım analizi |
| 📧 E-posta Altyapısı | Hesap işlemleri için e-posta desteği |
| 📱 **Responsive Tasarım** | Mobil uyumlu, modern arayüz |

---

## 🛠 Kullanılan Teknolojiler

### Backend

- Node.js + Express.js - Web sunucusu ve REST API
- PostgreSQL - Kullanıcı ve yatırım verilerinin saklanması
- jsonwebtoken (JWT) - Kimlik doğrulama ve oturum yönetimi
- bcryptjs - Şifre hashleme ve güvenlik
- nodemailer - E-posta işlemleri
- dotenv - Environment variable yönetimi

### Frontend

- Vanilla HTML5 / CSS3 / JavaScript
- Responsive Tasarım (Mobil Uyumlu Arayüz)

### Deployment

- Git & GitHub - Versiyon kontrolü
- Render - Uygulama ve veritabanı barındırma
---

## 🚀 Kurulum

### Gereksinimler
- [Node.js](https://nodejs.org) v18 veya üzeri

### 1. Projeyi klonlayın
```bash
git clone https://github.com/kullanici-adi/altin-takip-uygulamasi.git
cd altin-takip-uygulamasi
```

### 2. Bağımlılıkları yükleyin
```bash
npm install
```

### 3. Environment dosyasını oluşturun
```bash
cp .env.example .env
```

`.env` dosyasını açıp aşağıdaki değerleri düzenleyin:

```env
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
JWT_SECRET=cok-guclu-bir-secret-girin
```

> **SMTP ayarları opsiyoneldir.** Boş bırakırsanız Ethereal test e-posta servisi kullanılır ve doğrulama linki terminale yazdırılır.

---

## ▶️ Çalıştırma

### Geliştirme ortamı
```bash
npm run dev
```

### Production ortamı
```bash
NODE_ENV=production node server.js
```

Sunucu başladıktan sonra tarayıcıda `http://localhost:3000` adresini açın.

---

## 🌐 Production'a Deploy

### Render.com (Ücretsiz)
1. [render.com](https://render.com) üzerinde yeni bir **Web Service** oluşturun
2. GitHub reponuzu bağlayın
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Environment Variables bölümüne `.env` içindeki değerleri ekleyin:
   - `NODE_ENV=production`
   - `BASE_URL=https://servis-adiniz.onrender.com`
   - `JWT_SECRET=guclu-secret`
   - SMTP bilgileriniz (opsiyonel)

---

## 📁 Proje Yapısı

```
altin-takip-uygulamasi/
├── server.js              # Ana sunucu, Express başlangıç noktası
├── .env                   # Environment variables (git'e eklenmez)
├── .env.example           # Şablon dosyası (git'e eklenir)
├── package.json
│
├── db/
│   └── database.js        # SQLite başlatma, helper fonksiyonlar
│
├── middleware/
│   └── auth.js            # JWT kimlik doğrulama middleware
│
├── routes/
│   ├── auth.js            # Kayıt, giriş, profil, doğrulama API'leri
│   └── gold.js            # Altın CRUD, portföy, canlı fiyat API'leri
│
├── services/
│   └── emailService.js    # Nodemailer e-posta servisi
│
├── public/                # Frontend (HTML, CSS, JS)
│   ├── index.html
│   ├── css/
│   └── js/
│
└── data/                  # SQLite veritabanı (git'e eklenmez)
    └── gold_tracker.db
```

---

## 📸 Ekran Görüntüleri

> _Ekran görüntüsü eklemek için `screenshots/` klasörüne görsel yükleyip buraya referans verin._

---

## 📄 Lisans

Bu proje [MIT](LICENSE) lisansı altında dağıtılmaktadır.
