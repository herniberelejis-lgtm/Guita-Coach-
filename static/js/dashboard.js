/* Dashboard — balance editable + distribución del gasto + histórico mensual */
const Dashboard = {
  async render(month) {
    const main = document.getElementById('main');
    main.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.cssText = 'margin:80px auto;display:block;';
    main.appendChild(spinner);

    const [budget, months] = await Promise.all([
      API.getBudget(month),
      API.getBudgetMonths().catch(() => []),
    ]);

    if (!month) {
      App.state.budget = budget;
      App._updateAlertBadge(budget.alerts?.length || 0);
    }

    main.textContent = '';
    main.appendChild(_buildDashboard(budget, months));
  },

  _changeMonth(month) {
    Dashboard.render(month === _currentMonthStr() ? undefined : month);
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

function _currentMonthStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function _monthLabel(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function _shortMonthLabel(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  return d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
}

function _googleIcon() {
  const span = document.createElement('span');
  span.style.cssText = 'display:flex;align-items:center;';
  span.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#EA4335" d="M12 5.4c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.9 15 .8 12 .8 7.4.8 3.4 3.4 1.5 7.2l3.8 3C6.3 7.4 8.9 5.4 12 5.4z"/><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"/><path fill="#FBBC05" d="M5.3 14.3a7 7 0 0 1 0-4.2l-3.8-3a11.2 11.2 0 0 0 0 10.2l3.8-3z"/><path fill="#34A853" d="M12 23.2c3 0 5.6-1 7.5-2.7l-3.7-2.9c-1 .7-2.3 1.1-3.8 1.1-3.1 0-5.7-2-6.7-4.8l-3.8 3c1.9 3.8 5.9 6.3 10.5 6.3z"/></svg>';
  return span;
}

function _buildDashboard(budget, months) {
  const frag = document.createDocumentFragment();

  // Header: saludo + botón "conectar cuentas" (estilo Google Sign-In)
  const subtitle = budget.is_current_month
    ? _monthLabel(budget.month) + ' · día ' + budget.days_passed + ' de ' + budget.days_in_month
    : _monthLabel(budget.month) + ' · mes cerrado';

  const header = _el('div', { className: 'page-header' },
    _el('div', {},
      _el('h2', {}, 'Hola, ' + (budget.name || 'Hernán')),
      _el('p', { style: 'color:var(--muted);font-size:.88rem;margin-top:2px;' }, subtitle)
    ),
    _el('button', {
      className: 'google-connect-btn',
      onclick: () => App.navigate('settings')
    }, _googleIcon(), 'Conectar cuentas')
  );
  frag.appendChild(header);

  // Selector de mes
  const monthRow = _el('div', { className: 'month-select-row' },
    _el('label', { style: 'font-size:.78rem;color:var(--muted);' }, 'Mes:')
  );
  const select = document.createElement('select');
  select.className = 'month-select';
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = _monthLabel(m) + (m === _currentMonthStr() ? ' (actual)' : '');
    if (m === budget.month) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => Dashboard._changeMonth(select.value));
  monthRow.appendChild(select);
  frag.appendChild(monthRow);

  // Balance editable + distribución por franja + límite de gasto mensual
  frag.appendChild(_buildOverviewCard(budget));

  // Distribución del gasto (torta) + gasto mes a mes (barras apiladas)
  const chartsRow = _el('div', { className: 'charts-row' },
    _el('div', { className: 'card chart-card' },
      _el('p', { className: 'section-title' }, 'Distribución del gasto'),
      _buildDonut(budget.franjas)
    ),
    _el('div', { className: 'card chart-card' },
      _el('p', { className: 'section-title' }, 'Gasto mes a mes'),
      _el('div', { id: 'monthly-vbar-chart' },
        (() => { const s = document.createElement('div'); s.className = 'spinner'; s.style.cssText = 'display:block;margin:30px auto;'; return s; })()
      )
    )
  );
  frag.appendChild(chartsRow);
  API.getBudgetHistory().then(hist => {
    const wrap = document.getElementById('monthly-vbar-chart');
    if (wrap) { wrap.textContent = ''; wrap.appendChild(_buildMonthlyStackedChart(hist)); }
  }).catch(() => {});

  return frag;
}

function _buildOverviewCard(budget) {
  const card = _el('div', { className: 'card', style: 'margin-bottom:24px;' });
  const top = _el('div', { className: 'balance-overview-top' },
    _buildBalanceBlock(budget),
    _buildFranjaBars(budget.franjas)
  );
  card.appendChild(top);
  card.appendChild(_buildLimitBar(budget));
  return card;
}

function _buildBalanceBlock(budget) {
  const wrap = _el('div', { className: 'balance-block' },
    _el('span', { className: 'metric-label' }, 'Balance actual')
  );
  const displayRow = _el('div', { className: 'balance-value-row', id: 'balance-display-row' },
    _el('span', { className: 'balance-value' + ((budget.balance || 0) < 0 ? ' negative' : '') }, App.fmt(budget.balance)),
    _el('button', {
      className: 'balance-icon-btn',
      title: 'Editar balance',
      onclick: () => _enterBalanceEdit(budget)
    }, '✎')
  );
  wrap.appendChild(displayRow);
  wrap.appendChild(_el('span', { style: 'font-size:.78rem;color:var(--muted);' }, 'Editable a mano para ajustes de cash'));
  return wrap;
}

function _enterBalanceEdit(budget) {
  const row = document.getElementById('balance-display-row');
  if (!row) return;
  row.textContent = '';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.value = budget.balance || 0;

  const reload = () => Dashboard.render(budget.is_current_month ? undefined : budget.month);

  const form = _el('div', { className: 'balance-edit-form' },
    input,
    _el('button', {
      className: 'btn btn-primary btn-sm',
      onclick: async function() {
        const val = parseFloat(input.value);
        if (Number.isNaN(val)) { App.toast('Ingresá un número válido', 'error'); return; }
        this.disabled = true;
        try {
          await API.updateBalance(val);
          App.toast('Balance actualizado', 'success');
          reload();
        } catch (err) {
          App.toast(err.message, 'error');
          this.disabled = false;
        }
      }
    }, 'Guardar'),
    _el('button', { className: 'btn btn-ghost btn-sm', onclick: reload }, 'Cancelar')
  );
  row.appendChild(form);
  input.focus();
  input.select();
}

function _buildFranjaBars(franjas) {
  const wrap = _el('div', { className: 'franja-bars' },
    _el('span', { className: 'metric-label' }, 'Distribución del gasto mensual')
  );
  const total = franjas.reduce((s, f) => s + f.spent, 0);
  franjas.forEach(f => {
    const pct = total > 0 ? (f.spent / total * 100) : 0;
    wrap.appendChild(_el('div', { className: 'franja-bar-row' },
      _el('span', { className: 'franja-bar-label' }, f.label),
      _el('div', { className: 'franja-bar-track' },
        _el('div', { className: 'franja-bar-fill', style: 'width:' + pct + '%;background:' + (FRANJA_COLORS[f.name] || '#888') })
      ),
      _el('span', { className: 'franja-bar-amount' }, App.fmt(f.spent))
    ));
  });
  return wrap;
}

function _buildLimitBar(budget) {
  const limit = budget.total_income || 0;
  const spent = budget.total_expenses || 0;
  const pct = limit > 0 ? Math.min(100, spent / limit * 100) : 0;
  const cls = App.progressClass(limit > 0 ? spent / limit * 100 : 0);
  return _el('div', { className: 'limit-bar-wrap' },
    _el('div', { className: 'limit-bar-labels' },
      _el('span', {}, 'Límite de gasto mensual'),
      _el('span', {}, App.fmt(spent) + ' / ' + App.fmt(limit))
    ),
    _el('div', { className: 'limit-bar-track' },
      _el('div', { className: 'limit-bar-fill progress-fill ' + cls, style: 'width:' + pct + '%' })
    )
  );
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

/* Barras verticales apiladas por mes: 3 segmentos (necesidades/gustos/ahorro), colores de marca. */
function _buildMonthlyStackedChart(hist) {
  if (!hist || !hist.length) {
    return _el('div', { className: 'empty' }, 'Todavía no hay histórico');
  }
  const months = hist.slice(0, 6).reverse();
  const max = Math.max(...months.map(m => m.franjas.reduce((s, f) => s + f.spent, 0)), 1);
  const BAR_AREA_PX = 130;

  const wrap = _el('div', {});
  const chart = _el('div', { className: 'vbar-chart' });
  months.forEach(m => {
    const total = m.franjas.reduce((s, f) => s + f.spent, 0);
    const stack = _el('div', {
      className: 'vbar-stack',
      style: 'height:' + Math.max(total / max * BAR_AREA_PX, total > 0 ? 2 : 0) + 'px'
    });
    m.franjas.forEach(f => {
      if (f.spent <= 0) return;
      const segPct = total > 0 ? (f.spent / total * 100) : 0;
      stack.appendChild(_el('div', {
        className: 'vbar-seg',
        style: 'height:' + segPct + '%;background:' + (FRANJA_COLORS[f.name] || '#888'),
        title: f.label + ': ' + App.fmt(f.spent),
      }));
    });
    chart.appendChild(_el('div', { className: 'vbar-col' },
      _el('span', { className: 'vbar-total' }, App.fmt(total)),
      _el('div', { className: 'vbar-bar-area' }, stack),
      _el('span', { className: 'vbar-label' }, _shortMonthLabel(m.month))
    ));
  });
  wrap.appendChild(chart);

  const legend = _el('div', { className: 'vbar-legend' });
  [['necesidades', 'Necesidades'], ['gustos', 'Gustos'], ['ahorro', 'Ahorro']].forEach(([k, label]) => {
    legend.appendChild(_el('div', { className: 'legend-item' },
      _el('span', { className: 'legend-dot', style: 'background:' + FRANJA_COLORS[k] }),
      _el('span', {}, label)
    ));
  });
  wrap.appendChild(legend);
  return wrap;
}
