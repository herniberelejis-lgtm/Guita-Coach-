/* Pantalla de login/registro. Se muestra si /api/auth/me devuelve 401. */
const Auth = {
  /* Devuelve el usuario o null si no hay sesión. */
  async check() {
    try {
      return await API.me();
    } catch {
      return null;
    }
  },

  show() {
    document.getElementById('app').style.display = 'none';
    const ham = document.getElementById('hamburger');
    if (ham) ham.style.display = 'none';
    const overlay = document.getElementById('auth-overlay');
    overlay.style.display = 'flex';
    this._bind(overlay);
  },

  _bind(overlay) {
    if (this._bound) return;
    this._bound = true;

    overlay.querySelectorAll('[data-auth-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('[data-auth-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.authTab;
        overlay.querySelector('#login-form').style.display = mode === 'login' ? 'block' : 'none';
        overlay.querySelector('#register-form').style.display = mode === 'register' ? 'block' : 'none';
      });
    });

    overlay.querySelector('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await API.login({ email: fd.get('email'), password: fd.get('password') });
        location.reload();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });

    overlay.querySelector('#register-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (String(fd.get('password')).length < 8) {
        App.toast('La contraseña debe tener al menos 8 caracteres', 'error');
        return;
      }
      try {
        await API.register({
          name: fd.get('name'),
          email: fd.get('email'),
          password: fd.get('password'),
        });
        location.reload();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  },

  async logout() {
    try { await API.logout(); } catch { /* la sesión ya no existe */ }
    location.reload();
  },
};
