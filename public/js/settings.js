/* ============================
   SETTINGS.JS — Profile & Account Management
   ============================ */

const Settings = {
  load() {
    this.populateForm();
    this.attachEvents();
  },

  populateForm() {
    const user = App.getUser();
    if (user) {
      document.getElementById('profile-username').value = user.username || '';
      document.getElementById('profile-email').value = user.email || '';
      
      let pendingMsg = document.getElementById('pending-email-msg');
      if (user.pending_email) {
        if (!pendingMsg) {
          pendingMsg = document.createElement('div');
          pendingMsg.id = 'pending-email-msg';
          pendingMsg.style.color = 'var(--gold-400)';
          pendingMsg.style.fontSize = '0.85rem';
          pendingMsg.style.marginTop = '0.5rem';
          document.getElementById('profile-email').parentNode.appendChild(pendingMsg);
        }
        pendingMsg.textContent = `Bekleyen doğrulama: ${user.pending_email} (Onaylanana kadar e-postanız değişmez)`;
        pendingMsg.style.display = 'block';
      } else if (pendingMsg) {
        pendingMsg.style.display = 'none';
      }
    }
    
    // Clear passwords and messages
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-new-password').value = '';
    document.getElementById('profile-error').textContent = '';
    document.getElementById('profile-success').textContent = '';
    document.getElementById('delete-account-password').value = '';
    document.getElementById('delete-account-error').textContent = '';
  },

  attachEvents() {
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      // Remove previous listener to avoid duplicates if load() is called multiple times
      const newForm = profileForm.cloneNode(true);
      profileForm.parentNode.replaceChild(newForm, profileForm);
      
      newForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.updateProfile();
      });
    }

    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
      const newBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newBtn, deleteBtn);
      
      newBtn.addEventListener('click', () => {
        this.deleteAccount();
      });
    }
  },

  async updateProfile() {
    const username = document.getElementById('profile-username').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const currentPassword = document.getElementById('profile-current-password').value;
    const newPassword = document.getElementById('profile-new-password').value;

    const errorEl = document.getElementById('profile-error');
    const successEl = document.getElementById('profile-success');
    const submitBtn = document.getElementById('profile-submit-btn');

    errorEl.textContent = '';
    successEl.textContent = '';

    if (!username || !email || !currentPassword) {
      errorEl.textContent = 'Kullanıcı adı, e-posta ve mevcut şifre zorunludur.';
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Güncelleniyor...';

      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.getToken()}`
        },
        body: JSON.stringify({ username, email, currentPassword, newPassword })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Güncelleme başarısız oldu.');
      }

      // requiresVerification logic removed as users are no longer logged out

      // Update local storage
      localStorage.setItem('gold_token', data.token);
      localStorage.setItem('gold_user', JSON.stringify(data.user));
      App.token = data.token;
      App.user = data.user;

      // Update UI elements
      const sidebarUser = document.getElementById('sidebar-username');
      if (sidebarUser) sidebarUser.textContent = data.user.username;

      successEl.textContent = data.message || 'Profiliniz başarıyla güncellendi.';
      document.getElementById('profile-current-password').value = '';
      document.getElementById('profile-new-password').value = '';
      
      // Update form fields with actual data from server
      document.getElementById('profile-email').value = data.user.email;
      
      let pendingMsg = document.getElementById('pending-email-msg');
      if (data.user.pending_email) {
        if (!pendingMsg) {
          pendingMsg = document.createElement('div');
          pendingMsg.id = 'pending-email-msg';
          pendingMsg.style.color = 'var(--gold-400)';
          pendingMsg.style.fontSize = '0.85rem';
          pendingMsg.style.marginTop = '0.5rem';
          document.getElementById('profile-email').parentNode.appendChild(pendingMsg);
        }
        pendingMsg.textContent = `Bekleyen doğrulama: ${data.user.pending_email} (Onaylanana kadar e-postanız değişmez)`;
        pendingMsg.style.display = 'block';
      } else if (pendingMsg) {
        pendingMsg.style.display = 'none';
      }
      
      App.toast(data.message || 'Profil güncellendi', 'success');

    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Güncelle';
    }
  },

  async deleteAccount() {
    const password = document.getElementById('delete-account-password').value;
    const errorEl = document.getElementById('delete-account-error');

    errorEl.textContent = '';

    if (!password) {
      errorEl.textContent = 'Lütfen hesabınızı silmek için şifrenizi girin.';
      return;
    }

    if (!confirm('Hesabınızı KALICI OLARAK silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) {
      return;
    }

    try {
      const btn = document.getElementById('delete-account-btn');
      btn.disabled = true;
      btn.textContent = 'Siliniyor...';

      const res = await fetch('/api/auth/profile', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.getToken()}`
        },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Hesap silinirken bir hata oluştu.');
      }

      App.toast('Hesabınız başarıyla silindi.', 'success');
      
      // Logout user completely
      setTimeout(() => {
        App.logout();
      }, 1500);

    } catch (err) {
      errorEl.textContent = err.message;
      const btn = document.getElementById('delete-account-btn');
      btn.disabled = false;
      btn.textContent = 'Hesabımı Kalıcı Olarak Sil';
    }
  }
};
