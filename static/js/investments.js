/* Inversiones — vista única: resumen, P&L, allocation, posiciones, carga manual/CSV e historial. */
const Investments = {
  _broker_names: {
    cocos_capital: 'Cocos Capital',
    invertir_online: 'Invertir Online',
    bull_market: 'Bull Market',
    ppi: 'Portfolio Personal (PPI)',
    manual: 'Manual',
  },

  async render() {
    const main = document.getElementById('main');
    main.textContent = '';

    const page = document.createElement('div');
    page.className = 'inv-page';
    main.appendChild(page);

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    const back = document.createElement('button');
    back.className = 'btn-icon';
    back.textContent = '←';
    back.onclick = () => App.navigate('dashboard');
    header.appendChild(back);
    const title = document.createElement('h2');
    title.textContent = 'Inversiones';
    header.appendChild(title);

    const toolbar = document.createElement('div');
    toolbar.className = 'inv-toolbar';
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-primary btn-sm';
    refreshBtn.textContent = '↻ Actualizar precios';
    refreshBtn.onclick = () => this._refreshPrices(refreshBtn);
    toolbar.appendChild(refreshBtn);
    header.appendChild(toolbar);
    page.appendChild(header);

    // Contenedores
    const summaryWrap = document.createElement('div');
    page.appendChild(summaryWrap);

    const riskWrap = document.createElement('div');
    page.appendChild(riskWrap);

    const chartsWrap = document.createElement('div');
    page.appendChild(chartsWrap);

    const holdingsBlock = this._block('Posiciones abiertas');
    page.appendChild(holdingsBlock.block);

    page.appendChild(this._buildManualAndUpload());

    const historyBlock = this._block('Historial de movimientos');
    page.appendChild(historyBlock.block);

    // Cargar datos en paralelo
    const [summary, holdings, history] = await Promise.all([
      API.getInvestmentSummary().catch(() => null),
      API.getInvestmentHoldings().catch(() => []),
      API.getInvestmentHistory().catch(() => []),
    ]);

    this._renderSummary(summaryWrap, summary);
    this._renderRisk(riskWrap, summary);
    this._renderCharts(chartsWrap, holdings, summary);
    this._renderHoldings(holdingsBlock.body, holdings);
    this._renderHistory(historyBlock.body, history);
  },

  _block(titleText) {
    const block = document.createElement('div');
    block.className = 'inv-block';
    const t = document.createElement('p');
    t.className = 'section-title';
    t.textContent = titleText;
    block.appendChild(t);
    const body = document.createElement('div');
    block.appendChild(body);
    return { block, body };
  },

  _money(amount, currency) {
    const n = Number(amount || 0);
    if (currency === 'USD') {
      return 'US$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return App.fmt(n);
  },

  _renderSummary(wrap, s) {
    wrap.textContent = '';
    if (!s || (!s.holdings_count && !s.total_buys)) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Todavía no cargaste inversiones. Subí un CSV de tu broker o cargá un movimiento manual abajo.';
      wrap.appendChild(empty);
      return;
    }
    const metrics = document.createElement('div');
    metrics.className = 'inv-metrics';
    const unrealCls = s.total_unrealized >= 0 ? 'gain' : 'loss';
    const realCls = s.realized_pnl >= 0 ? 'gain' : 'loss';
    const totalCls = s.total_pnl >= 0 ? 'gain' : 'loss';
    [
      { lbl: 'Valor actual', val: App.fmt(s.total_current_value) },
      { lbl: 'Invertido', val: App.fmt(s.total_invested) },
      { lbl: 'P&L total', val: (s.total_pnl >= 0 ? '+' : '') + App.fmt(s.total_pnl), cls: totalCls },
      { lbl: 'P&L no realizado', val: (s.total_unrealized >= 0 ? '+' : '') + App.fmt(s.total_unrealized), cls: unrealCls },
      { lbl: 'P&L realizado', val: (s.realized_pnl >= 0 ? '+' : '') + App.fmt(s.realized_pnl), cls: realCls },
      { lbl: 'Compras / Ventas', val: App.fmt(s.total_buys) + ' / ' + App.fmt(s.total_sells) },
    ].forEach(m => {
      const box = document.createElement('div');
      box.className = 'inv-metric';
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = m.lbl;
      const val = document.createElement('span');
      val.className = 'val' + (m.cls ? ' ' + m.cls : '');
      val.textContent = m.val;
      box.appendChild(lbl);
      box.appendChild(val);
      metrics.appendChild(box);
    });
    wrap.appendChild(metrics);

    if (s.blue_rate) {
      const hint = document.createElement('p');
      hint.className = 'inv-pricehint';
      hint.textContent = 'Cripto valuada en USD y convertida a ARS al blue ($' +
        Number(s.blue_rate).toLocaleString('es-AR') + '). Acciones AR usan el último precio cargado.';
      wrap.appendChild(hint);
    }
  },

  _renderRisk(wrap, s) {
    wrap.textContent = '';
    if (!s) return;
    const items = [];
    (s.risk_flags || []).forEach(f => {
      items.push({
        cls: 'warning',
        text: `${f.ticker} representa ${f.pct.toFixed(0)}% de tu cartera — por encima del 30% recomendado para un solo instrumento.`,
      });
    });
    if (s.benchmark) {
      const b = s.benchmark;
      const better = b.portfolio_return_pct >= b.benchmark_return_pct;
      const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
      items.push({
        cls: better ? 'info' : 'warning',
        text: `Tu cartera rindió ${fmtPct(b.portfolio_return_pct)} desde ${b.since}, vs ${fmtPct(b.benchmark_return_pct)} del ${b.name} en el mismo período.`,
      });
    }
    if (!items.length) return;

    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'alert-item ' + it.cls;
      const icon = document.createElement('span');
      icon.className = 'alert-icon';
      icon.textContent = it.cls === 'warning' ? '⚠️' : 'ℹ️';
      const msg = document.createElement('span');
      msg.className = 'alert-msg';
      msg.textContent = it.text;
      div.appendChild(icon);
      div.appendChild(msg);
      wrap.appendChild(div);
    });
  },

  _renderCharts(wrap, holdings, summary) {
    wrap.textContent = '';
    const priced = (holdings || []).filter(h => h.current_value > 0);
    if (!priced.length) return;

    const grid = document.createElement('div');
    grid.className = 'inv-grid';

    // Allocation por activo
    const allocBlock = document.createElement('div');
    allocBlock.className = 'inv-block';
    allocBlock.style.margin = '0';
    const at = document.createElement('p');
    at.className = 'section-title';
    at.textContent = 'Distribución del portafolio';
    allocBlock.appendChild(at);
    allocBlock.appendChild(this._donut(priced.map(h => ({ label: h.ticker, value: h.current_value }))));
    grid.appendChild(allocBlock);

    // Por tipo (cripto vs acciones)
    if (summary && summary.by_type && Object.keys(summary.by_type).length) {
      const typeBlock = document.createElement('div');
      typeBlock.className = 'inv-block';
      typeBlock.style.margin = '0';
      const tt = document.createElement('p');
      tt.className = 'section-title';
      tt.textContent = 'Por tipo de activo';
      typeBlock.appendChild(tt);
      const labels = { crypto: 'Cripto', stock: 'Acciones / Bonos' };
      const data = Object.entries(summary.by_type).map(([k, v]) => ({
        label: labels[k] || k, value: v.current_value,
      }));
      typeBlock.appendChild(this._donut(data));
      grid.appendChild(typeBlock);
    }

    wrap.appendChild(grid);
  },

  _COLORS: ['#C97B4A', '#84A98C', '#5B8DEF', '#B07BAC', '#D4A03C', '#6FA8A0', '#A0674B', '#8A9182', '#A855F7'],

  _donut(items) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const wrap = document.createElement('div');
    wrap.className = 'donut-wrap';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('class', 'donut');
    const R = 48, C = 2 * Math.PI * R;
    let offset = 0;
    items.forEach((it, i) => {
      const frac = total > 0 ? it.value / total : 0;
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', '60'); circle.setAttribute('cy', '60'); circle.setAttribute('r', String(R));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', this._COLORS[i % this._COLORS.length]);
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
    txt.textContent = App.fmt(total);
    svg.appendChild(txt);
    wrap.appendChild(svg);

    const legend = document.createElement('div');
    legend.className = 'donut-legend';
    items.forEach((it, i) => {
      const pct = total > 0 ? Math.round(it.value / total * 100) : 0;
      const row = document.createElement('div');
      row.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = this._COLORS[i % this._COLORS.length];
      const label = document.createElement('span');
      label.textContent = it.label + ' · ' + pct + '% (' + App.fmt(it.value) + ')';
      row.appendChild(dot);
      row.appendChild(label);
      legend.appendChild(row);
    });
    wrap.appendChild(legend);
    return wrap;
  },

  _renderHoldings(body, holdings) {
    body.textContent = '';
    if (!holdings || !holdings.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Sin posiciones abiertas';
      body.appendChild(empty);
      return;
    }
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Activo', 'Cantidad', 'Costo prom.', 'Precio actual', 'Valor', 'P&L', 'P&L %'].forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (i >= 1) th.style.textAlign = 'right';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    holdings.forEach(h => {
      const tr = document.createElement('tr');
      const cls = h.pnl >= 0 ? 'gain' : 'loss';

      const tickerCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = h.ticker;
      tickerCell.appendChild(strong);
      const tag = document.createElement('span');
      tag.className = 'inv-tag ' + (h.asset_type || 'stock');
      tag.textContent = h.asset_type === 'crypto' ? 'cripto' : 'acción';
      tickerCell.appendChild(tag);
      if (!h.priced) {
        const np = document.createElement('span');
        np.className = 'inv-tag';
        np.textContent = 'sin precio';
        np.title = 'No hay precio de mercado; se usa el costo promedio';
        tickerCell.appendChild(np);
      }
      tr.appendChild(tickerCell);

      const cells = [
        h.quantity.toLocaleString('es-AR', { maximumFractionDigits: 6 }),
        this._money(h.avg_cost, h.currency),
        this._money(h.current_price, h.currency),
        this._money(h.current_value, h.currency),
      ];
      cells.forEach(text => {
        const td = document.createElement('td');
        td.style.textAlign = 'right';
        td.textContent = text;
        tr.appendChild(td);
      });

      const pnlTd = document.createElement('td');
      pnlTd.style.textAlign = 'right';
      pnlTd.style.color = `var(--${cls === 'gain' ? 'ok' : 'danger'})`;
      pnlTd.textContent = (h.pnl >= 0 ? '+' : '') + this._money(h.pnl, h.currency);
      tr.appendChild(pnlTd);

      const pctTd = document.createElement('td');
      pctTd.style.textAlign = 'right';
      pctTd.style.color = `var(--${cls === 'gain' ? 'ok' : 'danger'})`;
      pctTd.textContent = (h.pnl_percent >= 0 ? '+' : '') + h.pnl_percent.toFixed(2) + '%';
      tr.appendChild(pctTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
  },

  _renderHistory(body, history) {
    body.textContent = '';
    if (!history || !history.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Sin movimientos';
      body.appendChild(empty);
      return;
    }
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Fecha', 'Activo', 'Tipo', 'Cantidad', 'Precio', 'Total'].forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (i >= 3) th.style.textAlign = 'right';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    history.forEach(h => {
      const tr = document.createElement('tr');
      const date = document.createElement('td');
      date.textContent = h.date;
      tr.appendChild(date);
      const ticker = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = h.ticker;
      ticker.appendChild(strong);
      tr.appendChild(ticker);
      const type = document.createElement('td');
      type.textContent = h.type === 'buy' ? 'Compra' : 'Venta';
      type.style.color = h.type === 'buy' ? 'var(--ok)' : 'var(--gold)';
      tr.appendChild(type);
      [h.quantity.toLocaleString('es-AR', { maximumFractionDigits: 6 }),
       App.fmt(h.price), App.fmt(h.total)].forEach(text => {
        const td = document.createElement('td');
        td.style.textAlign = 'right';
        td.textContent = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
  },

  _buildManualAndUpload() {
    const block = document.createElement('div');
    block.className = 'inv-block';
    const t = document.createElement('p');
    t.className = 'section-title';
    t.textContent = 'Cargar movimiento';
    block.appendChild(t);

    const grid = document.createElement('div');
    grid.className = 'inv-grid';

    // --- Form manual ---
    const form = document.createElement('form');
    form.appendChild(this._field('Activo / ticker', 'ticker', 'text', 'BTC, GGAL, AL30…'));

    const typeGrp = document.createElement('div');
    typeGrp.className = 'form-group';
    const typeLbl = document.createElement('label');
    typeLbl.textContent = 'Tipo';
    typeGrp.appendChild(typeLbl);
    const typeSel = document.createElement('select');
    typeSel.name = 'tx_type';
    [['buy', 'Compra'], ['sell', 'Venta']].forEach(([v, l]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = l; typeSel.appendChild(o);
    });
    typeGrp.appendChild(typeSel);
    form.appendChild(typeGrp);

    const row = document.createElement('div');
    row.className = 'grid-2';
    row.appendChild(this._field('Cantidad', 'quantity', 'number', '0', '0.000001'));
    row.appendChild(this._field('Precio por unidad', 'price', 'number', '0', '0.01'));
    form.appendChild(row);

    const row2 = document.createElement('div');
    row2.className = 'grid-2';
    row2.appendChild(this._field('Fecha', 'date', 'date', '', null, new Date().toISOString().slice(0, 10)));
    const curGrp = document.createElement('div');
    curGrp.className = 'form-group';
    const curLbl = document.createElement('label');
    curLbl.textContent = 'Moneda';
    curGrp.appendChild(curLbl);
    const curSel = document.createElement('select');
    curSel.name = 'currency';
    [['ARS', 'Pesos (ARS)'], ['USD', 'Dólares (USD)']].forEach(([v, l]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = l; curSel.appendChild(o);
    });
    curGrp.appendChild(curSel);
    row2.appendChild(curGrp);
    form.appendChild(row2);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Agregar movimiento';
    form.appendChild(saveBtn);

    form.onsubmit = async (e) => {
      e.preventDefault();
      saveBtn.disabled = true;
      const fd = new FormData(form);
      try {
        await API.addInvestmentManual({
          ticker: fd.get('ticker'),
          tx_type: fd.get('tx_type'),
          quantity: parseFloat(fd.get('quantity')),
          price: parseFloat(fd.get('price')),
          date: fd.get('date'),
          currency: fd.get('currency'),
        });
        App.toast('Movimiento agregado', 'success');
        Investments.render();
      } catch (err) {
        App.toast(err.message, 'error');
        saveBtn.disabled = false;
      }
    };

    const manualWrap = document.createElement('div');
    const mt = document.createElement('p');
    mt.style.cssText = 'font-size:.8rem;color:var(--muted);margin-bottom:12px;';
    mt.textContent = 'Carga manual';
    manualWrap.appendChild(mt);
    manualWrap.appendChild(form);
    grid.appendChild(manualWrap);

    // --- Upload CSV ---
    const uploadWrap = document.createElement('div');
    const ut = document.createElement('p');
    ut.style.cssText = 'font-size:.8rem;color:var(--muted);margin-bottom:12px;';
    ut.textContent = 'Subir CSV/XLSX del broker (Cocos, IOL, Bull Market, PPI)';
    uploadWrap.appendChild(ut);
    uploadWrap.appendChild(this._buildUploadZone());
    grid.appendChild(uploadWrap);

    block.appendChild(grid);
    return block;
  },

  _field(label, name, type, placeholder, step, value) {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    grp.appendChild(lbl);
    const inp = document.createElement('input');
    inp.type = type;
    inp.name = name;
    if (placeholder) inp.placeholder = placeholder;
    if (step) inp.step = step;
    if (value) inp.value = value;
    inp.required = true;
    grp.appendChild(inp);
    return grp;
  },

  _buildUploadZone() {
    const zone = document.createElement('div');
    zone.className = 'upload-zone';
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:24px;margin-bottom:8px;';
    icon.textContent = '📁';
    zone.appendChild(icon);
    const p1 = document.createElement('p');
    p1.textContent = 'Arrastrá un CSV/XLSX o hacé clic';
    zone.appendChild(p1);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx';
    input.style.display = 'none';
    zone.appendChild(input);

    const status = document.createElement('div');
    status.style.cssText = 'margin-top:12px;font-size:.85rem;';

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--gold)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = 'var(--navy3)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.borderColor = 'var(--navy3)';
      if (e.dataTransfer.files.length) this._upload(e.dataTransfer.files[0], status);
    });
    input.addEventListener('change', e => { if (e.target.files[0]) this._upload(e.target.files[0], status); });

    const wrap = document.createElement('div');
    wrap.appendChild(zone);
    wrap.appendChild(status);
    return wrap;
  },

  async _upload(file, status) {
    status.textContent = 'Procesando…';
    status.style.color = 'var(--muted)';
    try {
      const r = await API.uploadInvestmentCSV(file);
      status.style.color = 'var(--ok)';
      status.textContent = `✓ ${this._broker_names[r.broker] || r.broker}: ${r.saved} de ${r.fetched} movimientos guardados`;
      setTimeout(() => Investments.render(), 1200);
    } catch (err) {
      status.style.color = 'var(--danger)';
      status.textContent = '✗ ' + err.message;
    }
  },

  async _refreshPrices(btn) {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Actualizando…';
    try {
      const r = await API.refreshInvestmentPrices();
      if (r.updated > 0) {
        App.toast(`Precios actualizados: ${r.updated} activos cripto`, 'success');
        Investments.render();
      } else {
        App.toast('No hay activos cripto para actualizar (las acciones AR usan precio manual)', 'info');
      }
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  },
};
