/* ============================
   AUTH.JS — Login & Register
   ============================ */

const Auth = {
  _bound: false,

  init() {
    if (!this._bound) {
      this.bindEvents();
      this._bound = true;
    }
    // Form alanlarını temizle
    const loginEmail = document.getElementById('login-email');
    const loginPass = document.getElementById('login-password');
    if (loginEmail) loginEmail.value = '';
    if (loginPass) loginPass.value = '';
    this.showLogin();
  },

  bindEvents() {
    // Switch forms
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      this.showRegister();
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      this.showLogin();
    });

    // "Giriş Ekranına Dön" — verify-pending'den geri dön
    // localStorage silme işlemi App.showAuth() üzerinden zaten yapılıyor
    const showLoginFromPending = document.getElementById('show-login-from-pending');
    if (showLoginFromPending) {
      showLoginFromPending.addEventListener('click', (e) => {
        e.preventDefault();
        this.showLogin();
      });
    }

    // Login
    document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
    document.getElementById('login-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });

    // Register
    document.getElementById('register-btn').addEventListener('click', () => this.handleRegister());
    document.getElementById('register-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleRegister();
    });

    // Resend Verification
    const resendBtn = document.getElementById('resend-verify-btn');
    if (resendBtn) {
      resendBtn.addEventListener('click', () => this.handleResendVerification());
    }
  },

  // Sadece UI form geçişi yapar — auth state'e DOKUNMAZ
  showLogin() {
    document.getElementById('login-form').classList.add('active');
    document.getElementById('register-form').classList.remove('active');
    const verifyForm = document.getElementById('verify-form');
    if (verifyForm) verifyForm.classList.remove('active');
    const verifyPendingForm = document.getElementById('verify-pending-form');
    if (verifyPendingForm) verifyPendingForm.classList.remove('active');
    this.clearErrors();
  },

  showRegister() {
    document.getElementById('register-form').classList.add('active');
    document.getElementById('login-form').classList.remove('active');
    const verifyPendingForm = document.getElementById('verify-pending-form');
    if (verifyPendingForm) verifyPendingForm.classList.remove('active');
    this.clearErrors();
  },

  showVerifyPending(email) {
    document.getElementById('verify-pending-form').classList.add('active');
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('verify-pending-email').textContent = email;
    document.getElementById('resend-verify-btn').dataset.email = email;
    this.clearErrors();
  },

  clearErrors() {
    const loginErr = document.getElementById('login-error');
    if (loginErr) loginErr.textContent = '';
    const regErr = document.getElementById('register-error');
    if (regErr) regErr.textContent = '';
    const ve = document.getElementById('verify-pending-error');
    if (ve) ve.textContent = '';
  },

  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.textContent = '';

    if (!email || !password) {
      errorEl.textContent = 'E-posta ve şifre gereklidir.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Giriş yapılıyor...';

    try {
      const data = await App.api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      App.onLogin(data.token, data.user);
    } catch (err) {
      if (err.data && err.data.requiresVerification) {
        App.toast(err.message || 'Lütfen hesabınızı doğrulayın.', 'warning');
        this.showVerifyPending(err.data.email || email);
      } else {
        errorEl.textContent = err.message;
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Giriş Yap';
    }
  },

  async handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const errorEl = document.getElementById('register-error');
    const btn = document.getElementById('register-btn');

    errorEl.textContent = '';

    if (!username || !email || !password) {
      errorEl.textContent = 'Tüm alanlar zorunludur.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Kayıt yapılıyor...';

    try {
      const data = await App.api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
      });
      
      if (data.requiresVerification) {
        App.toast(data.message, 'info');
        this.showVerifyPending(email);
      } else {
        App.onLogin(data.token, data.user);
        App.toast('Kayıt başarılı!', 'success');
      }
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Kayıt Ol';
    }
  },

  async handleResendVerification() {
    const btn = document.getElementById('resend-verify-btn');
    const email = btn.dataset.email;
    const errorEl = document.getElementById('verify-pending-error');

    if (!email) return;

    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor...';

    try {
      const data = await App.api('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      
      App.toast(data.message, 'success');
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'E-postayı Tekrar Gönder';
    }
  }
};
