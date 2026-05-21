const jwt = require('jsonwebtoken');

// JWT_SECRET: Render'da Environment Variables → JWT_SECRET olarak set edilmeli
// Eğer set edilmezse bu hardcoded key kullanılır — ama deploylar arası tutarsız olmaz
// çünkü kod aynı kalır. Yine de production'da mutlaka env var set edin.
const JWT_SECRET = process.env.JWT_SECRET || 'altin-takip-super-secret-jwt-key-degistirin-2024';

// Startup'ta JWT_SECRET durumunu logla
if (!process.env.JWT_SECRET) {
  console.warn('[AUTH] ⚠️ JWT_SECRET env var set edilmemiş! Hardcoded fallback key kullanılıyor.');
  console.warn('[AUTH] ⚠️ Render > Environment Variables bölümünden JWT_SECRET ekleyin!');
} else {
  console.log('[AUTH] ✅ JWT_SECRET env var\'dan okundu (uzunluk: ' + JWT_SECRET.length + ' karakter).');
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // SSE stream için query param desteği
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    console.warn('[AUTH] ❌ Token bulunamadı | URL:', req.originalUrl);
    return res.status(401).json({ error: 'Erişim reddedildi. Token bulunamadı.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Her authenticated isteği logla (debug)
    console.log(`[AUTH] ✅ Token geçerli | UserID: ${decoded.id} | Email: ${decoded.email} | URL: ${req.method} ${req.originalUrl}`);
    next();
  } catch (err) {
    // Token hatasının türünü logla
    if (err.name === 'TokenExpiredError') {
      console.warn(`[AUTH] ❌ Token süresi dolmuş | Expired: ${err.expiredAt} | URL: ${req.originalUrl}`);
      return res.status(403).json({ error: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.' });
    }
    if (err.name === 'JsonWebTokenError') {
      console.warn(`[AUTH] ❌ Geçersiz token | Hata: ${err.message} | URL: ${req.originalUrl}`);
      return res.status(403).json({ error: 'Geçersiz token. Lütfen tekrar giriş yapın.' });
    }
    console.error(`[AUTH] ❌ Token doğrulama hatası | Hata: ${err.message} | URL: ${req.originalUrl}`);
    return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş token.' });
  }
}

module.exports = { authenticateToken, JWT_SECRET };
