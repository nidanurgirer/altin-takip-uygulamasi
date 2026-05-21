/* ============================
   CHARTS.JS — Data Visualization
   ============================ */

const Charts = {
  investmentChart: null,
  distributionChart: null,

  render(data) {
    this.renderInvestmentChart(data);
    this.renderDistributionChart(data);
  },

  renderInvestmentChart(data) {
    const canvas = document.getElementById('chart-investment');
    if (!canvas) return;

    // Destroy existing chart
    if (this.investmentChart) {
      this.investmentChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    if (data.totalInvestment === 0) {
      this.investmentChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Toplam Yatırım', 'Güncel Değer', 'Kâr/Zarar'],
          datasets: [{
            data: [0, 0, 0],
            backgroundColor: ['rgba(212, 168, 83, 0.3)', 'rgba(212, 168, 83, 0.15)', 'rgba(255, 255, 255, 0.05)'],
            borderColor: ['rgba(212, 168, 83, 0.6)', 'rgba(212, 168, 83, 0.3)', 'rgba(255, 255, 255, 0.1)'],
            borderWidth: 1,
            borderRadius: 8
          }]
        },
        options: this.getBarOptions()
      });
      return;
    }

    const profitColor = data.profitLoss >= 0
      ? { bg: 'rgba(34, 197, 94, 0.4)', border: 'rgba(34, 197, 94, 0.8)' }
      : { bg: 'rgba(239, 68, 68, 0.4)', border: 'rgba(239, 68, 68, 0.8)' };

    this.investmentChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Toplam Yatırım', 'Güncel Değer', 'Kâr/Zarar'],
        datasets: [{
          data: [data.totalInvestment, data.currentValue, Math.abs(data.profitLoss)],
          backgroundColor: [
            'rgba(212, 168, 83, 0.4)',
            'rgba(240, 198, 116, 0.4)',
            profitColor.bg
          ],
          borderColor: [
            'rgba(212, 168, 83, 0.8)',
            'rgba(240, 198, 116, 0.8)',
            profitColor.border
          ],
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: this.getBarOptions()
    });
  },

  renderDistributionChart(data) {
    const canvas = document.getElementById('chart-distribution');
    if (!canvas) return;

    if (this.distributionChart) {
      this.distributionChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    if (!data.byType || Object.keys(data.byType).length === 0) {
      this.distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Veri yok'],
          datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.05)'], borderWidth: 0 }]
        },
        options: this.getDoughnutOptions()
      });
      return;
    }

    const goldColors = [
      'rgba(212, 168, 83, 0.7)',
      'rgba(240, 198, 116, 0.7)',
      'rgba(184, 134, 11, 0.7)',
      'rgba(255, 215, 0, 0.5)',
      'rgba(218, 165, 32, 0.7)',
      'rgba(205, 133, 63, 0.7)',
      'rgba(244, 208, 111, 0.7)',
      'rgba(169, 132, 58, 0.7)',
      'rgba(230, 190, 100, 0.7)',
      'rgba(150, 112, 10, 0.7)'
    ];

    const borderColors = goldColors.map(c => c.replace('0.7', '1'));

    const labels = [];
    const values = [];

    Object.entries(data.byType).forEach(([type, info], i) => {
      labels.push(info.name);
      values.push(info.totalInvestment);
    });

    this.distributionChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: goldColors.slice(0, values.length),
          borderColor: borderColors.slice(0, values.length),
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: this.getDoughnutOptions()
    });
  },

  getBarOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13, 13, 20, 0.95)',
          titleColor: '#eaeaf0',
          bodyColor: '#d4a853',
          borderColor: 'rgba(212, 168, 83, 0.2)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter', weight: '700' },
          callbacks: {
            label: function(ctx) {
              return '₺' + ctx.parsed.y.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: '#8888a0', font: { family: 'Inter', size: 12 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: {
            color: '#8888a0',
            font: { family: 'Inter', size: 11 },
            callback: function(val) {
              if (val >= 1000) return '₺' + (val / 1000).toFixed(0) + 'K';
              return '₺' + val;
            }
          }
        }
      }
    };
  },

  getDoughnutOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#8888a0',
            font: { family: 'Inter', size: 11 },
            padding: 16,
            boxWidth: 0,
            usePointStyle: false
          }
        },
        tooltip: {
          backgroundColor: 'rgba(13, 13, 20, 0.95)',
          titleColor: '#eaeaf0',
          bodyColor: '#d4a853',
          borderColor: 'rgba(212, 168, 83, 0.2)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter', weight: '700' },
          callbacks: {
            label: function(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return `₺${ctx.parsed.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} (%${pct})`;
            }
          }
        }
      }
    };
  }
};
