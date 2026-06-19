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

  // Connection banners (Gmail / Mercado Pago)
  const syncStatus = App.state.syncStatus || {};
  const gmail = syncStatus.gmail?.status === 'connected';
  const mp = syncStatus.mercadopago?.status === 'connected';
  if (!gmail || !mp) {
    const banner = _el('div', { style: 'background:var(--color-bg-secondary);border-left:4px solid var(--color-accent);padding:16px;border-radius:6px;margin-bottom:20px;' });
    const msg = _el('p', { style: 'margin:0;font-weight:500;margin-bottom:8px;' },
      !gmail && !mp ? 'Conectá Gmail y Mercado Pago para sincronizar transacciones' :
      !gmail ? 'Conectá Gmail para sincronizar correos' :
      'Conectá Mercado Pago para sincronizar pagos'
    );
    banner.appendChild(msg);

    const btns = _el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
    if (!gmail) btns.appendChild(_el('button', {
      className: 'btn btn-sm btn-primary',
      onclick: () => App.navigate('settings')
    }, '⚙ Conectar Gmail'));
    if (!mp) btns.appendChild(_el('button', {
      className: 'btn btn-sm btn-primary',
      onclick: () => App.navigate('settings')
    }, '💳 Conectar Mercado Pago'));
    banner.appendChild(btns);
    frag.appendChild(banner);
  }

  // Fixed expenses banner
  const recurringCount = budget.monthly_committed || 0;
  if (recurringCount === 0) {
    const fixedBanner = _el('div', { style: 'background:var(--color-bg-secondary);border-left:4px solid var(--color-accent);padding:16px;border-radius:6px;margin-bottom:20px;' });
    fixedBanner.appendChild(_el('p', { style: 'margin:0;font-weight:500;margin-bottom:8px;' }, 'Agregá gastos fijos para un presupuesto más preciso'));
    const fixedBtn = _el('button', {
      className: 'btn btn-sm btn-primary',
      onclick: () => App.navigate('settings')
    }, '➕ Agregar gasto fijo');
    fixedBanner.appendChild(fixedBtn);
    frag.appendChild(fixedBanner);
  }

  // Summary metrics card
  const summaryCard = _el('div', { className: 'summary-metrics' });
  const incomeSub = budget.income_is_declared
    ? 'sueldo declarado · ' + App.fmt(budget.tracked_income || 0) + ' registrado'
    : null;
  [
    { label: 'Ingresos', value: App.fmt(budget.total_income || 0), cls: 'income', sub: incomeSub },
    { label: 'Egresos', value: App.fmt(budget.total_expenses || 0), cls: 'expense' },
    { label: 'Balance', value: App.fmt(budget.balance || 0), cls: (budget.balance || 0) >= 0 ? 'positive' : 'negative' },
    { label: 'Pendientes', value: String(budget.pending_count || 0), cls: 'pending' },
  ].forEach(function(m) {
    summaryCard.appendChild(_el('div', { className: 'metric-box ' + m.cls },
      _el('span', { className: 'metric-label' }, m.label),
      _el('span', { className: 'metric-value' }, m.value),
      m.sub ? _el('span', { className: 'metric-sub' }, m.sub) : null
    ));
  });
  frag.appendChild(summaryCard);

  // Franjas
  const grid = _el('div', { className: 'grid-3', style: 'margin-bottom:24px;' });
  budget.franjas.forEach(f => grid.appendChild(_buildFranjaCard(f)));
  frag.appendChild(grid);

  // Charts: donut por franja + histórico
  const chartsRow = _el('div', { className: 'charts-row' },
    _el('div', { className: 'card chart-card' },
      _el('p', { className: 'section-title' }, 'Distribución del gasto'),
      _buildDonut(budget.franjas)
    ),
    _el('div', { className: 'card chart-card' },
      _el('p', { className: 'section-title' }, 'Últimos meses'),
      _el('div', { id: 'history-chart' },
        (() => { const s = document.createElement('div'); s.className = 'spinner'; s.style.cssText = 'display:block;margin:30px auto;'; return s; })()
      )
    )
  );
  frag.appendChild(chartsRow);
  API.getBudgetHistory().then(hist => {
    const wrap = document.getElementById('history-chart');
    if (wrap) { wrap.textContent = ''; wrap.appendChild(_buildHistoryBars(hist)); }
  }).catch(() => {});

  // Desglose por categoría (estilo MP)
  const catCard = _el('div', { className: 'card', style: 'margin-bottom:24px;' },
    _el('p', { className: 'section-title' }, 'Salidas por categoría'),
    _el('div', { id: 'cat-breakdown' },
      (() => { const s = document.createElement('div'); s.className = 'spinner'; s.style.cssText = 'display:block;margin:20px auto;'; return s; })()
    )
  );
  frag.appendChild(catCard);
  API.getCategories().then(data => {
    const wrap = document.getElementById('cat-breakdown');
    if (wrap) { wrap.textContent = ''; wrap.appendChild(_buildCategoryList(data)); }
  }).catch(() => {});

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

  // Investments card
  const investCard = _el('div', { className: 'card', style: 'margin-bottom:24px;' },
    _el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;' },
      _el('p', { className: 'section-title', style: 'margin:0;' }, 'Inversiones'),
      _el('a', {
        href: '#',
        onclick: function(e) { e.preventDefault(); App.navigate('investments'); }
      }, 'Ver detalles →')
    ),
    _el('div', { id: 'investments-summary' },
      (() => { const s = document.createElement('div'); s.className = 'spinner'; s.style.cssText = 'display:block;margin:20px auto;'; return s; })()
    )
  );
  frag.appendChild(investCard);

  API.getInvestmentSummary().then(inv => {
    const wrap = document.getElementById('investments-summary');
    if (!wrap) return;
    wrap.textContent = '';
    if (inv && inv.total_invested > 0) {
      wrap.appendChild(_buildInvestmentSummary(inv));
    } else {
      const empty = _el('div', { className: 'empty', style: 'padding:20px;text-align:center;' });
      empty.textContent = 'Sin inversiones aún. Sube un CSV de tu broker.';
      wrap.appendChild(empty);
    }
  }).catch(() => {
    const wrap = document.getElementById('investments-summary');
    if (wrap) {
      wrap.textContent = '';
      const msg = _el('div', { className: 'empty', style: 'padding:20px;text-align:center;font-size:.9rem;color:var(--muted);' });
      msg.textContent = 'No se pudo cargar inversiones';
      wrap.appendChild(msg);
    }
  });

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
    let splitActions = null;
    if (a.type === 'split_suggestion' && a.payload) {
      let p = null;
      try { p = JSON.parse(a.payload); } catch (_) { /* payload corrupto: sin botones */ }
      if (p && p.expense_id && p.income_ids) {
        splitActions = _el('div', { className: 'split-actions' },
          _el('button', {
            className: 'btn btn-primary btn-sm',
            onclick: async function() {
              this.disabled = true;
              try {
                const r = await API.confirmSplit(p.expense_id, { income_ids: p.income_ids, alert_id: a.id });
                App.toast('Listo: gasto neto ' + App.fmt(r.net_expense) + ' (te devolvieron ' + App.fmt(r.reimbursed_total) + ')', 'success');
                Dashboard.render();
              } catch (err) {
                App.toast(err.message, 'error');
                this.disabled = false;
              }
            }
          }, 'Sí, era compartido'),
          _el('button', {
            className: 'btn btn-sm btn-ghost',
            onclick: async function() {
              await API.markAlertRead(a.id).catch(() => {});
              this.closest('.alert-item').remove();
            }
          }, 'No, dejar como está')
        );
      }
    }
    const item = _el('div', { className: 'alert-item ' + a.severity },
      _el('span', { className: 'alert-icon' }, a.type === 'split_suggestion' ? '🤝' : (icons[a.severity] || '⚠️')),
      _el('div', { style: 'flex:1' },
        _el('div', { className: 'alert-msg' }, a.message),
        ...(a.ai_advice ? [_el('div', { className: 'alert-advice' }, a.ai_advice)] : []),
        ...(splitActions ? [splitActions] : [])
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

const FRANJA_COLORS = { necesidades: '#5B8DEF', gustos: '#C8A84B', ahorro: '#4CAF8C' };

/* Donut SVG: gasto por franja sobre el total gastado. */
function _buildDonut(franjas) {
  const total = franjas.reduce((s, f) => s + f.spent, 0);
  const wrap = _el('div', { className: 'donut-wrap' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'donut');

  const R = 48, C = 2 * Math.PI * R;
  let offset = 0;
  franjas.forEach(f => {
    const frac = total > 0 ? f.spent / total : 0;
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', '60'); circle.setAttribute('cy', '60'); circle.setAttribute('r', String(R));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', FRANJA_COLORS[f.name] || '#888');
    circle.setAttribute('stroke-width', '16');
    circle.setAttribute('stroke-dasharray', (frac * C) + ' ' + C);
    circle.setAttribute('stroke-dashoffset', String(-offset * C));
    circle.setAttribute('transform', 'rotate(-90 60 60)');
    svg.appendChild(circle);
    offset += frac;
  });
  const txt = document.createElementNS(svgNS, 'text');
  txt.setAttribute('x', '60'); txt.setAttribute('y', '64');
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('class', 'donut-center');
  txt.textContent = total > 0 ? App.fmt(total) : 'Sin gastos';
  svg.appendChild(txt);
  wrap.appendChild(svg);

  const legend = _el('div', { className: 'donut-legend' });
  franjas.forEach(f => {
    const pct = total > 0 ? Math.round(f.spent / total * 100) : 0;
    legend.appendChild(_el('div', { className: 'legend-item' },
      _el('span', { className: 'legend-dot', style: 'background:' + (FRANJA_COLORS[f.name] || '#888') }),
      _el('span', {}, f.label + ' · ' + pct + '% (' + App.fmt(f.spent) + ')')
    ));
  });
  wrap.appendChild(legend);
  return wrap;
}

/* Barras horizontales apiladas por mes (histórico). */
function _buildHistoryBars(hist) {
  if (!hist || !hist.length) {
    return _el('div', { className: 'empty' }, 'Todavía no hay histórico');
  }
  const months = hist.slice(0, 6).reverse();
  const max = Math.max(...months.map(m => m.franjas.reduce((s, f) => s + f.spent, 0)), 1);
  const wrap = _el('div', { className: 'history-bars' });
  months.forEach(m => {
    const totalSpent = m.franjas.reduce((s, f) => s + f.spent, 0);
    const bar = _el('div', { className: 'hbar-track' });
    m.franjas.forEach(f => {
      if (f.spent <= 0) return;
      bar.appendChild(_el('div', {
        className: 'hbar-seg',
        style: 'width:' + (f.spent / max * 100) + '%;background:' + (FRANJA_COLORS[f.name] || '#888'),
        title: f.label + ': ' + App.fmt(f.spent),
      }));
    });
    wrap.appendChild(_el('div', { className: 'hbar-row' },
      _el('span', { className: 'hbar-label' }, m.month),
      bar,
      _el('span', { className: 'hbar-total' }, App.fmt(totalSpent))
    ));
  });
  return wrap;
}

const CAT_PALETTE = ['#84A98C', '#C97B4A', '#5B8DEF', '#B07BAC', '#D4A03C', '#6FA8A0', '#A0674B', '#8A9182'];

/* Lista de subcategorías con barra proporcional, estilo app de MP. */
function _buildCategoryList(data) {
  if (!data.categories || !data.categories.length) {
    return _el('div', { className: 'empty' }, 'Sin gastos este mes');
  }
  const wrap = _el('div', { className: 'cat-list' });
  data.categories.slice(0, 10).forEach((c, i) => {
    const color = c.name === 'Pendiente de categoría' ? '#9AA0A6' : CAT_PALETTE[i % CAT_PALETTE.length];
    wrap.appendChild(_el('div', { className: 'cat-row' },
      _el('span', { className: 'cat-dot', style: 'background:' + color }),
      _el('div', { className: 'cat-info' },
        _el('div', { className: 'cat-name' }, c.name),
        _el('div', { className: 'cat-bar-track' },
          _el('div', { className: 'cat-bar', style: 'width:' + c.pct + '%;background:' + color })
        )
      ),
      _el('div', { className: 'cat-amounts' },
        _el('div', { className: 'cat-amount' }, App.fmt(c.amount)),
        _el('div', { className: 'cat-pct' }, c.pct + '% · ' + c.count + ' movs')
      )
    ));
  });
  wrap.appendChild(_el('div', { className: 'cat-total' },
    _el('span', {}, 'Total del mes'),
    _el('strong', {}, App.fmt(data.total))
  ));
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
    let cls = t.needs_review ? 'review' : t.category;
    let label = t.needs_review ? '? revisar' : t.category;
    if (t.is_internal_transfer) { cls = 'transfer'; label = 'transferencia propia'; }
    else if (t.is_duplicate)    { cls = 'duplicate'; label = 'duplicado'; }
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

function _buildInvestmentSummary(inv) {
  const grid = _el('div', { className: 'grid-3', style: 'margin-top:12px;' },
    _el('div', { className: 'metric-box' },
      _el('span', { className: 'metric-label' }, 'Invertido'),
      _el('span', { className: 'metric-value', style: 'color:var(--info)' }, App.fmt(inv.total_invested))
    ),
    _el('div', { className: 'metric-box' },
      _el('span', { className: 'metric-label' }, 'Valor actual'),
      _el('span', { className: 'metric-value' }, App.fmt(inv.total_current_value))
    ),
    _el('div', { className: 'metric-box' },
      _el('span', { className: 'metric-label' }, 'P&L'),
      _el('span', {
        className: 'metric-value',
        style: 'color:' + (inv.total_pnl >= 0 ? 'var(--success)' : 'var(--error)')
      }, (inv.total_pnl >= 0 ? '+' : '') + App.fmt(inv.total_pnl))
    )
  );
  return grid;
}
