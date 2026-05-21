/* ============================
   APP.JS — Core App Controller
   ============================ */

const App = {
  token: null,
  user: null,

  // API helper
  async api(url, options = {}) {
    // ═ LocalStorage tutarlılık kontrolü ═
    // Aynı sekmede localStorage silindi mi? (storage event sadece diğer sekmeleri yakalar)
    const storedToken = localStorage.getItem('gold_token');
    if (this.token && !storedToken) {
      // Bellekte token var ama localStorage'da yok → zorla logout
      this.logout({ silent: true });
      throw new Error('Oturum sonlandırıldı.');
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    try {
      const res = await fetch(url, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        // Token geçersiz veya süresi dolmuşsa tam logout yap
        if (res.status === 401 || res.status === 403) {
          // requiresVerification ise auth state'i silme — login sayfasına yönlendir
          if (data.requiresVerification) {
            const error = new Error(data.error || 'Doğrulama gerekli.');
            error.status = res.status;
            error.data = data;
            throw error;
          }
          // Gerçek token hatası ise tam logout
          if (this.token) {
            this.logout({ silent: true });
            this.toast('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.', 'warning');
          }
        }
        const error = new Error(data.error || 'Bir hata oluştu.');
        error.status = res.status;
        error.data = data;
        throw error;
      }
      return data;
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        throw new Error('Sunucuya bağlanılamıyor.');
      }
      throw err;
    }
  },

  getToken() { return this.token; },
  getUser() { return this.user; },

  // Toast notification
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // Format currency
  formatMoney(amount) {
    return '₺' + Number(amount).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  // Format weight
  formatWeight(grams) {
    return Number(grams).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' g';
  },

  // Format date
  formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  // ── Auth state: Tek doğruluk kaynağı ──────────────────────────────────
  _clearAuthState() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('gold_token');
    localStorage.removeItem('gold_user');
  },

  _loadAuthState() {
    const storedToken = localStorage.getItem('gold_token');
    const storedUser = localStorage.getItem('gold_user');

    if (!storedToken || !storedUser) {
      this._clearAuthState();
      return false;
    }

    try {
      this.token = storedToken;
      this.user = JSON.parse(storedUser);
      return !!(this.token && this.user);
    } catch (err) {
      console.warn('Bozuk auth verisi temizlendi.');
      this._clearAuthState();
      return false;
    }
  },
  // ──────────────────────────────────────────────────────────────────────

  // Init
  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const verifyToken = urlParams.get('token');

    if (verifyToken) {
      window.history.replaceState({}, document.title, window.location.pathname);
      this.verifyEmailToken(verifyToken);
      return;
    }

    this.setupNavigation();
    this.setupMenuToggle();

    // localStorage başka sekmede silinirse otomatik logout
    window.addEventListener('storage', (e) => {
      if (e.key === 'gold_token' && !e.newValue) {
        this._clearAuthState();
        this.showAuth();
        this.toast('Başka bir sekmede çıkış yapıldı.', 'info');
      }
    });

    const isAuthenticated = this._loadAuthState();

    if (isAuthenticated) {
      // Token var — sunucuya hızlı doğrulama isteği gönder
      this._validateToken();
    } else {
      this.showAuth();
    }
  },

  // Startup'ta token geçerliliğini sunucuya sor
  async _validateToken() {
    try {
      await this.api('/api/auth/profile');
      // Token geçerli — uygulama göster
      this.showApp();
    } catch (err) {
      // Token geçersiz, sona ermiş veya localStorage tutarsızlığı
      this._clearAuthState();
      this.showAuth();
      if (err.status === 401 || err.status === 403) {
        this.toast('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.', 'warning');
      }
      // Sunucuya ulaşılamazsa da login ekranına dönüş yap — offline mod yok
    }
  },

  async verifyEmailToken(token) {
    try {
      const data = await this.api('/api/auth/verify-token', {
        method: 'POST',
        body: JSON.stringify({ token })
      });
      
      this.toast(data.message, 'success');
      this.onLogin(data.token, data.user);
    } catch (err) {
      this.toast(err.message || 'Geçersiz bağlantı.', 'error');
      this.showAuth();
    }
  },

  // Show auth screen
  showAuth() {
    const authEl   = document.getElementById('auth-screen');
    const appEl    = document.getElementById('app-screen');
    const sidebarEl = document.getElementById('sidebar');
    authEl.style.display  = 'flex';
    appEl.style.display   = 'none';
    // Sidebar'i transform ile gizle (display:none yerine) — CSS geçişleri çalışsın
    if (sidebarEl) {
      sidebarEl.classList.add('sidebar-hidden');
      sidebarEl.classList.remove('open');
    }
    this._closeMobileOverlay();
    authEl.classList.add('active');
    appEl.classList.remove('active');
    Auth.init();
  },

  // Show app screen
  showApp() {
    if (!this.token || !this.user) {
      this.showAuth();
      return;
    }
    const authEl    = document.getElementById('auth-screen');
    const appEl     = document.getElementById('app-screen');
    const sidebarEl = document.getElementById('sidebar');
    authEl.style.display  = 'none';
    appEl.style.display   = 'block';
    // Sidebar'i göster: sidebar-hidden class'ini kaldır
    if (sidebarEl) {
      sidebarEl.classList.remove('sidebar-hidden');
      sidebarEl.classList.remove('open');
    }
    authEl.classList.remove('active');
    appEl.classList.add('active');
    document.getElementById('sidebar-username').textContent = this.user.username;
    this.navigateTo('dashboard');
  },

  // Login success
  onLogin(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('gold_token', token);
    localStorage.setItem('gold_user', JSON.stringify(user));
    this.showApp();
    this.toast(`Hoş geldiniz, ${user.username}!`, 'success');
  },

  // Logout
  logout(opts = {}) {
    this._clearAuthState();
    if (window.Prices && typeof Prices.stop === 'function') Prices.stop();
    this.showAuth();
    if (!opts.silent) {
      this.toast('Çıkış yapıldı.', 'info');
    }
  },

  // Navigation
  setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        this.navigateTo(page);
        // Sadece mobilde sidebar'i kapat
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar').classList.remove('open');
          this._closeMobileOverlay();
        }
      });
    });

    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    document.getElementById('quick-add-btn').addEventListener('click', () => this.navigateTo('add'));
    document.getElementById('records-add-btn').addEventListener('click', () => this.navigateTo('add'));
    
    const userInfoEl = document.getElementById('sidebar-user-info');
    if (userInfoEl) {
      userInfoEl.addEventListener('click', () => {
        this.navigateTo('settings');
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar').classList.remove('open');
          this._closeMobileOverlay();
        }
      });
    }
  },

  // Mobile overlay yardımcısı
  _getOrCreateOverlay() {
    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        this._closeMobileOverlay();
      });
    }
    return overlay;
  },

  _closeMobileOverlay() {
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('visible');
  },

  setupMenuToggle() {
    const toggleBtn = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if (!toggleBtn || !sidebar) return;

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebar.classList.toggle('open');
      // Overlay'i göster/gizle
      const overlay = this._getOrCreateOverlay();
      if (isOpen) {
        overlay.classList.add('visible');
      } else {
        overlay.classList.remove('visible');
      }
    });

    // main-content tıklandığında sidebar'i kapat (sadece mobilde)
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.addEventListener('click', () => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
          this._closeMobileOverlay();
        }
      });
    }

    // Pencere boyutu değiştiğinde sidebar state'ini düzelt
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        // Desktop: open class'ini temizle, overlay'i kapat
        sidebar.classList.remove('open');
        this._closeMobileOverlay();
      }
    });
  },

  navigateTo(page) {
    // ═ Auth guard: her sayfa geçişinde localStorage tutarlılığını kontrol et ═
    const storedToken = localStorage.getItem('gold_token');
    if (!storedToken || !this.token) {
      this._clearAuthState();
      this.showAuth();
      return;
    }

    // Nav item'ları güncelle
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    if (window.Prices && typeof Prices.stop === 'function') Prices.stop();
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    const titles = { dashboard: 'Durumum', records: 'İşlemlerim', prices: 'Güncel Fiyatlar', add: 'Altın Ekle', settings: 'Hesap Ayarları' };
    document.getElementById('page-title').textContent = titles[page] || 'Durumum';

    switch (page) {
      case 'dashboard': Dashboard.load(); break;
      case 'records': Records.load(); break;
      case 'prices': Prices.load(); break;
      case 'add': GoldForm.init(); break;
      case 'settings': Settings.load(); break;
    }
  }
};

// Tüm scriptler yüklendikten sonra uygulamayı başlat
window.addEventListener('load', () => {
  App.init();

  // DEBUGGING: Check for horizontal overflow causing zoom issues on mobile Safari
  setTimeout(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    console.log('[DEBUG] Layout Width:', docWidth, 'Viewport Width:', winWidth);
    
    if (docWidth > winWidth) {
      console.warn('⚠️ DİKKAT: Sayfada overflow oluşturan elementler var!');
      document.querySelectorAll('*').forEach(el => {
        if (el.scrollWidth > winWidth && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
          console.warn('Taşan Element:', el.tagName, el.className, el);
          // Highlight it visually if you want to inspect locally
          // el.style.border = '2px solid red';
        }
      });
    } else {
      console.log('✅ Sayfa genişliği mükemmel, overflow (taşma) yok.');
    }
  }, 1000); // 1 sn sonra (render sonrası) çalıştır
});
