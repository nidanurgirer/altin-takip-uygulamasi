require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ─── Startup Diagnostics ─────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════');
console.log('🪙  Altın Takip Uygulaması — Başlatılıyor');
console.log('════════════════════════════════════════');
console.log(`🌍 NODE_ENV    : ${process.env.NODE_ENV || 'development (varsayılan)'}`);
console.log(`📡 PORT        : ${PORT}`);
console.log(`🔗 BASE_URL    : ${process.env.BASE_URL || `http://localhost:${PORT} (varsayılan)`}`);
console.log(`🗃️  DATABASE_URL : ${process.env.DATABASE_URL ? '✅ Set edilmiş (PostgreSQL kullanılıyor)' : '❌ SET EDİLMEMİŞ — PostgreSQL bağlantısı başarısız olabilir!'}`);
console.log(`🔑 JWT_SECRET  : ${process.env.JWT_SECRET ? '✅ Set edilmiş (' + process.env.JWT_SECRET.length + ' karakter)' : '⚠️ SET EDİLMEMİŞ — Hardcoded fallback kullanılıyor'}`);
console.log('════════════════════════════════════════\n');

const goldRouter = require('./routes/gold');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public'), isProd
  ? { maxAge: '1h' }
  : {
      etag: false,
      maxAge: 0,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/gold', goldRouter);

// ─── Health check endpoint — Render ve monitoring için ───────────────────────
app.get('/api/health', async (req, res) => {
  const { Pool } = require('pg');
  let dbStatus = 'unknown';
  let userCount = null;
  try {
    const { dbGet } = require('./db/database');
    const result = await dbGet('SELECT COUNT(*) AS count FROM users', []);
    userCount = result?.count ?? 0;
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error: ' + err.message;
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    database: dbStatus,
    userCount,
    jwtConfigured: !!process.env.JWT_SECRET,
    databaseUrlConfigured: !!process.env.DATABASE_URL
  });
});

// ─── Admin / Debug Stats Endpoint ────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const { dbGet } = require('./db/database');
    
    const usersResult = await dbGet('SELECT COUNT(*) AS count FROM users', []);
    const totalUsers = parseInt(usersResult?.count || 0, 10);
    
    const recordsResult = await dbGet('SELECT COUNT(*) AS count FROM gold_records', []);
    const totalGoldRecords = parseInt(recordsResult?.count || 0, 10);

    const stats = {
      totalUsers,
      totalGoldRecords,
      databaseType: "PostgreSQL",
      serverTime: new Date().toISOString()
    };
    
    console.log('[STATS] GET /api/stats çağrıldı:', stats);
    res.json(stats);
  } catch (err) {
    console.error('[STATS] /api/stats hatası:', err.message);
    res.status(500).json({ error: 'Veriler alınamadı', details: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database then start server
async function start() {
  try {
    await initializeDatabase();

    // Canlı fiyatları veritabanından güvenle yükle (Tablolar oluştuktan sonra)
    await goldRouter.initGoldPrices();

    app.listen(PORT, () => {
      console.log(`\n✅ Sunucu başarıyla başlatıldı: http://localhost:${PORT}`);
      console.log(`🩺 Health check: http://localhost:${PORT}/api/health\n`);
    });
  } catch (err) {
    console.error('\n❌ SUNUCU BAŞLATILAMADI:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}

start();

