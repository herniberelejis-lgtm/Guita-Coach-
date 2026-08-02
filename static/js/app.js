/* SPA router + global state */

const App = {
  state: { budget: null, syncStatus: null },

  pages: {
    dashboard:    () => Dashboard.render(),
    transactions: () => Transactions.render(),
    insights:     () => Insights.render(),
    goals:        () => Goals.render(),
    chat:         () => Chat.render(),
    settings:     () => Settings.render(),
    investments:  () => Investments.render(),
    academy:      () => Academy.render(),
  },

  // Pages reachable by URL but not shown in nav
  _hiddenPages: new Set(['insights', 'chat', 'investments']),

  async init() {
    // 1. Sesión: si no hay usuario, mostrar login/registro
    const user = await Auth.check();
    if (!user) {
      Auth.show();
      return;
    }
    this.state.user = user;

    // 2. Onboarding
    const budget = await API.getBudget().catch(() => null);
    if (!budget) return;

    this.state.budget = budget;

    if (!budget.onboarding_done) {
      Onboarding.show();
      return;
    }

    this._bindNav();
    this._bindNotifications(budget.alerts || []);
    ChatWidget.init();
    this._handleHash();
    window.addEventListener('hashchange', () => this._handleHash());

    // Alert badge on nav
    this._updateAlertBadge(budget.alerts?.length || 0);
  },

  _bindNotifications(alerts) {
    const bell = document.getElementById('notif-bell');
    const panel = document.getElementById('notif-panel');
    const badge = document.getElementById('bell-badge');
    if (!bell || !panel) return;

    const unread = alerts.length;
    if (badge) {
      badge.textContent = unread || '';
      badge.style.display = unread ? 'inline-flex' : 'none';
    }

    bell.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      this._renderNotifications(alerts);
    });
  },

  _renderNotifications(alerts) {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!alerts.length) {
      list.innerHTML = '<div class="notif-empty">Sin notificaciones. Todo en orden 👌</div>';
      return;
    }
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    list.innerHTML = alerts.map(a => `
      <div class="notif-item ${esc(a.severity)}">
        <div class="notif-msg">${esc(a.message)}</div>
        ${a.ai_advice ? `<div class="notif-advice">${esc(a.ai_advice)}</div>` : ''}
        <button class="notif-dismiss" data-id="${Number(a.id)}">Marcar leída</button>
      </div>
    `).join('');
    list.querySelectorAll('.notif-dismiss').forEach(btn => {
      btn.addEventListener('click', async () => {
        await API.markAlertRead(btn.dataset.id).catch(() => {});
        btn.closest('.notif-item').remove();
        const remaining = list.querySelectorAll('.notif-item').length;
        const badge = document.getElementById('bell-badge');
        if (badge) {
          badge.textContent = remaining || '';
          badge.style.display = remaining ? 'inline-flex' : 'none';
        }
        App._updateAlertBadge(remaining);
      });
    });
  },

  _handleHash() {
    const hash = (location.hash.replace('#', '') || 'dashboard').split('?')[0];
    const page = this.pages[hash] ? hash : 'dashboard';
    this._setActivePage(page);
    this.pages[page]();
  },

  _setActivePage(page) {
    document.querySelectorAll('nav a[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    const moreBtn = document.getElementById('more-nav-btn');
    if (moreBtn) {
      const overflowPages = ['settings'];
      moreBtn.classList.toggle('active', overflowPages.includes(page));
    }
  },

  _bindNav() {
    document.querySelectorAll('nav a[data-page]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        this._closeMoreSheet();
        location.hash = a.dataset.page;
      });
    });

    const ham = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    if (ham) {
      ham.addEventListener('click', () => sidebar.classList.toggle('open'));
      document.getElementById('main').addEventListener('click', () => sidebar.classList.remove('open'));
    }

    const moreBtn = document.getElementById('more-nav-btn');
    const backdrop = document.getElementById('more-backdrop');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => this._toggleMoreSheet());
      backdrop.addEventListener('click', () => this._closeMoreSheet());
    }
  },

  _toggleMoreSheet() {
    const sheet = document.getElementById('more-sheet');
    const backdrop = document.getElementById('more-backdrop');
    const isOpen = sheet.classList.contains('open');
    if (isOpen) {
      this._closeMoreSheet();
    } else {
      sheet.style.display = 'block';
      backdrop.style.display = 'block';
      // rAF ensures display:block is painted before transition fires
      requestAnimationFrame(() => {
        sheet.classList.add('open');
        backdrop.classList.add('visible');
      });
    }
  },

  _closeMoreSheet() {
    const sheet = document.getElementById('more-sheet');
    const backdrop = document.getElementById('more-backdrop');
    sheet.classList.remove('open');
    backdrop.classList.remove('visible');
    // hide after transition completes (300ms drawer + buffer)
    setTimeout(() => {
      if (!sheet.classList.contains('open')) sheet.style.display = 'none';
      if (!backdrop.classList.contains('visible')) backdrop.style.display = 'none';
    }, 320);
  },

  navigate(page) {
    location.hash = page;
  },

  _updateAlertBadge(count) {
    const badge = document.getElementById('alert-badge');
    if (!badge) return;
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  },

  toast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + type;
    clearTimeout(App._toastTimer);
    App._toastTimer = setTimeout(() => { t.className = ''; }, 3500);
  },

  fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  },

  progressClass(pct) {
    if (pct >= 90) return 'danger';
    if (pct >= 75) return 'warn';
    return 'ok';
  },
};

// ─── Onboarding ─────────────────────────────────────────────────────────────
const Onboarding = {
  show() {
    document.getElementById('onboarding-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';

    document.getElementById('onboarding-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const n = parseInt(fd.get('necesidades_pct'));
      const g = parseInt(fd.get('gustos_pct'));
      const a = parseInt(fd.get('ahorro_pct'));
      if (n + g + a !== 100) {
        App.toast('Los porcentajes deben sumar 100', 'error');
        return;
      }
      try {
        await API.postOnboarding({
          name: fd.get('name'),
          monthly_income: parseFloat(fd.get('monthly_income')),
          necesidades_pct: n,
          gustos_pct: g,
          ahorro_pct: a,
          payday: parseInt(fd.get('payday')),
          income_is_variable: fd.get('income_is_variable') === 'on',
        });
        location.reload();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  },
};

// Identidad de marca única (negro absoluto + magenta eléctrico) — sin selector
// de temas: el manual de marca exige monocromía estricta, no varias paletas.
const Theme = { init() {} };

// Boot on load
window.addEventListener('DOMContentLoaded', () => { Theme.init(); App.init(); });
