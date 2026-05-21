const { Pool } = require('pg');

// Gold types configuration — Harem Altın tablosundaki isimler ve sıralama birebir
const GOLD_TYPES = {
  'has_altin':     { name: 'Gram Altın',       weight: 1.00,  karat: 24, unit: 'gram', icon: '📀' },
  'gram_altin':    { name: 'Has Altın',         weight: 1.00,  karat: 24, unit: 'gram', icon: '📀' },
  'ceyrek_altin':  { name: 'Çeyrek Altın',      weight: 1.75,  karat: 22, unit: 'adet', icon: '🪙' },
  'eski_ceyrek':   { name: 'Eski Çeyrek Altın', weight: 1.75,  karat: 22, unit: 'adet', icon: '🪙' },
  'yarim_altin':   { name: 'Yarım Altın',        weight: 3.50,  karat: 22, unit: 'adet', icon: '🪙' },
  'eski_yarim':    { name: 'Eski Yarım Altın',   weight: 3.50,  karat: 22, unit: 'adet', icon: '🪙' },
  'tam_altin':     { name: 'Tam Altın',          weight: 7.00,  karat: 22, unit: 'adet', icon: '🪙' },
  'eski_tam':      { name: 'Eski Tam Altın',     weight: 7.00,  karat: 22, unit: 'adet', icon: '🪙' },
  'ata_altin':     { name: 'Ata Altın',          weight: 7.22,  karat: 22, unit: 'adet', icon: '🪙' },
  'eski_ata':      { name: 'Eski Ata Altın',     weight: 7.22,  karat: 22, unit: 'adet', icon: '🪙' },
  'ayar14_bilezik':{ name: '14 Ayar Bilezik',   weight: 1.00,  karat: 14, unit: 'gram', icon: '💍' },
  'ayar22_bilezik':{ name: '22 Ayar Bilezik',   weight: 1.00,  karat: 22, unit: 'gram', icon: '💍' },
  'gremse_altin':  { name: 'Gremse Altın',       weight: 17.50, karat: 22, unit: 'adet', icon: '🪙' },
  'eski_gremse':   { name: 'Eski Gremse Altın',  weight: 17.50, karat: 22, unit: 'adet', icon: '🪙' },
  'gram_gumus':    { name: 'Gram Gümüş',         weight: 1.00,  karat: 0,  unit: 'gram', icon: '🥈' }
};

// ─── PostgreSQL Connection Pool ───────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

console.log('[DB] PostgreSQL Pool başlatılıyor...');
if (!process.env.DATABASE_URL) {
  console.warn('[DB] ⚠️ UYARI: DATABASE_URL tanımlanmamış! Varsayılan PostgreSQL yerel ayarları kullanılacak.');
} else {
  const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':******@');
  console.log(`[DB] DATABASE_URL: ${maskedUrl}`);
}

// ─── SSL yapılandırması: Render PostgreSQL her zaman SSL gerektirir ───────────
function buildSslConfig() {
  if (!process.env.DATABASE_URL) return false; // local dev, SSL yok
  // Render ve diğer cloud PG servisleri için rejectUnauthorized: false şart
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
  // Connection pool güvenilirlik ayarları
  max: 10,                    // Maksimum bağlantı sayısı
  idleTimeoutMillis: 30000,   // 30 saniye atıl bağlantı timeout
  connectionTimeoutMillis: 10000, // 10 saniye bağlantı timeout
  keepAlive: true,            // TCP keepalive — Render idle disconnect sorununu önler
  keepAliveInitialDelayMillis: 10000
});

pool.on('error', (err) => {
  console.error('[DB] ❌ PostgreSQL pool beklenmedik hata:', err.message);
  // Pool hatasında process'i öldürme — pool kendini kurtarır
});

pool.on('connect', () => {
  console.log('[DB] ✅ Yeni PostgreSQL bağlantısı kuruldu.');
});

// ─── Parametre dönüştürücü: ? → $1, $2, … ────────────────────────────────────
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ─── Yardımcı Fonksiyonlar (async) ────────────────────────────────────────────

/**
 * INSERT / UPDATE / DELETE sorgularını çalıştırır.
 * Sadece INSERT sorgularına RETURNING id eklenir.
 */
async function dbRun(sql, params = []) {
  const converted = convertPlaceholders(sql);
  let query = converted;
  const isInsert = /^\s*INSERT\s+INTO\s+/i.test(query);

  // SADECE INSERT'e RETURNING id ekle — UPDATE/DELETE'e asla
  if (isInsert && !/RETURNING/i.test(query)) {
    query = query.replace(/;?\s*$/, ' RETURNING id');
  }

  const queryPreview = query.replace(/\s+/g, ' ').trim().substring(0, 120);
  console.log(`[DB] dbRun: "${queryPreview}" | Params: ${JSON.stringify(params)}`);

  try {
    const result = await pool.query(query, params);
    // INSERT için dönen ID, diğerleri için etkilenen satır sayısı
    const lastInsertRowid = result.rows?.[0]?.id ?? null;
    const rowCount = result.rowCount ?? 0;
    console.log(`[DB] dbRun OK | rowCount: ${rowCount} | insertId: ${lastInsertRowid}`);
    return { lastInsertRowid, rowCount };
  } catch (err) {
    console.error(`[DB] ❌ dbRun HATA: "${queryPreview}" | Hata: ${err.message}`);
    throw err;
  }
}

/**
 * Tek satır döndürür (ilk eşleşme), yoksa null.
 */
async function dbGet(sql, params = []) {
  const converted = convertPlaceholders(sql);
  const queryPreview = converted.replace(/\s+/g, ' ').trim().substring(0, 120);
  console.log(`[DB] dbGet: "${queryPreview}" | Params: ${JSON.stringify(params)}`);

  try {
    const result = await pool.query(converted, params);
    const row = result.rows[0] ?? null;
    console.log(`[DB] dbGet OK | Satır bulundu: ${row ? 'EVET (id=' + row.id + ')' : 'HAYIR'}`);
    return row;
  } catch (err) {
    console.error(`[DB] ❌ dbGet HATA: "${queryPreview}" | Hata: ${err.message}`);
    throw err;
  }
}

/**
 * Tüm eşleşen satırları dizi olarak döndürür.
 */
async function dbAll(sql, params = []) {
  const converted = convertPlaceholders(sql);
  const queryPreview = converted.replace(/\s+/g, ' ').trim().substring(0, 120);
  console.log(`[DB] dbAll: "${queryPreview}" | Params: ${JSON.stringify(params)}`);

  try {
    const result = await pool.query(converted, params);
    console.log(`[DB] dbAll OK | Toplam satır: ${result.rows.length}`);
    return result.rows;
  } catch (err) {
    console.error(`[DB] ❌ dbAll HATA: "${queryPreview}" | Hata: ${err.message}`);
    throw err;
  }
}

function saveDatabase() {
  // no-op: PostgreSQL için gerekli değil
}

// ─── Veritabanı Başlatma ──────────────────────────────────────────────────────
async function initializeDatabase() {
  console.log('[DB] Veritabanı tabloları kontrol ediliyor...');
  const client = await pool.connect();
  try {
    // ─── Tablolar sadece yoksa oluşturulur (IF NOT EXISTS) ───────────────────
    // ÖNEMLİ: DROP, TRUNCATE veya toplu DELETE asla burada bulunmuyor
    // Her deploy'da tablo içeriği KORUNUR

    // ── users tablosu ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                SERIAL PRIMARY KEY,
        username          TEXT NOT NULL UNIQUE,
        email             TEXT NOT NULL UNIQUE,
        password_hash     TEXT NOT NULL,
        is_verified       BOOLEAN DEFAULT FALSE,
        verification_token TEXT,
        token_expires_at  TIMESTAMPTZ,
        pending_email     TEXT,
        created_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[DB] ✅ users tablosu hazır.');

    // ── gold_records tablosu ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS gold_records (
        id                       SERIAL PRIMARY KEY,
        user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        transaction_type         TEXT DEFAULT 'buy',
        gold_type                TEXT NOT NULL,
        quantity                 DOUBLE PRECISION NOT NULL,
        weight_grams             DOUBLE PRECISION NOT NULL,
        purchase_price_total     DOUBLE PRECISION NOT NULL,
        purchase_price_per_unit  DOUBLE PRECISION NOT NULL,
        purchase_date            DATE NOT NULL,
        notes                    TEXT DEFAULT '',
        created_at               TIMESTAMPTZ DEFAULT NOW(),
        updated_at               TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[DB] ✅ gold_records tablosu hazır.');

    // ── current_prices tablosu ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS current_prices (
        id           SERIAL PRIMARY KEY,
        gold_type    TEXT NOT NULL UNIQUE,
        price        DOUBLE PRECISION NOT NULL,
        buying_price DOUBLE PRECISION DEFAULT 0,
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[DB] ✅ current_prices tablosu hazır.');

    // ── Schema migration: sütun ekle (varsa atla) ─────────────────────────────
    // transaction_type sütunu eski versiyonlarda yoksa ekle
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE gold_records ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'buy';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `).catch(() => {}); // Hata olursa sessizce geç

    // ── Doğrulama durumu düzeltmesi ───────────────────────────────────────────
    // SADECE: is_verified NULL olan kullanıcıları TRUE yap (geriye dönük uyumluluk)
    // Bu eski kayıtlar için tek seferlik migration — mevcut doğrulanmış kullanıcıları etkilemez
    const nullVerifiedResult = await client.query(
      'UPDATE users SET is_verified = TRUE WHERE is_verified IS NULL'
    );
    if (nullVerifiedResult.rowCount > 0) {
      console.log(`[DB] ℹ️ is_verified NULL olan ${nullVerifiedResult.rowCount} kullanıcı TRUE yapıldı.`);
    }

    // ── Süresi dolmuş verification token'ları olan ama doğrulanmamış kullanıcılar ──
    // SADECE: verification_token'ı null yapılmış (token yok = sistem onayladı demek) 
    // ama is_verified hâlâ false olan kullanıcıları düzelt
    // NOT: Bu sadece sistem arızasından kaynaklanan tutarsızlıkları düzeltir
    const expiredTokenResult = await client.query(`
      UPDATE users
      SET is_verified = TRUE, verification_token = NULL, token_expires_at = NULL
      WHERE is_verified = FALSE
        AND verification_token IS NULL
        AND token_expires_at IS NULL
    `);
    if (expiredTokenResult.rowCount > 0) {
      console.log(`[DB] ℹ️ Token bilgisi olmayan ${expiredTokenResult.rowCount} doğrulanmamış kullanıcı düzeltildi.`);
    }

    // ── Varsayılan fiyatları ekle (tablo boşsa) ───────────────────────────────
    const countResult = await client.query('SELECT COUNT(*) AS count FROM current_prices');
    const count = parseInt(countResult.rows[0].count, 10);

    if (count === 0) {
      console.log('[DB] current_prices tablosu boş, varsayılan fiyatlar ekleniyor...');
      const defaultPrices = {
        'gram_altin':    6700,
        'ceyrek_altin':  11000,
        'eski_ceyrek':   11000,
        'yarim_altin':   21800,
        'eski_yarim':    21600,
        'tam_altin':     44000,
        'eski_tam':      43800,
        'ata_altin':     45200,
        'eski_ata':      45000,
        'ayar14_bilezik':3680,
        'ayar22_bilezik':6120,
        'gremse_altin':  109000,
        'eski_gremse':   108000,
        'gram_gumus':    105
      };
      for (const [type, price] of Object.entries(defaultPrices)) {
        await client.query(
          'INSERT INTO current_prices (gold_type, price) VALUES ($1, $2) ON CONFLICT (gold_type) DO NOTHING',
          [type, price]
        );
      }
      console.log('[DB] ✅ Varsayılan fiyatlar eklendi.');
    }

    // ── Eski gold_type isimlerini güncelle (eski kayıtlar için migration) ─────
    const oldToNew = [
      ['gram',        'gram_altin'],
      ['ceyrek',      'ceyrek_altin'],
      ['ceyrek_yeni', 'ceyrek_altin'],
      ['ceyrek_eski', 'eski_ceyrek'],
      ['yarim',       'yarim_altin'],
      ['yarim_yeni',  'yarim_altin'],
      ['yarim_eski',  'eski_yarim'],
      ['tam',         'tam_altin'],
      ['tam_yeni',    'tam_altin'],
      ['tam_eski',    'eski_tam'],
      ['cumhuriyet',  'ata_altin'],
      ['ata',         'ata_altin'],
      ['ata_yeni',    'ata_altin'],
      ['ata_eski',    'eski_ata'],
      ['ata5_yeni',   'ata_altin'],
      ['ata5_eski',   'eski_ata'],
      ['bilezik22',   'ayar22_bilezik'],
      ['ayar14',      'ayar14_bilezik'],
      ['gremese_yeni','gremse_altin'],
      ['kulce',       'gram_altin'],
      ['resat',       'ata_altin'],
      ['ayar18',      'ayar22_bilezik']
    ];

    for (const [oldT, newT] of oldToNew) {
      const r = await client.query(
        'UPDATE gold_records SET gold_type = $1 WHERE gold_type = $2',
        [newT, oldT]
      );
      if (r.rowCount > 0) {
        console.log(`[DB] ℹ️ Migration: "${oldT}" → "${newT}" (${r.rowCount} kayıt güncellendi)`);
      }
      await client.query(
        'DELETE FROM current_prices WHERE gold_type = $1',
        [oldT]
      );
    }

    // ── Son durum logu ────────────────────────────────────────────────────────
    const userCount = await client.query('SELECT COUNT(*) AS count FROM users');
    const recordCount = await client.query('SELECT COUNT(*) AS count FROM gold_records');
    console.log(`[DB] ✅ Veritabanı hazır | Kullanıcılar: ${userCount.rows[0].count} | Kayıtlar: ${recordCount.rows[0].count}`);

  } catch (err) {
    console.error('[DB] ❌ initializeDatabase hatası:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initializeDatabase, GOLD_TYPES, dbRun, dbGet, dbAll, saveDatabase };
