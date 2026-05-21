const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

function generateVerificationToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  return { token, expiresAt };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  console.log(`[AUTH API] Register isteği geldi | Username: "${username}", Email: "${email}"`);

  try {
    if (!username || !email || !password) {
      console.warn('[AUTH API] Register hatası: Eksik alanlar');
      return res.status(400).json({ error: 'Tüm alanlar zorunludur.' });
    }

    if (username.length < 3) {
      console.warn('[AUTH API] Register hatası: Kullanıcı adı çok kısa');
      return res.status(400).json({ error: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
    }

    if (password.length < 6) {
      console.warn('[AUTH API] Register hatası: Şifre çok kısa');
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    // Check if user exists (Case-insensitive)
    console.log('[AUTH API] Var olan kullanıcı kontrol ediliyor...');
    const existing = await dbGet(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)',
      [username, email]
    );

    if (existing) {
      console.warn(`[AUTH API] Register hatası: Kullanıcı adı veya email zaten kayıtlı (ID: ${existing.id})`);
      return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten kayıtlı.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // E-posta servisinin test/dev modunda olup olmadığını kontrol et
    const skipVerification = emailService.isTestMode;
    const isVerified = skipVerification ? true : false;
    const { token: vToken, expiresAt } = skipVerification ? { token: null, expiresAt: null } : generateVerificationToken();

    console.log(`[AUTH API] Yeni kullanıcı veritabanına ekleniyor (is_verified: ${isVerified})...`);
    
    const result = await dbRun(
      'INSERT INTO users (username, email, password_hash, is_verified, verification_token, token_expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, isVerified, vToken, expiresAt]
    );

    const newUserId = result.lastInsertRowid;
    console.log(`[AUTH API] Kullanıcı başarıyla oluşturuldu. Atanan ID: ${newUserId}`);

    if (skipVerification) {
      console.log('[AUTH API] E-posta doğrulama atlandı (Test modu), JWT üretiliyor...');
      const token = jwt.sign(
        { id: newUserId, username, email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return res.status(201).json({
        message: 'Kayıt başarılı! (Geliştirme modu: Doğrulama atlandı)',
        requiresVerification: false,
        token,
        user: { id: newUserId, username, email }
      });
    } else {
      console.log(`[AUTH API] Doğrulama e-postası gönderiliyor: "${email}"...`);
      emailService.sendVerificationEmail(email, vToken).catch(err => {
        console.error('[AUTH API] ❌ Doğrulama e-postası gönderme hatası:', err.message);
      });

      return res.status(201).json({
        message: 'Kayıt başarılı! Lütfen e-postanıza gönderilen doğrulama bağlantısına tıklayın.',
        requiresVerification: true,
        email: email
      });
    }
  } catch (err) {
    console.error('[AUTH API] ❌ Register hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(`[AUTH API] ════ Login isteği ════`);
  console.log(`[AUTH API] Email: "${email}" | Password uzunluğu: ${password ? password.length : 0}`);

  try {
    if (!email || !password) {
      console.warn('[AUTH API] Login hatası: Eksik alanlar');
      return res.status(400).json({ error: 'E-posta ve şifre gereklidir.' });
    }

    // Toplam kullanıcı sayısını logla — database erişilebilir mi?
    const totalUsers = await dbGet('SELECT COUNT(*) AS count FROM users', []);
    console.log(`[AUTH API] Veritabanındaki toplam kullanıcı: ${totalUsers?.count ?? 'SORGU BAŞARISIZ'}`);

    // SELECT user (Case-insensitive email match)
    console.log(`[AUTH API] Kullanıcı aranıyor: LOWER(email) = LOWER('${email}')`);
    const user = await dbGet('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);

    if (!user) {
      // Ek diagnostic: email tam eşleşme dene
      const exactUser = await dbGet('SELECT id, email, is_verified FROM users WHERE email = ?', [email]);
      if (exactUser) {
        console.warn(`[AUTH API] ⚠️ Tam eşleşme bulundu ama LOWER() ile bulunamadı! DB collation sorunu? User: ${JSON.stringify(exactUser)}`);
      } else {
        console.warn(`[AUTH API] Login hatası: Kullanıcı bulunamadı ("${email}") — Veritabanında bu email yok.`);
        // İlk 3 kullanıcıyı listele (debug)
        const sampleUsers = await dbGet('SELECT id, email, is_verified FROM users LIMIT 3', []);
        console.warn(`[AUTH API] Örnek kayıt:`, JSON.stringify(sampleUsers));
      }
      return res.status(401).json({ error: 'Kullanıcı Bulunamadı.' });
    }

    console.log(`[AUTH API] Kullanıcı bulundu | ID: ${user.id} | Email: ${user.email} | is_verified: ${user.is_verified}`);
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.warn(`[AUTH API] Login hatası: Şifre geçersiz (Kullanıcı ID: ${user.id})`);
      return res.status(401).json({ error: 'Şifre hatalı.' });
    }

    // is_verified kontrolü (PostgreSQL'de boolean tipi)
    if (!user.is_verified) {
      console.warn(`[AUTH API] Login reddedildi: Kullanıcı doğrulanmamış (Kullanıcı ID: ${user.id})`);
      const now = new Date();
      const tokenExpired = !user.token_expires_at || new Date(user.token_expires_at) < now;

      if (tokenExpired) {
        console.log(`[AUTH API] Doğrulama token süresi dolmuş. Yeni token üretiliyor...`);
        const { token: vToken, expiresAt } = generateVerificationToken();
        await dbRun('UPDATE users SET verification_token = ?, token_expires_at = ? WHERE id = ?', [vToken, expiresAt, user.id]);

        emailService.sendVerificationEmail(user.email, vToken).catch(err => {
          console.error('[AUTH API] ❌ Yeni doğrulama e-postası gönderme hatası:', err.message);
        });

        return res.status(403).json({
          error: 'Doğrulama bağlantınızın süresi dolmuştu. Yeni bir bağlantı gönderdik, lütfen e-postanızı kontrol edin.',
          requiresVerification: true,
          email: user.email
        });
      }

      return res.status(403).json({
        error: 'Hesabınız henüz doğrulanmamış. Lütfen e-postanıza gönderilen bağlantıya tıklayın.',
        requiresVerification: true,
        email: user.email
      });
    }

    console.log(`[AUTH API] ✅ Giriş başarılı! JWT üretiliyor | UserID: ${user.id}`);
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Giriş başarılı!',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('[AUTH API] ❌ Login hatası:', err.message, err.stack);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


// GET /api/auth/profile
router.get('/profile', authenticateToken, async (req, res) => {
  console.log(`[AUTH API] Profil isteği geldi | Kullanıcı ID: ${req.user.id}`);
  try {
    const user = await dbGet('SELECT id, username, email, pending_email, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      console.warn(`[AUTH API] Profil hatası: Kullanıcı bulunamadı (ID: ${req.user.id})`);
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }
    res.json({ user });
  } catch (err) {
    console.error(`[AUTH API] Profil çekme hatası (ID: ${req.user.id}):`, err.message);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, async (req, res) => {
  const { username, email, currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  console.log(`[AUTH API] Profil güncelleme isteği geldi | Kullanıcı ID: ${userId}`);

  try {
    if (!username || !email || !currentPassword) {
      return res.status(400).json({ error: 'Kullanıcı adı, e-posta ve mevcut şifre zorunludur.' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
    }

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Mevcut şifre hatalı.' });
    }

    // Email / Username collision check (Case-insensitive)
    const existing = await dbGet(
      'SELECT id FROM users WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)) AND id != ?',
      [username, email, userId]
    );
    if (existing) {
      return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta başka bir hesap tarafından kullanılıyor.' });
    }

    let passwordHash = user.password_hash;
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
      }
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(newPassword, salt);
    }

    const emailChanged = email.toLowerCase() !== user.email.toLowerCase();

    if (emailChanged) {
      console.log(`[AUTH API] E-posta değişti. Doğrulama tokeni üretiliyor...`);
      const { token: vToken, expiresAt } = generateVerificationToken();
      await dbRun(
        'UPDATE users SET username = ?, password_hash = ?, verification_token = ?, token_expires_at = ?, pending_email = ? WHERE id = ?',
        [username, passwordHash, vToken, expiresAt, email, userId]
      );

      emailService.sendVerificationEmail(email, vToken).catch(err => {
        console.error('[AUTH API] ❌ Değişiklik doğrulama e-postası gönderme hatası:', err.message);
      });

      const jwtToken = jwt.sign(
        { id: userId, username, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        message: 'Kullanıcı adı/şifre güncellendi. Yeni e-postanıza bir doğrulama bağlantısı gönderildi.',
        token: jwtToken,
        user: { id: userId, username, email: user.email, pending_email: email }
      });
    } else {
      await dbRun(
        'UPDATE users SET username = ?, password_hash = ? WHERE id = ?',
        [username, passwordHash, userId]
      );
      
      const jwtToken = jwt.sign(
        { id: userId, username, email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        message: 'Profil başarıyla güncellendi.',
        token: jwtToken,
        user: { id: userId, username, email }
      });
    }
  } catch (err) {
    console.error(`[AUTH API] ❌ Profil güncelleme hatası (ID: ${userId}):`, err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// DELETE /api/auth/profile
router.delete('/profile', authenticateToken, async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;
  console.log(`[AUTH API] Profil silme isteği geldi | Kullanıcı ID: ${userId}`);

  try {
    if (!password) {
      return res.status(400).json({ error: 'Hesabınızı silmek için şifrenizi girmelisiniz.' });
    }

    const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Şifre hatalı.' });
    }

    console.log(`[AUTH API] Kullanıcının tüm kayıtları siliniyor (Kullanıcı ID: ${userId})...`);
    await dbRun('DELETE FROM gold_records WHERE user_id = ?', [userId]);
    await dbRun('DELETE FROM users WHERE id = ?', [userId]);
    
    console.log(`[AUTH API] Hesap başarıyla silindi (Kullanıcı ID: ${userId}).`);
    res.json({ message: 'Hesabınız başarıyla silindi.' });
  } catch (err) {
    console.error(`[AUTH API] ❌ Profil silme hatası (ID: ${userId}):`, err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// POST /api/auth/verify-token
router.post('/verify-token', async (req, res) => {
  const { token } = req.body;
  console.log(`[AUTH API] verify-token isteği | Token: "${token}"`);
  
  try {
    if (!token) {
      return res.status(400).json({ error: 'Doğrulama bağlantısı geçersiz.' });
    }

    const user = await dbGet('SELECT * FROM users WHERE verification_token = ?', [token]);
    if (!user) {
      console.warn(`[AUTH API] verify-token hatası: Token bulunamadı ("${token}")`);
      return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş bağlantı.' });
    }

    const now = new Date();
    if (user.token_expires_at && new Date(user.token_expires_at) < now) {
      console.warn(`[AUTH API] verify-token hatası: Token süresi dolmuş (Kullanıcı ID: ${user.id})`);
      return res.status(400).json({ error: 'Bu bağlantının süresi dolmuş. Lütfen yeni bir bağlantı isteyin.' });
    }

    let finalEmail = user.email;

    if (user.pending_email) {
      finalEmail = user.pending_email;
      console.log(`[AUTH API] Yeni e-posta adresi onaylanıyor: "${finalEmail}" (Kullanıcı ID: ${user.id})`);
      await dbRun(
        'UPDATE users SET email = ?, pending_email = NULL, verification_token = NULL, token_expires_at = NULL, is_verified = ? WHERE id = ?',
        [finalEmail, true, user.id]
      );
    } else {
      console.log(`[AUTH API] Yeni üyelik e-posta adresi onaylanıyor: "${finalEmail}" (Kullanıcı ID: ${user.id})`);
      await dbRun(
        'UPDATE users SET is_verified = ?, verification_token = NULL, token_expires_at = NULL WHERE id = ?',
        [true, user.id]
      );
    }

    const jwtToken = jwt.sign(
      { id: user.id, username: user.username, email: finalEmail },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[AUTH API] E-posta doğrulama başarılı! JWT token üretildi.`);
    res.json({
      message: 'E-posta adresiniz başarıyla doğrulandı!',
      token: jwtToken,
      user: { id: user.id, username: user.username, email: finalEmail }
    });
  } catch (err) {
    console.error('[AUTH API] ❌ verify-token hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  console.log(`[AUTH API] resend-verification isteği | Email: "${email}"`);

  try {
    if (!email) return res.status(400).json({ error: 'E-posta adresi gerekli.' });

    // Case-insensitive lookup
    const user = await dbGet('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(pending_email) = LOWER(?)', [email, email]);
    if (!user) {
      console.log(`[AUTH API] resend-verification: Kullanıcı bulunamadı ama güvenlik sebebiyle başarı dönüldü.`);
      return res.json({ message: 'Bağlantı gönderildi (Güvenlik gereği hesap bilgisi paylaşılmaz).' });
    }

    if (user.is_verified && !user.pending_email) {
      console.warn(`[AUTH API] resend-verification reddedildi: Kullanıcı zaten onaylanmış (ID: ${user.id})`);
      return res.status(400).json({ error: 'Bu hesap zaten doğrulanmış.' });
    }

    const { token: vToken, expiresAt } = generateVerificationToken();
    await dbRun('UPDATE users SET verification_token = ?, token_expires_at = ? WHERE id = ?', [vToken, expiresAt, user.id]);

    const targetEmail = user.pending_email || user.email;
    console.log(`[AUTH API] Doğrulama linki tekrar gönderiliyor: "${targetEmail}"`);
    emailService.sendVerificationEmail(targetEmail, vToken).catch(err => {
      console.error('[AUTH API] ❌ resend-verification e-posta hatası:', err.message);
    });

    res.json({ message: 'Doğrulama bağlantısı e-posta adresinize tekrar gönderildi.' });
  } catch (err) {
    console.error('[AUTH API] ❌ resend-verification hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

module.exports = router;
