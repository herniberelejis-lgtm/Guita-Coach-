/* SPA router + global state */

const App = {
  state: { budget: null, syncStatus: null },

  pages: {
    dashboard:    () => Dashboard.render(),
    transactions: () => Transactions.render(),
    insights:     () => Insights.render(),
    chat:         () => Chat.render(),
    settings:     () => Settings.render(),
  },

  async init() {
    // Check onboarding
    const budget = await API.getBudget().catch(() => null);
    if (!budget) return;

    this.state.budget = budget;

    if (!budget.onboarding_done) {
      Onboarding.show();
      return;
    }

    this._bindNav();
    this._handleHash();
    window.addEventListener('hashchange', () => this._handleHash());

    // Alert badge on nav
    this._updateAlertBadge(budget.alerts?.length || 0);
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
  },

  _bindNav() {
    document.querySelectorAll('nav a[data-page]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        location.hash = a.dataset.page;
      });
    });

    const ham = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    if (ham) {
      ham.addEventListener('click', () => sidebar.classList.toggle('open'));
      document.getElementById('main').addEventListener('click', () => sidebar.classList.remove('open'));
    }
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
        });
        location.reload();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  },
};

// Boot on load
window.addEventListener('DOMContentLoaded', () => App.init());
