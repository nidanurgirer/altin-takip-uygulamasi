/* ============================
   RECORDS.JS — Gold CRUD UI (Pro Analysis Cards)
   ============================ */

const Records = {
  records: [],
  goldTypes: null,
  currentPrices: {},
  sparkCharts: {}, // Track Chart.js instances to destroy on re-render

  async load() {
    try {
      const [recordsData, typesData, pricesData] = await Promise.all([
        App.api('/api/gold/records'),
        App.api('/api/gold/types'),
        App.api('/api/gold/prices')
      ]);

      this.records = recordsData.records;
      this.goldTypes = {};
      typesData.types.forEach(t => { this.goldTypes[t.id] = t; });

      // Build price map: gold_type -> buying price
      if (pricesData && pricesData.prices) {
        Object.entries(pricesData.prices).forEach(([typeId, info]) => {
          this.currentPrices[typeId] = {
            buying: info.buying || 0,
            selling: info.selling || 0
          };
        });
      }

      this.render();
    } catch (err) {
      App.toast('Kayıtlar yüklenemedi: ' + err.message, 'error');
    }
  },

  // Destroy all existing sparkline charts to avoid canvas reuse errors
  destroyCharts() {
    Object.values(this.sparkCharts).forEach(chart => {
      try { chart.destroy(); } catch(e) {}
    });
    this.sparkCharts = {};
  },

  render() {
    const grid = document.getElementById('records-cards-grid');
    const tbody = document.getElementById('records-tbody');
    this.destroyCharts();

    if (!this.records || this.records.length === 0) {
      // Empty state for both
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Henüz işlem kaydınız yok.</td></tr>';
      }
      grid.innerHTML = `
        <div class="records-empty-state">
          <p>Henüz işlem kaydınız yok.</p>
          <span>"Altın Ekle" sayfasından ilk kaydınızı oluşturun.</span>
        </div>
      `;
      return;
    }

    // ── Özet Tablo ──
    if (tbody) {
      tbody.innerHTML = this.records.map(rec => {
        const typeInfo = this.goldTypes[rec.gold_type] || { name: rec.gold_type, unit: 'adet', icon: '🪙' };
        const isSell = (rec.transaction_type || 'buy') === 'sell';
        const unitLabel = typeInfo.unit === 'gram' ? 'g' : ' adet';
        const qty = typeInfo.unit === 'gram'
          ? rec.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
          : rec.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

        const badgeClass = isSell ? 'sell' : 'buy';
        const badgeLabel = isSell ? 'SATIŞ' : 'ALIŞ';
        const totalSign = isSell ? '+' : '-';
        const totalColor = isSell ? 'var(--green-400)' : '';

        return `
          <tr data-id="${rec.id}">
            <td>
              <div class="record-type-cell">
                <span class="transaction-badge center ${badgeClass}">${badgeLabel}</span>
                <span>${typeInfo.name}</span>
              </div>
            </td>
            <td>${qty}${unitLabel}</td>
            <td>${App.formatMoney(rec.purchase_price_per_unit)}</td>
            <td style="color: ${totalColor}"><strong>${totalSign}${App.formatMoney(rec.purchase_price_total)}</strong></td>
            <td>${App.formatDate(rec.purchase_date)}</td>
            <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${rec.notes || ''}">${rec.notes || '—'}</td>
            <td>
              <div class="record-actions">
                <button class="btn-edit" onclick="Records.editRecord(${rec.id})" title="Düzenle" style="display:flex; align-items:center; justify-content:center;">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-danger" onclick="Records.deleteRecord(${rec.id})" title="Sil" style="display:flex; align-items:center; justify-content:center;">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    grid.innerHTML = this.records.map((rec, idx) => {
      const typeInfo = this.goldTypes[rec.gold_type] || { name: rec.gold_type, unit: 'adet', icon: '🪙' };
      const isSell = (rec.transaction_type || 'buy') === 'sell';
      const unitLabel = typeInfo.unit === 'gram' ? 'g' : ' adet';
      const qty = typeInfo.unit === 'gram'
        ? rec.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
        : rec.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

      // Current price for this gold type
      const priceInfo = this.currentPrices[rec.gold_type] || { buying: 0, selling: 0 };
      const currentBuyingPrice = priceInfo.buying || 0;

      // Per-transaction financial calcs
      const totalInvestment = rec.purchase_price_total || 0;
      const pricePerUnit = rec.purchase_price_per_unit || 0;
      let currentValue = 0;
      let profitLoss = 0;
      let profitLossPercent = 0;
      let hasCurrentPrice = currentBuyingPrice > 0;

      if (!isSell) {
        // Buy: current value = quantity * currentBuyingPrice
        currentValue = rec.quantity * currentBuyingPrice;
        profitLoss = currentValue - totalInvestment;
        profitLossPercent = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;
      } else {
        // Sell: already realized — show what was received vs. no "current value" concept
        currentValue = totalInvestment; // sold amount received
        profitLoss = 0;
        profitLossPercent = 0;
        hasCurrentPrice = false;
      }

      const isProfit = profitLoss > 0;
      const isLoss = profitLoss < 0;
      const plClass = isProfit ? 'profit' : isLoss ? 'loss' : 'neutral';
      const plSign = isProfit ? '+' : '';

      const badgeClass = isSell ? 'sell' : 'buy';
      const badgeLabel = isSell ? 'SATIŞ' : 'ALIŞ';

      // Sparkline chart data points (investment bar vs current value)
      const chartId = `spark-chart-${rec.id}-${idx}`;

      return `
        <div class="rec-card ${plClass}-card" data-id="${rec.id}">
          <!-- Card Header -->
          <div class="rec-card-header">
            <div class="rec-card-title-row">
              <div class="rec-type-badge-wrap">
                <span class="rec-transaction-badge ${badgeClass}">${badgeLabel}</span>
                <span class="rec-gold-name">${typeInfo.name}</span>
              </div>
              <div class="rec-date">${App.formatDate(rec.purchase_date)}</div>
            </div>
          </div>

          <!-- Sparkline Chart -->
          <div class="rec-spark-container">
            <canvas id="${chartId}" class="rec-sparkline"></canvas>
            ${!hasCurrentPrice && !isSell ? '<div class="rec-no-price-overlay">Fiyat verisi bekleniyor...</div>' : ''}
            ${isSell ? '<div class="rec-sell-overlay">✅ Gerçekleşmiş Satış</div>' : ''}
          </div>

          <!-- Stats Grid -->
          <div class="rec-stats-grid">
            <div class="rec-stat">
              <span class="rec-stat-label">Miktar</span>
              <span class="rec-stat-value">${qty}${unitLabel}</span>
            </div>
            <div class="rec-stat">
              <span class="rec-stat-label">Birim Fiyat</span>
              <span class="rec-stat-value">${App.formatMoney(pricePerUnit)}</span>
            </div>
            <div class="rec-stat">
              <span class="rec-stat-label">${isSell ? 'Satıştan Alınan' : 'Toplam Yatırım'}</span>
              <span class="rec-stat-value">${App.formatMoney(totalInvestment)}</span>
            </div>
            ${!isSell ? `
            <div class="rec-stat">
              <span class="rec-stat-label">Güncel Değer</span>
              <span class="rec-stat-value ${hasCurrentPrice ? '' : 'muted'}">${hasCurrentPrice ? App.formatMoney(currentValue) : '—'}</span>
            </div>
            ` : `
            <div class="rec-stat">
              <span class="rec-stat-label">Durum</span>
              <span class="rec-stat-value" style="color: var(--green-500);">Bozduruldu</span>
            </div>
            `}
          </div>

          <!-- P&L Row -->
          ${!isSell && hasCurrentPrice ? `
          <div class="rec-pl-row ${plClass}">
            <div class="rec-pl-label">
              ${isProfit ? '📈 Kâr' : isLoss ? '📉 Zarar' : '⚖️ Başabaş'}
            </div>
            <div class="rec-pl-values">
              <span class="rec-pl-amount">${plSign}${App.formatMoney(Math.abs(profitLoss))}</span>
              <span class="rec-pl-percent">${plSign}%${Math.abs(profitLossPercent).toFixed(2)}</span>
            </div>
          </div>
          ` : isSell ? `
          <div class="rec-pl-row sell-realized">
            <div class="rec-pl-label">💰 Gerçekleşen İşlem</div>
            <div class="rec-pl-values">
              <span class="rec-pl-amount">${App.formatMoney(totalInvestment)}</span>
            </div>
          </div>
          ` : `
          <div class="rec-pl-row neutral">
            <div class="rec-pl-label">⏳ Fiyat bekleniyor</div>
            <div class="rec-pl-values"><span class="rec-pl-amount">—</span></div>
          </div>
          `}

          <!-- Notes -->
          ${rec.notes ? `<div class="rec-notes" title="${rec.notes}">📝 ${rec.notes}</div>` : ''}

          <!-- Actions -->
          <div class="rec-actions">
            <button class="rec-btn-edit" onclick="Records.editRecord(${rec.id})" title="Düzenle">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Düzenle
            </button>
            <button class="rec-btn-delete" onclick="Records.deleteRecord(${rec.id})" title="Sil">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Sil
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Render sparkline charts after DOM is updated
    requestAnimationFrame(() => {
      this.records.forEach((rec, idx) => {
        const chartId = `spark-chart-${rec.id}-${idx}`;
        this.renderSparkChart(chartId, rec);
      });
    });
  },

  renderSparkChart(chartId, rec) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;

    const isSell = (rec.transaction_type || 'buy') === 'sell';
    const priceInfo = this.currentPrices[rec.gold_type] || { buying: 0, selling: 0 };
    const currentBuyingPrice = priceInfo.buying || 0;
    const totalInvestment = rec.purchase_price_total || 0;
    const currentValue = !isSell ? rec.quantity * currentBuyingPrice : totalInvestment;
    const hasPrice = currentBuyingPrice > 0;

    const isProfit = !isSell && hasPrice && currentValue > totalInvestment;
    const isLoss = !isSell && hasPrice && currentValue < totalInvestment;

    // Color palette
    let gradColor, borderColor;
    if (isSell) {
      gradColor = 'rgba(212, 168, 53, 0.5)';
      borderColor = 'rgba(212, 168, 53, 0.9)';
    } else if (isProfit) {
      gradColor = 'rgba(16, 185, 129, 0.4)';
      borderColor = 'rgba(16, 185, 129, 0.9)';
    } else if (isLoss) {
      gradColor = 'rgba(244, 63, 94, 0.4)';
      borderColor = 'rgba(244, 63, 94, 0.9)';
    } else {
      gradColor = 'rgba(161, 161, 170, 0.3)';
      borderColor = 'rgba(161, 161, 170, 0.7)';
    }

    // Generate a smooth sparkline — simulate a price journey
    // We'll create a representative bar chart showing investment vs current value
    const ctx = canvas.getContext('2d');

    let labels, datasets;

    if (isSell) {
      labels = ['Satış Tutarı'];
      datasets = [{
        label: 'Satış Tutarı',
        data: [totalInvestment],
        backgroundColor: 'rgba(212, 168, 53, 0.25)',
        borderColor: 'rgba(212, 168, 53, 0.8)',
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false
      }];
    } else {
      labels = ['Yatırım', 'Güncel Değer', 'Kâr / Zarar'];
      const investColor = 'rgba(212, 168, 83, 0.25)';
      const investBorder = 'rgba(212, 168, 83, 0.8)';
      
      const valueColor = 'rgba(249, 194, 58, 0.35)';
      const valueBorder = 'rgba(249, 194, 58, 0.9)';

      const plValue = hasPrice ? (currentValue - totalInvestment) : 0;
      const plColor = plValue >= 0 ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)';
      const plBorder = plValue >= 0 ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';

      datasets = [{
        label: 'Yatırım',
        data: [totalInvestment, null, null],
        backgroundColor: investColor,
        borderColor: investBorder,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false
      }, {
        label: 'Güncel Değer',
        data: [null, hasPrice ? currentValue : 0, null],
        backgroundColor: valueColor,
        borderColor: valueBorder,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false
      }, {
        label: 'Kâr / Zarar',
        data: [null, null, plValue],
        backgroundColor: plColor,
        borderColor: plBorder,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false
      }];
    }

    const chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(13, 13, 20, 0.95)',
            titleColor: '#eaeaf0',
            bodyColor: '#d4a853',
            borderColor: 'rgba(212, 168, 83, 0.2)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 6,
            titleFont: { family: 'Inter', weight: '600', size: 11 },
            bodyFont: { family: 'Inter', weight: '700', size: 12 },
            callbacks: {
              label: function(context) {
                return '₺' + (context.raw || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.02)', drawBorder: false },
            ticks: {
              color: '#8888a0',
              font: { family: 'Inter', size: 9, weight: '500' }
            }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.02)', drawBorder: false },
            ticks: {
              color: '#8888a0',
              font: { family: 'Inter', size: 8 },
              callback: function(val) {
                const absVal = Math.abs(val);
                if (absVal >= 1000000) return (val / 1000000).toFixed(1) + 'M ₺';
                if (absVal >= 1000) return (val / 1000).toFixed(0) + 'K ₺';
                return val + ' ₺';
              }
            }
          }
        }
      }
    });

    this.sparkCharts[chartId] = chart;
  },

  editRecord(id) {
    const record = this.records.find(r => r.id === id);
    if (!record) return;
    GoldForm.setEditMode(record);
    App.navigateTo('add');
  },

  async deleteRecord(id) {
    if (!confirm('Bu kaydı silmek istediğinizden emin misiniz?')) return;
    try {
      await App.api(`/api/gold/records/${id}`, { method: 'DELETE' });
      App.toast('Kayıt silindi.', 'success');
      this.load();
    } catch (err) {
      App.toast('Silme hatası: ' + err.message, 'error');
    }
  }
};

/* ============================
   GOLD FORM — Add/Edit Gold
   ============================ */

const GoldForm = {
  goldTypes: null,
  editMode: false,
  editRecordId: null,

  async init() {
    if (!this.goldTypes) {
      try {
        const data = await App.api('/api/gold/types');
        this.goldTypes = data.types;
      } catch (err) {
        App.toast('Altın türleri yüklenemedi.', 'error');
        return;
      }
    }

    this.populateTypeSelect();
    this.bindEvents();

    // Reset form if not in edit mode
    if (!this.editMode) {
      this.resetForm();
    }
  },

  populateTypeSelect() {
    const select = document.getElementById('gold-type');
    // Only repopulate if empty
    if (select.options.length <= 1) {
      select.innerHTML = '<option value="">Seçiniz...</option>';
      this.goldTypes.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type.id;
        opt.textContent = type.name;
        select.appendChild(opt);
      });
    }
  },

  bindEvents() {
    const form = document.getElementById('gold-form');
    const typeSelect = document.getElementById('gold-type');
    const qtyInput = document.getElementById('gold-quantity');
    const priceInput = document.getElementById('gold-price');
    const cancelBtn = document.getElementById('gold-cancel-btn');
    const transTypes = document.querySelectorAll('input[name="transaction_type"]');

    // Prevent double-binding
    form.onsubmit = (e) => {
      e.preventDefault();
      this.handleSubmit();
    };

    // Update unit label and calc info
    typeSelect.onchange = () => this.updateFormInfo();
    qtyInput.oninput = () => this.updateFormInfo();
    priceInput.oninput = () => this.updateFormInfo();

    transTypes.forEach(r => {
      r.onchange = () => this.updateFormInfo();
    });

    cancelBtn.onclick = () => {
      this.resetForm();
      App.navigateTo('records');
    };

    // Set default date to today
    if (!this.editMode) {
      document.getElementById('gold-date').value = new Date().toISOString().split('T')[0];
    }
  },

  updateFormInfo() {
    const typeSelect = document.getElementById('gold-type');
    const qtyInput = document.getElementById('gold-quantity');
    const priceInput = document.getElementById('gold-price');
    const infoEl = document.getElementById('form-calc-info');
    const qtyLabel = document.getElementById('quantity-label');
    const transType = document.querySelector('input[name="transaction_type"]:checked')?.value || 'buy';
    
    // Update labels based on transaction type
    const priceLabel = document.querySelector('label[for="gold-price"]');
    if (priceLabel) {
      priceLabel.textContent = transType === 'sell' ? 'Satıştan Alınan Toplam Tutar (₺)' : 'Ödenen Toplam Fiyat (₺)';
    }

    const selectedType = this.goldTypes?.find(t => t.id === typeSelect.value);
    if (!selectedType) {
      infoEl.classList.remove('visible');
      qtyLabel.textContent = 'Miktar';
      return;
    }

    qtyLabel.textContent = selectedType.unit === 'gram' ? 'Miktar (gram)' : 'Miktar (adet)';

    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;

    if (qty > 0) {
      const totalWeight = qty * selectedType.weight;
      let info = `⚖️ Toplam ağırlık: ${App.formatWeight(totalWeight)} | Ayar: ${selectedType.karat}`;

      if (qty > 0 && price > 0) {
        const perUnit = price / qty;
        const unitLabel = selectedType.unit === 'gram' ? 'gram' : 'adet';
        info += ` | Birim fiyat: ${App.formatMoney(perUnit)} / ${unitLabel}`;
      }

      infoEl.textContent = info;
      infoEl.classList.add('visible');
    } else {
      infoEl.classList.remove('visible');
    }
  },

  setEditMode(record) {
    this.editMode = true;
    this.editRecordId = record.id;

    // Wait for form init
    setTimeout(() => {
      document.getElementById('add-form-title').textContent = '✏️ Kaydı Düzenle';
      document.getElementById('gold-submit-btn').textContent = 'Güncelle';
      document.getElementById('gold-cancel-btn').style.display = 'inline-block';
      document.getElementById('gold-type').value = record.gold_type;
      document.getElementById('gold-quantity').value = record.quantity;
      document.getElementById('gold-price').value = record.purchase_price_total;
      document.getElementById('gold-date').value = record.purchase_date;
      document.getElementById('gold-notes').value = record.notes || '';
      
      const tType = record.transaction_type || 'buy';
      const typeRadio = document.querySelector(`input[name="transaction_type"][value="${tType}"]`);
      if (typeRadio) typeRadio.checked = true;

      this.updateFormInfo();
    }, 100);
  },

  resetForm() {
    this.editMode = false;
    this.editRecordId = null;
    document.getElementById('gold-form').reset();
    document.getElementById('add-form-title').textContent = '➕ Yeni Altın Kaydı';
    document.getElementById('gold-submit-btn').textContent = 'Kaydet';
    document.getElementById('gold-cancel-btn').style.display = 'none';
    document.getElementById('gold-date').value = new Date().toISOString().split('T')[0];
    
    // Reset radio
    const radio = document.querySelector('input[name="transaction_type"][value="buy"]');
    if (radio) radio.checked = true;

    document.getElementById('form-calc-info').classList.remove('visible');
    document.getElementById('gold-form-error').textContent = '';
    document.getElementById('gold-form-success').textContent = '';
    this.updateFormInfo(); // reset layout strings
  },

  async handleSubmit() {
    const goldType = document.getElementById('gold-type').value;
    const quantity = document.getElementById('gold-quantity').value;
    const purchasePriceTotal = document.getElementById('gold-price').value;
    const purchaseDate = document.getElementById('gold-date').value;
    const notes = document.getElementById('gold-notes').value;
    const transactionType = document.querySelector('input[name="transaction_type"]:checked')?.value || 'buy';
    const errorEl = document.getElementById('gold-form-error');
    const successEl = document.getElementById('gold-form-success');
    const btn = document.getElementById('gold-submit-btn');

    errorEl.textContent = '';
    successEl.textContent = '';

    if (!goldType || !quantity || !purchasePriceTotal || !purchaseDate) {
      errorEl.textContent = 'Tüm zorunlu alanları doldurun.';
      return;
    }

    btn.disabled = true;

    try {
      const body = {
        transaction_type: transactionType,
        gold_type: goldType,
        quantity: parseFloat(quantity),
        purchase_price_total: parseFloat(purchasePriceTotal),
        purchase_date: purchaseDate,
        notes: notes
      };

      if (this.editMode && this.editRecordId) {
        await App.api(`/api/gold/records/${this.editRecordId}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
        App.toast('Kayıt başarıyla güncellendi!', 'success');
      } else {
        await App.api('/api/gold/records', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        App.toast('İşlem kaydedildi!', 'success');
      }

      this.resetForm();
      // Small delay then navigate
      setTimeout(() => App.navigateTo('records'), 500);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }
};

window.Records = Records;
window.GoldForm = GoldForm;
