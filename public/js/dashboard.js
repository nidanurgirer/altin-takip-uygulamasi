/* ============================
   DASHBOARD.JS — Portfolio Dashboard
   ============================ */

const Dashboard = {
  async load() {
    try {
      const data = await App.api('/api/gold/portfolio');
      this.render(data);
      Charts.render(data);
    } catch (err) {
      App.toast('Dashboard yüklenemedi: ' + err.message, 'error');
    }
  },

  render(data) {
    // Summary cards
    document.getElementById('total-weight').textContent = App.formatWeight(data.totalWeightGrams);
    document.getElementById('total-investment').textContent = App.formatMoney(data.totalInvestment);
    document.getElementById('current-value').textContent = App.formatMoney(data.currentValue);

    // Realized Profit (Cepteki Kâr) from sales
    const realizedValue = document.getElementById('realized-profit');
    if (realizedValue && data.realizedProfit !== undefined) {
      const rpSign = data.realizedProfit > 0 ? '+' : (data.realizedProfit < 0 ? '-' : '');
      const rpColor = data.realizedProfit >= 0 ? 'var(--green-400)' : 'var(--red-400)';
      realizedValue.textContent = rpSign + App.formatMoney(Math.abs(data.realizedProfit));
      realizedValue.style.color = rpColor;
    }

    // Profit/Loss
    const plValue = document.getElementById('profit-loss');
    const plPercent = document.getElementById('profit-loss-percent');
    const plCard = document.getElementById('card-profit-loss');

    const plSign = data.profitLoss >= 0 ? '+' : '';
    plValue.textContent = plSign + App.formatMoney(data.profitLoss);
    plPercent.textContent = `${plSign}%${Math.abs(data.profitLossPercent).toFixed(2)}`;

    // Remove existing classes
    plCard.classList.remove('profit', 'loss');
    plPercent.classList.remove('profit', 'loss', 'neutral');

    if (data.profitLoss > 0) {
      plCard.classList.add('profit');
      plPercent.classList.add('profit');
    } else if (data.profitLoss < 0) {
      plCard.classList.add('loss');
      plPercent.classList.add('loss');
    } else {
      plPercent.classList.add('neutral');
    }

    // Analysis
    this.renderAnalysis(data.analysis);

    // Type breakdown
    this.renderTypeBreakdown(data.byType);
  },

  renderAnalysis(analysis) {
    const badge = document.getElementById('status-badge');
    const message = document.getElementById('analysis-message');
    const advice = document.getElementById('analysis-advice');

    badge.className = 'status-badge';
    advice.classList.remove('visible');

    if (!analysis) return;

    badge.textContent = analysis.statusText || '—';
    badge.classList.add(analysis.status);
    message.textContent = analysis.message;

    if (analysis.advice) {
      advice.textContent = '💡 ' + analysis.advice;
      advice.classList.add('visible');
    }
  },

  renderTypeBreakdown(byType) {
    const container = document.getElementById('type-breakdown');

    if (!byType || Object.keys(byType).length === 0) {
      container.innerHTML = '<p class="empty-state">Henüz altın kaydınız yok. "Altın Ekle" sayfasından ilk kaydınızı oluşturun.</p>';
      return;
    }

    container.innerHTML = Object.entries(byType).map(([type, data]) => {
      const profitClass = data.profitLoss >= 0 ? 'profit' : 'loss';
      const profitSign = data.profitLoss >= 0 ? '+' : '';
      const unitLabel = data.totalQuantity === 1 ? '' : '';

      return `
        <div class="type-item">
          <div class="type-details">
            <div class="type-name">${data.name}</div>
            <div class="type-qty">${data.totalQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${unitLabel} · ${App.formatWeight(data.totalWeightGrams)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
              Alış: ₺${data.currentPricePerUnit.toLocaleString('tr-TR', {minimumFractionDigits: 2})} | Satış: ₺${(data.sellingPricePerUnit || data.currentPricePerUnit).toLocaleString('tr-TR', {minimumFractionDigits: 2})}
            </div>
          </div>
          <div class="type-values">
            <div class="type-investment">Yatırım: ${App.formatMoney(data.totalInvestment)}</div>
            <div class="type-profit ${profitClass}">${profitSign}${App.formatMoney(data.profitLoss)} (${profitSign}%${Math.abs(data.profitLossPercent).toFixed(1)})</div>
          </div>
        </div>
      `;
    }).join('');
  }
};

/* ============================
   PRICES — Live Market Prices (Auto-Refresh)
   ============================ */

const Prices = {
  eventSource: null,
  previousPrices: {},
  isActive: false,

  async load() {
    this.isActive = true;
    try {
      // Show old cached data immediately
      const data = await App.api('/api/gold/prices');
      this.render(data);
      this.startStream();
    } catch (err) {
      App.toast('Fiyatlar yüklenemedi: ' + err.message, 'error');
    }
  },

  stop() {
    this.isActive = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  },

  startStream() {
    if (this.eventSource) this.eventSource.close();

    const token = App.getToken();
    if (!token) {
      console.error('SSE: Token bulunamadı, stream başlatılamıyor.');
      return;
    }

    this.eventSource = new EventSource('/api/gold/stream?token=' + token);
    
    this.eventSource.onopen = () => console.log('✅ SSE Canlı Fiyat Akışı başladı.');
    
    this.eventSource.onmessage = (event) => {
      if (!this.isActive) return;
      try {
        const data = JSON.parse(event.data);
        this.render(data);
        
        // Harem Altın borsa flash efektleri (Sarı yanıp sönme)
        document.querySelectorAll('.live-price-item').forEach(el => {
          el.classList.remove('price-flash');
          void el.offsetWidth; // Force CSS reflow pipeline to restart animation
          el.classList.add('price-flash');
        });
      } catch (err) {
        console.error('SSE JSON ayrıştırma hatası:', err);
      }
    };

    this.eventSource.onerror = (err) => {
      console.error('SSE Akış bağlantısı koptu, yeniden deneniyor...', err);
    };
  },

  render(data) {
    const grid = document.getElementById('prices-grid');
    if (!data || !data.prices) return;

    const prices = data.prices;
    // Kullanıcının istediği kesin sıra:
    const goldTypeOrder = [
      'gram_altin',
      'ceyrek_altin',
      'yarim_altin',
      'tam_altin',
      'ata_altin',
      'ayar22_bilezik',
      'ons_altin'
    ];

    // Belirtilen sıra harici gelenler olursa listenin en sonuna at
    const remainingTypes = Object.keys(prices).filter(t => !goldTypeOrder.includes(t));
    const finalOrder = [...goldTypeOrder, ...remainingTypes];
    
    const seen = new Set();

    grid.innerHTML = finalOrder.map(typeId => {
      const info = prices[typeId];
      // Boş veri ve duplicate kontrolü
      if (!info || !info.selling || seen.has(typeId)) return '';
      seen.add(typeId);

      const changeClass = info.change > 0 ? 'up' : info.change < 0 ? 'down' : 'flat';
      const changeIcon = info.change > 0 ? '▲' : info.change < 0 ? '▼' : '●';
      const changeSign = info.change > 0 ? '+' : '';

      // Check if price changed from previous
      const prev = this.previousPrices[typeId];
      let trendClass = '';
      if (prev) {
        if (info.selling > prev) trendClass = 'trend-up';
        else if (info.selling < prev) trendClass = 'trend-down';
      }
      this.previousPrices[typeId] = info.selling;

      return `
        <div class="price-item live-price-item ${trendClass}">
          <div class="price-info" style="margin-left: 0;">
            <div class="price-name">${info.name}</div>
            <div class="price-values">
              <div class="price-row">
                <span class="price-label">Alış</span>
                <span class="price-amount">₺${info.buying.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div class="price-row">
                <span class="price-label">Satış</span>
                <span class="price-amount price-sell">₺${info.selling.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>
          <div class="price-change ${changeClass}">
            <span class="change-icon">${changeIcon}</span>
            <span class="change-value">${changeSign}%${Math.abs(info.change).toFixed(2)}</span>
          </div>
        </div>
      `;
    }).join('');

    // Update footer info
    const liveIndicator = data.live
      ? '<span class="live-dot"></span> Canlı Piyasa Verisi'
      : '⚠️ Çevrimdışı Veri';

    document.getElementById('prices-last-update').innerHTML = `
      <div class="live-footer-row">
        <div class="live-footer-left">
          <span class="live-status">${liveIndicator}</span>
          <span class="update-time">Son güncelleme: ${data.updateDate}</span>
          <span class="update-source">Kaynak: ${data.source}</span>
        </div>
        <div class="live-footer-right">
          <div class="auto-refresh-indicator">
            <span class="refresh-countdown">Otomatik Yenileme: <strong style="color:var(--green-500)">Aktif</strong></span>
          </div>
        </div>
      </div>
    `;

    // Hide save button
    const saveBtn = document.getElementById('save-prices-btn');
    if (saveBtn) saveBtn.style.display = 'none';
  }
};

/* ============================
   DASHBOARD AUTO-REFRESH
   ============================ */
(function() {
  const origDashLoad = Dashboard.load.bind(Dashboard);
  let dashTimer = null;

  Dashboard.load = async function() {
    await origDashLoad();
    // Auto-refresh dashboard every 60 seconds
    if (dashTimer) clearInterval(dashTimer);
    dashTimer = setInterval(async () => {
      try {
        const data = await App.api('/api/gold/portfolio');
        Dashboard.render(data);
        Charts.render(data);
      } catch (e) { /* silent */ }
    }, 60000);
  };

  Dashboard.stopAutoRefresh = function() {
    if (dashTimer) { clearInterval(dashTimer); dashTimer = null; }
  };
})();

