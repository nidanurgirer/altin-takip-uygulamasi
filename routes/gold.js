const express = require('express');
const { GOLD_TYPES, dbRun, dbGet, dbAll, saveDatabase } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const { io } = require('socket.io-client');

// =============================
// HAREM ALTIN LIVE WEBSOCKET
// =============================

const HAREM_KEY_MAP = {
  'KULCEALTIN': 'has_altin',
  'ALTIN':      'gram_altin',
  'CEYREK_YENI':'ceyrek_altin',
  'CEYREK_ESKI':'eski_ceyrek',
  'YARIM_YENI': 'yarim_altin',
  'YARIM_ESKI': 'eski_yarim',
  'TEK_YENI':   'tam_altin',
  'TEK_ESKI':   'eski_tam',
  'ATA_YENI':   'ata_altin',
  'ATA_ESKI':   'eski_ata',
  'AYAR14':     'ayar14_bilezik',
  'AYAR22':     'ayar22_bilezik',
  'GREMESE_YENI':'gremse_altin',
  'GREMESE_ESKI':'eski_gremse',
  'GUMUSTRY':   'gram_gumus',
  'ONS':        'ons_altin'
};

let latestPrices = {};
let sseClients = [];

// ── DB'deki fiyatlarla latestPrices'ı başlatacak fonksiyon (async) ──────────
async function initGoldPrices() {
  console.log('[GOLD ROUTE] Canlı fiyatlar veritabanından yükleniyor...');
  try {
    const dbPrices = await dbAll('SELECT * FROM current_prices');
    dbPrices.forEach(p => {
      latestPrices[p.gold_type] = {
        buying:  p.buying_price || p.price * 0.998,
        selling: p.price,
        change:  0,
        name:    GOLD_TYPES[p.gold_type]?.name || p.gold_type
      };
    });
    console.log(`[GOLD ROUTE] Canlı fiyatlar başarıyla yüklendi (${Object.keys(latestPrices).length} adet fiyat).`);
  } catch (e) {
    console.error('[GOLD ROUTE] ❌ Başlangıç fiyat yüklemesi başarısız:', e.message);
  }
}

// ── Harem Altın WebSocket bağlantısı ─────────────────────────────────────────
console.log('[GOLD ROUTE] Harem Altın Canlı Soketine bağlanılıyor...');
const haremSocket = io('wss://socket.haremaltin.com', {
  path:       '/socket.io',
  transports: ['websocket'],
  secure:     true
});

haremSocket.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[GOLD ROUTE] ✅ Harem Altın Canlı Soketine Bağlanıldı!');
  }
});

haremSocket.on('connect_error', (err) => {
  console.error('[GOLD ROUTE] ❌ Harem Altın bağlantı hatası:', err.message);
});

haremSocket.on('price_changed', (args) => {
  if (!args || !args.data) return;
  const raw = args.data;
  
  // Log raw data specifically for debugging missing types (once every 10 updates to avoid spam)
  if (Math.random() < 0.05) {
    console.log('[GOLD ROUTE] Harem Raw Keys:', Object.keys(raw).join(', '));
  }

  let updatedCount = 0;

  for (const [haremKey, ourKey] of Object.entries(HAREM_KEY_MAP)) {
    if (raw[haremKey]) {
      const item = raw[haremKey];
      const s = parseFloat(item.satis) || 0;
      const a = parseFloat(item.alis) || 0;
      if (s > 0) {
        const k = parseFloat(item.kapanis) || s;
        const change = k > 0 ? ((s - k) / k) * 100 : 0;

        latestPrices[ourKey] = {
          buying:  a,
          selling: s,
          change:  change,
          name:    GOLD_TYPES[ourKey]?.name || ourKey
        };
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0 && sseClients.length > 0) {
    const payload = JSON.stringify({
      prices:     latestPrices,
      updateDate: new Date().toISOString(),
      source:     'Harem Altın (Canlı)',
      live:       true
    });
    sseClients.forEach(client => {
      client.response.write(`data: ${payload}\n\n`);
    });
  }
});

// ── Arka planda 60 saniyede bir fiyatları veritabanına kaydet (async) ─────────
setInterval(async () => {
  if (Object.keys(latestPrices).length === 0) return;
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('[GOLD ROUTE] Güncel fiyatlar arka planda PostgreSQL\'e kaydediliyor...');
  }
  
  try {
    for (const [type, info] of Object.entries(latestPrices)) {
      await dbRun(
        'UPDATE current_prices SET price = ?, buying_price = ?, updated_at = CURRENT_TIMESTAMP WHERE gold_type = ?',
        [info.selling, info.buying, type]
      );
      const existing = await dbGet('SELECT id FROM current_prices WHERE gold_type = ?', [type]);
      if (!existing && info.selling > 0) {
        await dbRun(
          'INSERT INTO current_prices (gold_type, price, buying_price) VALUES (?, ?, ?)',
          [type, info.selling, info.buying]
        );
      }
    }
  } catch (err) {
    console.error('[GOLD ROUTE] ❌ Fiyat kaydetme hatası:', err.message);
  }
}, 60000);

// ─── Tüm route'lar authentication gerektirir ─────────────────────────────────
router.use(authenticateToken);

// GET /api/gold/types — Desteklenen altın türlerini listele
router.get('/types', (req, res) => {
  const types = Object.entries(GOLD_TYPES).map(([key, val]) => ({
    id: key,
    ...val
  }));
  res.json({ types });
});

// GET /api/gold/records — Kullanıcının kayıtlarını getir
router.get('/records', async (req, res) => {
  console.log(`[GOLD API] GET /records | Kullanıcı ID: ${req.user.id}`);
  try {
    const records = await dbAll(
      'SELECT * FROM gold_records WHERE user_id = ? ORDER BY purchase_date DESC',
      [req.user.id]
    );
    console.log(`[GOLD API] GET /records Başarılı | ${records.length} kayıt listelendi.`);
    res.json({ records });
  } catch (err) {
    console.error(`[GOLD API] GET /records Hatası (Kullanıcı ID: ${req.user.id}):`, err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// POST /api/gold/records — Yeni altın kaydı ekle
router.post('/records', async (req, res) => {
  const { transaction_type, gold_type, quantity, purchase_price_total, purchase_date, notes } = req.body;
  const tType = transaction_type || 'buy';
  
  console.log(`[GOLD API] POST /records | Kullanıcı ID: ${req.user.id} | İşlem: ${tType}, Tür: ${gold_type}, Miktar: ${quantity}`);

  try {
    if (!gold_type || !quantity || !purchase_price_total || !purchase_date) {
      console.warn('[GOLD API] Ekleme hatası: Eksik alanlar');
      return res.status(400).json({ error: 'İşlem türü, altın türü, miktar, fiyat ve tarih zorunludur.' });
    }

    if (!GOLD_TYPES[gold_type]) {
      console.warn(`[GOLD API] Ekleme hatası: Geçersiz altın türü "${gold_type}"`);
      return res.status(400).json({ error: 'Geçersiz altın türü.' });
    }

    const typeInfo = GOLD_TYPES[gold_type];
    const qty       = parseFloat(quantity);
    const priceTotal = parseFloat(purchase_price_total);

    if (qty <= 0 || priceTotal < 0) {
      console.warn('[GOLD API] Ekleme hatası: Geçersiz miktar/fiyat');
      return res.status(400).json({ error: 'Miktar sıfırdan büyük olmalıdır.' });
    }

    const weightGrams  = qty * typeInfo.weight;
    const pricePerUnit = priceTotal / qty;

    const result = await dbRun(`
      INSERT INTO gold_records (user_id, transaction_type, gold_type, quantity, weight_grams, purchase_price_total, purchase_price_per_unit, purchase_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.id, tType, gold_type, qty, weightGrams, priceTotal, pricePerUnit, purchase_date, notes || '']);

    const record = await dbGet('SELECT * FROM gold_records WHERE id = ?', [result.lastInsertRowid]);
    console.log(`[GOLD API] POST /records Başarılı | Atanan Kayıt ID: ${result.lastInsertRowid}`);
    res.status(201).json({ message: 'İşlem kaydedildi!', record });
  } catch (err) {
    console.error(`[GOLD API] POST /records Hatası (Kullanıcı ID: ${req.user.id}):`, err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// PUT /api/gold/records/:id — Kaydı güncelle
router.put('/records/:id', async (req, res) => {
  const { id } = req.params;
  const { transaction_type, gold_type, quantity, purchase_price_total, purchase_date, notes } = req.body;
  
  console.log(`[GOLD API] PUT /records/${id} | Kullanıcı ID: ${req.user.id}`);

  try {
    // Sahiplik doğrula
    const existing = await dbGet('SELECT * FROM gold_records WHERE id = ? AND user_id = ?', [parseInt(id), req.user.id]);
    if (!existing) {
      console.warn(`[GOLD API] Güncelleme hatası: Kayıt bulunamadı veya yetkisiz (ID: ${id})`);
      return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    }

    const type       = gold_type || existing.gold_type;
    const tType      = transaction_type || existing.transaction_type;
    const qty        = parseFloat(quantity || existing.quantity);
    const priceTotal = parseFloat(purchase_price_total !== undefined ? purchase_price_total : existing.purchase_price_total);
    const date       = purchase_date || existing.purchase_date;
    const note       = notes !== undefined ? notes : existing.notes;

    if (!GOLD_TYPES[type]) {
      return res.status(400).json({ error: 'Geçersiz altın türü.' });
    }

    const typeInfo     = GOLD_TYPES[type];
    const weightGrams  = qty * typeInfo.weight;
    const pricePerUnit = priceTotal / qty;

    await dbRun(`
      UPDATE gold_records
      SET transaction_type = ?, gold_type = ?, quantity = ?, weight_grams = ?, purchase_price_total = ?,
          purchase_price_per_unit = ?, purchase_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `, [tType, type, qty, weightGrams, priceTotal, pricePerUnit, date, note, parseInt(id), req.user.id]);

    const record = await dbGet('SELECT * FROM gold_records WHERE id = ?', [parseInt(id)]);
    console.log(`[GOLD API] PUT /records/${id} Başarılı.`);
    res.json({ message: 'Kayıt güncellendi!', record });
  } catch (err) {
    console.error(`[GOLD API] PUT /records/${id} Hatası:`, err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// DELETE /api/gold/records/:id — Kaydı sil
router.delete('/records/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[GOLD API] DELETE /records/${id} | Kullanıcı ID: ${req.user.id}`);

  try {
    const existing = await dbGet('SELECT * FROM gold_records WHERE id = ? AND user_id = ?', [parseInt(id), req.user.id]);
    if (!existing) {
      console.warn(`[GOLD API] Silme hatası: Kayıt bulunamadı veya yetkisiz (ID: ${id})`);
      return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    }

    await dbRun('DELETE FROM gold_records WHERE id = ? AND user_id = ?', [parseInt(id), req.user.id]);
    console.log(`[GOLD API] DELETE /records/${id} Başarılı.`);
    res.json({ message: 'Kayıt silindi.' });
  } catch (err) {
    console.error(`[GOLD API] DELETE /records/${id} Hatası:`, err);
    res.status(500).json({ error: 'Silme işlemi başarısız.' });
  }
});

// GET /api/gold/stream — SSE Canlı Altın Fiyatları
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const payload = JSON.stringify({
    prices:     latestPrices,
    updateDate: new Date().toISOString(),
    source:     'Harem Altın (Canlı WebSocket)',
    live:       true
  });
  
  res.write(`data: ${payload}\n\n`);

  const client = { id: Date.now() + Math.random(), response: res };
  sseClients.push(client);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

// GET /api/gold/prices — Anlık fiyat snapshot'ı (Fallback)
router.get('/prices', (req, res) => {
  try {
    res.json({
      prices:     latestPrices,
      updateDate: new Date().toISOString(),
      source:     'Harem Altın (Canlı)',
      live:       Object.keys(latestPrices).length > 0
    });
  } catch (err) {
    console.error('[GOLD API] Prices hatası:', err);
    res.status(500).json({ error: 'Fiyatlar alınamadı.' });
  }
});

// GET /api/gold/portfolio — Portföy hesaplamaları
router.get('/portfolio', async (req, res) => {
  console.log(`[GOLD API] GET /portfolio | Kullanıcı ID: ${req.user.id}`);
  
  try {
    const records = await dbAll('SELECT * FROM gold_records WHERE user_id = ? ORDER BY purchase_date ASC', [req.user.id]);
    const prices  = await dbAll('SELECT * FROM current_prices');

    const priceMap       = {};
    const buyingPriceMap = {};
    prices.forEach(p => { 
      priceMap[p.gold_type]       = p.price; 
      buyingPriceMap[p.gold_type] = p.buying_price || p.price * 0.998;
    });

    if (records.length === 0) {
      console.log(`[GOLD API] GET /portfolio Başarılı | Kullanıcının kaydı bulunmadığından boş portföy dönüldü.`);
      return res.json({
        totalWeightGrams:  0,
        totalInvestment:   0,
        currentValue:      0,
        profitLoss:        0,
        profitLossPercent: 0,
        realizedProfit:    0,
        byType:            {},
        recordCount:       0,
        analysis: { status: 'empty', statusText: 'Henüz Veri Yok', message: 'Henüz altın kaydınız bulunmuyor. İlk kaydınızı ekleyin!' }
      });
    }

    let totalWeightGrams = 0;
    let totalInvestment  = 0;
    let currentValue     = 0;
    let realizedProfit   = 0;
    const byType = {};

    records.forEach(record => {
      const isSell  = record.transaction_type === 'sell';
      const typeId  = record.gold_type;

      if (!byType[typeId]) {
        byType[typeId] = { weight: 0, cost: 0, qty: 0 };
      }

      if (isSell) {
        const avgCostPerGram   = byType[typeId].weight > 0 ? (byType[typeId].cost / byType[typeId].weight) : 0;
        const costOfGoodsSold  = record.weight_grams * avgCostPerGram;
        const profitFromSale   = record.purchase_price_total - costOfGoodsSold;
        realizedProfit += profitFromSale;

        byType[typeId].weight -= record.weight_grams;
        byType[typeId].cost   -= costOfGoodsSold;
        byType[typeId].qty    -= record.quantity;
      } else {
        byType[typeId].weight += record.weight_grams;
        byType[typeId].cost   += record.purchase_price_total;
        byType[typeId].qty    += record.quantity;
      }
    });

    const finalByType = {};

    for (const [typeId, data] of Object.entries(byType)) {
      if (data.weight <= 0.001) continue;
      
      const currentPrice       = priceMap[typeId] || 0;
      const currentBuyingPrice = buyingPriceMap[typeId] || (currentPrice * 0.998);
      const typeInfo           = GOLD_TYPES[typeId] || { name: typeId, icon: '🪙' };
      const value              = data.qty * currentBuyingPrice;
      
      totalWeightGrams += data.weight;
      totalInvestment  += data.cost;
      currentValue     += value;

      finalByType[typeId] = {
        name:               typeInfo.name,
        icon:               typeInfo.icon,
        totalQuantity:      data.qty,
        totalWeightGrams:   data.weight,
        totalInvestment:    data.cost,
        currentValue:       value,
        currentPricePerUnit:currentBuyingPrice,
        sellingPricePerUnit:currentPrice,
        avgPurchasePrice:   data.qty > 0 ? (data.cost / data.qty) : 0,
        profitLoss:         value - data.cost,
        profitLossPercent:  data.cost > 0 ? ((value - data.cost) / data.cost) * 100 : 0
      };
    }

    const profitLoss        = currentValue - totalInvestment;
    const profitLossPercent = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;

    let analysis = {};
    if (profitLoss > 0) {
      analysis = {
        status:     'profit',
        statusText: 'Kârdasınız! 🎉',
        message:    `Toplam yatırımınız ₺${totalInvestment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} iken güncel değeri ₺${currentValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}. %${Math.abs(profitLossPercent).toFixed(2)} kâr elde etmişsiniz.`,
        advice:     profitLossPercent > 20
          ? 'Kazancınız %20\'nin üzerinde. Kâr realizasyonu düşünebilirsiniz.'
          : 'Altın yatırımınız olumlu bir seyir izliyor. Piyasayı takip etmeye devam edin.'
      };
    } else if (profitLoss < 0) {
      analysis = {
        status:     'loss',
        statusText: 'Zararda Görünüyorsunuz 📉',
        message:    `Toplam yatırımınız ₺${totalInvestment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} iken güncel değeri ₺${currentValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}. %${Math.abs(profitLossPercent).toFixed(2)} zarar durumundasınız.`,
        advice:     Math.abs(profitLossPercent) < 5
          ? 'Zarar oranınız düşük. Altın uzun vadeli bir yatırım aracıdır, sabırlı olun.'
          : 'Ortalama maliyetinizi düşürmek için uygun fiyat seviyelerinde ek alım yapabilirsiniz.'
      };
    } else {
      analysis = {
        status:     'neutral',
        statusText: 'Başabaş Noktasındasınız ⚖️',
        message:    'Yatırımınızın güncel değeri alış tutarınıza eşit.',
        advice:     'Piyasayı izlemeye devam edin.'
      };
    }

    console.log(`[GOLD API] GET /portfolio Başarılı | Yatırım: ${totalInvestment}, Değer: ${currentValue}`);
    res.json({
      totalWeightGrams,
      totalInvestment,
      currentValue,
      profitLoss,
      profitLossPercent,
      realizedProfit,
      byType:      finalByType,
      recordCount: records.length,
      analysis
    });
  } catch (err) {
    console.error(`[GOLD API] GET /portfolio Hatası (Kullanıcı ID: ${req.user.id}):`, err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Geriye dönük uyumluluk ve güvenli başlangıç için metot ata
router.initGoldPrices = initGoldPrices;

module.exports = router;
