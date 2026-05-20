/* Dashboard — franjas + alerts + ultimas transacciones */
const Dashboard = {
  async render() {
    const main = document.getElementById('main');
    main.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.cssText = 'margin:80px auto;display:block;';
    main.appendChild(spinner);

    const [budget, insights] = await Promise.all([
      API.getBudget(),
      API.getInsights().catch(() => null),
    ]);

    App.state.budget = budget;
    App._updateAlertBadge(budget.alerts?.length || 0);

    main.textContent = '';
    main.appendChild(_buildDashboard(budget, insights));

    this._loadSyncStatus();

    API.getTransactions({ limit: 8 }).then(data => {
      const wrap = document.getElementById('recent-txs-wrap');
      if (!wrap) return;
      wrap.textContent = '';
      if (data.items.length) {
        wrap.appendChild(_buildTxTable(data.items));
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Sin movimientos este mes';
        wrap.appendChild(empty);
      }
    });

    document.querySelectorAll('.alert-dismiss').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await API.markAlertRead(id).catch(() => {});
        btn.closest('.alert-item').remove();
      });
    });
  },

  async syncAll(btn) {
    btn.disabled = true;
    btn.textContent = 'Sincronizando…';
    try {
      const status = App.state.syncStatus || {};
      const tasks = [];
      if (status.gmail?.status === 'connected') tasks.push(API.syncGmail());
      if (status.mercadopago?.status === 'connected') tasks.push(API.syncMP());
      if (!tasks.length) {
        App.toast('Conectá Gmail o Mercado Pago primero', 'error');
        return;
      }
      const results = await Promise.allSettled(tasks);
      const saved = results.reduce((s, r) => s + (r.value?.saved || 0), 0);
      App.toast('Sincronizado. ' + saved + ' transacciones nuevas.', 'success');
      Dashboard.render();
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '↻ Sincronizar'; }
    }
  },

  async _loadSyncStatus() {
    try {
      const s = await API.syncStatus();
      App.state.syncStatus = s;
      const label = document.getElementById('sync-status-label');
      if (!label) return;
      const parts = Object.entries(s)
        .filter(([, v]) => v.status === 'connected')
        .map(([k]) => k === 'mercadopago' ? 'MP' : 'Gmail');
      label.textContent = parts.length ? parts.join(' + ') + ' conectado' : 'Sin conexiones';
    } catch (_) { /* ignore */ }
  },
};

function _el(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function _buildDashboard(budget, insights) {
  const frag = document.createDocumentFragment();
  const now = new Date();
  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  // Header
  const header = _el('div', { className: 'page-header' },
    _el('div', {},
      _el('h2', {}, 'Hola, ' + (budget.name || 'Hernán')),
      _el('p', { style: 'color:var(--muted);font-size:.88rem;margin-top:2px;' },
        monthLabel + ' · día ' + budget.days_passed + ' de ' + budget.days_in_month)
    ),
    _el('div', { style: 'display:flex;gap:10px;align-items:center;' },
      _el('span', { className: 'sync-badge', id: 'sync-status-label' }, '···'),
      _el('button', {
        className: 'btn btn-primary btn-sm',
        onclick: function() { Dashboard.syncAll(this); }
      }, '↻ Sincronizar')
    )
  );
  frag.appendChild(header);

  // Summary metrics card
  const summaryCard = _el('div', { className: 'summary-metrics' });
  [
    { label: 'Ingresos', value: App.fmt(budget.total_income || 0), cls: 'income' },
    { label: 'Egresos', value: App.fmt(budget.total_expenses || 0), cls: 'expense' },
    { label: 'Balance', value: App.fmt(budget.balance || 0), cls: (budget.balance || 0) >= 0 ? 'positive' : 'negative' },
    { label: 'Pendientes', value: String(budget.pending_count || 0), cls: 'pending' },
  ].forEach(function(m) {
    summaryCard.appendChild(_el('div', { className: 'metric-box ' + m.cls },
      _el('span', { className: 'metric-label' }, m.label),
      _el('span', { className: 'metric-value' }, m.value)
    ));
  });
  frag.appendChild(summaryCard);

  // Franjas
  const grid = _el('div', { className: 'grid-3', style: 'margin-bottom:24px;' });
  budget.franjas.forEach(f => grid.appendChild(_buildFranjaCard(f)));
  frag.appendChild(grid);

  // Alerts
  if (budget.alerts?.length) {
    const alertsSection = _el('div', { style: 'margin-bottom:24px;' },
      _el('p', { className: 'section-title' }, 'Alertas'),
      _buildAlertsList(budget.alerts)
    );
    frag.appendChild(alertsSection);
  }

  // Insights
  if (insights) {
    const statsGrid = _el('div', { className: 'grid-3', style: 'margin-bottom:24px;' },
      _statPill(App.fmt(insights.total_spent), 'Gastado este mes'),
      _statPill(budget.days_remaining + ' días', 'Hasta fin de mes'),
      _statPill(App.fmt(insights.income - insights.total_spent), 'Disponible total')
    );
    frag.appendChild(statsGrid);
  }

  // Recent transactions card
  const card = _el('div', { className: 'card' });
  const cardHeader = _el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;' },
    _el('p', { className: 'section-title', style: 'margin:0;' }, 'Últimos movimientos'),
    _el('a', {
      href: '#',
      onclick: function(e) { e.preventDefault(); App.navigate('transactions'); }
    }, 'Ver todos →')
  );
  card.appendChild(cardHeader);
  const txWrap = _el('div', { id: 'recent-txs-wrap' });
  const spin = document.createElement('div');
  spin.className = 'spinner';
  spin.style.cssText = 'display:block;margin:20px auto;';
  txWrap.appendChild(spin);
  card.appendChild(txWrap);
  frag.appendChild(card);

  return frag;
}

function _buildFranjaCard(f) {
  const cls = App.progressClass(f.usage_pct);
  const card = _el('div', { className: 'franja-card' },
    _el('div', { className: 'label' }, f.label),
    _el('div', { className: 'amounts' },
      _el('span', { className: 'spent' }, App.fmt(f.spent)),
      _el('span', { className: 'limit' }, '/ ' + App.fmt(f.limit))
    ),
    _el('div', { className: 'progress-track' },
      _el('div', {
        className: 'progress-fill ' + cls,
        style: 'width:' + Math.min(100, f.usage_pct) + '%'
      })
    ),
    _el('div', { className: 'franja-pct' }, f.usage_pct + '% usado · ' + App.fmt(f.remaining) + ' restante')
  );
  return card;
}

function _buildAlertsList(alerts) {
  const wrap = _el('div', { id: 'alerts-list' });
  const icons = { critical: '\u{1F534}', warning: '\u{1F7E1}', info: '\u{1F7E2}' };
  alerts.forEach(a => {
    const item = _el('div', { className: 'alert-item ' + a.severity },
      _el('span', { className: 'alert-icon' }, icons[a.severity] || '⚠️'),
      _el('div', { style: 'flex:1' },
        _el('div', { className: 'alert-msg' }, a.message),
        ...(a.ai_advice ? [_el('div', { className: 'alert-advice' }, a.ai_advice)] : [])
      ),
      _el('button', {
        className: 'alert-dismiss',
        'data-id': a.id,
        title: 'Marcar leída',
        onclick: async function() {
          await API.markAlertRead(a.id).catch(() => {});
          item.remove();
        }
      }, '✕')
    );
    wrap.appendChild(item);
  });
  return wrap;
}

function _statPill(val, lbl) {
  return _el('div', { className: 'stat-pill' },
    _el('div', {},
      _el('div', { className: 'val' }, val),
      _el('div', { className: 'lbl' }, lbl)
    )
  );
}

function _buildTxTable(items) {
  const table = _el('table', { className: 'tx-table' });
  const thead = _el('thead', {},
    _el('tr', {},
      _el('th', {}, 'Comercio'),
      _el('th', {}, 'Categoría'),
      _el('th', {}, 'Fecha'),
      _el('th', { style: 'text-align:right' }, 'Monto')
    )
  );
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  items.forEach(t => {
    const cls = t.needs_review ? 'review' : t.category;
    const label = t.needs_review ? '? revisar' : t.category;
    tbody.appendChild(_el('tr', {},
      _el('td', {}, t.merchant),
      _el('td', {}, _el('span', { className: 'badge ' + cls }, label)),
      _el('td', { style: 'color:var(--muted)' }, t.date),
      _el('td', { style: 'text-align:right;font-weight:600' }, App.fmt(t.amount))
    ));
  });
  table.appendChild(tbody);
  return table;
}
