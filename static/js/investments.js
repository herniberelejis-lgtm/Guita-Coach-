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

    const analyticsWrap = document.createElement('div');
    page.appendChild(analyticsWrap);

    const riskMetricsWrap = document.createElement('div');
    page.appendChild(riskMetricsWrap);

    const timelineWrap = document.createElement('div');
    page.appendChild(timelineWrap);

    const chartsWrap = document.createElement('div');
    page.appendChild(chartsWrap);

    const holdingsBlock = this._block('Posiciones abiertas');
    page.appendChild(holdingsBlock.block);

    const closedBlock = this._block('Posiciones cerradas');
    page.appendChild(closedBlock.block);

    page.appendChild(this._buildManualAndUpload());

    const historyBlock = this._block('Historial de movimientos');
    page.appendChild(historyBlock.block);

    // Cargar datos en paralelo
    const [summary, holdings, history, timeline, closed, analytics, riskMetrics] = await Promise.all([
      API.getInvestmentSummary().catch(() => null),
      API.getInvestmentHoldings().catch(() => []),
      API.getInvestmentHistory().catch(() => []),
      API.getInvestmentTimeline().catch(() => null),
      API.getInvestmentClosed().catch(() => []),
      API.getInvestmentAnalytics().catch(() => null),
      API.getInvestmentRiskMetrics().catch(() => null),
    ]);

    this._renderSummary(summaryWrap, summary);
    this._renderRisk(riskWrap, summary);
    this._renderAnalytics(analyticsWrap, analytics);
    this._renderRiskMetrics(riskMetricsWrap, riskMetrics);
    this._renderTimeline(timelineWrap, timeline);
    this._renderCharts(chartsWrap, holdings, summary);
    this._renderHoldings(holdingsBlock.body, holdings);
    this._renderClosed(closedBlock.body, closed);
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
    if (s.diversification_score != null && (s.holdings_count || 0) > 1) {
      const score = Math.round(s.diversification_score);
      items.push({
        cls: score < 40 ? 'warning' : 'info',
        text: `Score de diversificación: ${score}/100 (100 = repartida en partes iguales entre tus activos, 0 = concentrada en uno solo).`,
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

  _renderTimeline(wrap, timeline) {
    wrap.textContent = '';
    if (!timeline || !timeline.points || timeline.points.length < 2) return;
    const block = document.createElement('div');
    block.className = 'inv-block';
    const t = document.createElement('p');
    t.className = 'section-title';
    t.textContent = 'Evolución de la cartera';
    block.appendChild(t);
    const series = [
      { label: 'Valor de mercado', color: '#5B8DEF', points: timeline.points.map(p => ({ x: p.date, y: p.market_value })) },
      { label: 'Invertido (costo)', color: '#84A98C', points: timeline.points.map(p => ({ x: p.date, y: p.cost_basis })) },
    ];
    block.appendChild(this._lineChart(series));
    const hint = document.createElement('p');
    hint.className = 'inv-pricehint';
    hint.textContent = `Desde ${timeline.points[0].date} hasta ${timeline.points[timeline.points.length - 1].date}, valores en ${timeline.currency}.`;
    block.appendChild(hint);
    wrap.appendChild(block);
  },

  _compactMoney(v) {
    const abs = Math.abs(v);
    if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'k';
    return Math.round(v).toString();
  },

  _lineChart(series) {
    const W = 600, H = 220, padL = 42, padR = 10, padT = 10, padB = 24;
    const wrap = document.createElement('div');
    wrap.className = 'linechart-wrap';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'linechart');
    svg.setAttribute('preserveAspectRatio', 'none');

    const allYs = series.flatMap(s => s.points.map(p => p.y));
    let maxY = Math.max(...allYs, 0);
    let minY = Math.min(...allYs, 0);
    if (maxY === minY) maxY = minY + 1;
    const n = series[0] ? series[0].points.length : 0;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const xAt = i => padL + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
    const yAt = v => padT + innerH - ((v - minY) / (maxY - minY)) * innerH;

    [0, 0.5, 1].forEach(f => {
      const y = padT + innerH * f;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(padL)); line.setAttribute('x2', String(W - padR));
      line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y));
      line.setAttribute('class', 'linechart-grid');
      svg.appendChild(line);
      const val = maxY - (maxY - minY) * f;
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', '2'); txt.setAttribute('y', String(y + 3));
      txt.setAttribute('class', 'linechart-axis');
      txt.textContent = this._compactMoney(val);
      svg.appendChild(txt);
    });

    series.forEach(s => {
      const pts = s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ');
      const poly = document.createElementNS(svgNS, 'polyline');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', s.color);
      poly.setAttribute('stroke-width', '2');
      svg.appendChild(poly);
    });

    wrap.appendChild(svg);

    const legend = document.createElement('div');
    legend.className = 'linechart-legend';
    series.forEach(s => {
      const last = s.points[s.points.length - 1];
      const row = document.createElement('div');
      row.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = s.color;
      const label = document.createElement('span');
      label.textContent = `${s.label}: ${App.fmt(last ? last.y : 0)}`;
      row.appendChild(dot);
      row.appendChild(label);
      legend.appendChild(row);
    });
    wrap.appendChild(legend);
    return wrap;
  },

  _renderClosed(body, closed) {
    body.textContent = '';
    if (!closed || !closed.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Sin posiciones cerradas todavía';
      body.appendChild(empty);
      return;
    }
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Activo', 'Estado', 'Compra prom.', 'Venta prom.', 'P&L realizado', 'Período'].forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (i >= 2 && i <= 4) th.style.textAlign = 'right';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    closed.forEach(c => {
      const tr = document.createElement('tr');
      const cls = c.realized_pnl >= 0 ? 'gain' : 'loss';

      const tickerCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = c.ticker;
      tickerCell.appendChild(strong);
      tr.appendChild(tickerCell);

      const statusTd = document.createElement('td');
      statusTd.textContent = c.status === 'closed' ? 'Cerrada' : 'Venta parcial';
      tr.appendChild(statusTd);

      [this._money(c.avg_buy_price, c.currency), this._money(c.avg_sell_price, c.currency)].forEach(text => {
        const td = document.createElement('td');
        td.style.textAlign = 'right';
        td.textContent = text;
        tr.appendChild(td);
      });

      const pnlTd = document.createElement('td');
      pnlTd.style.textAlign = 'right';
      pnlTd.style.color = `var(--${cls === 'gain' ? 'ok' : 'danger'})`;
      let pnlText = (c.realized_pnl >= 0 ? '+' : '') + this._money(c.realized_pnl, c.currency);
      if (c.currency === 'USD') {
        pnlText += ` (${(c.realized_pnl_ars >= 0 ? '+' : '') + App.fmt(c.realized_pnl_ars)})`;
      }
      pnlTd.textContent = pnlText;
      tr.appendChild(pnlTd);

      const periodTd = document.createElement('td');
      periodTd.textContent = `${c.first_date || '?'} → ${c.last_date || '?'}`;
      tr.appendChild(periodTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
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
      tr.className = 'inv-holding-row';
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

      const detailTr = document.createElement('tr');
      detailTr.className = 'inv-detail-row';
      detailTr.style.display = 'none';
      const detailTd = document.createElement('td');
      detailTd.colSpan = 7;
      detailTr.appendChild(detailTd);
      tbody.appendChild(detailTr);

      let loaded = false;
      tr.addEventListener('click', async () => {
        const isOpen = detailTr.style.display !== 'none';
        if (isOpen) { detailTr.style.display = 'none'; return; }
        detailTr.style.display = '';
        if (loaded) return;
        loaded = true;
        detailTd.textContent = 'Cargando…';
        try {
          const detail = await API.getInvestmentTickerDetail(h.ticker);
          this._renderTickerDetail(detailTd, detail);
        } catch (err) {
          detailTd.textContent = 'No se pudo cargar el detalle: ' + err.message;
        }
      });
    });
    table.appendChild(tbody);
    body.appendChild(table);
  },

  _renderTickerDetail(td, detail) {
    td.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'inv-ticker-detail';
    if (detail.price_history && detail.price_history.length >= 2) {
      const series = [{
        label: detail.ticker + ' · precio',
        color: '#C97B4A',
        points: detail.price_history.map(p => ({ x: p.date, y: p.price })),
      }];
      wrap.appendChild(this._lineChart(series));
    }
    const txTitle = document.createElement('p');
    txTitle.style.cssText = 'font-size:.8rem;color:var(--muted);margin:12px 0 8px;';
    txTitle.textContent = 'Tus movimientos en ' + detail.ticker;
    wrap.appendChild(txTitle);
    const histBody = document.createElement('div');
    this._renderHistory(histBody, detail.transactions);
    wrap.appendChild(histBody);
    td.appendChild(wrap);
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

  _renderAnalytics(wrap, data) {
    if (!data) {
      wrap.textContent = '';
      return;
    }

    const block = document.createElement('div');
    block.className = 'inv-block';
    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'Análisis';
    block.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'inv-grid';

    const metrics = [
      { label: 'TIR (%)', value: data.xirr_pct !== null ? data.xirr_pct.toFixed(2) : '—' },
      { label: 'Win Rate', value: `${data.win_rate_pct.toFixed(0)}%` },
      { label: 'Profit Factor', value: data.profit_factor.toFixed(2) },
      { label: 'Mejor Trade', value: data.best_trade_pct !== null ? `${data.best_trade_pct.toFixed(1)}%` : '—' },
      { label: 'Peor Trade', value: data.worst_trade_pct !== null ? `${data.worst_trade_pct.toFixed(1)}%` : '—' },
      { label: 'Holding Promedio', value: `${data.avg_holding_days.toFixed(0)} días` },
    ];

    metrics.forEach(m => {
      const box = document.createElement('div');
      box.className = 'inv-metric';
      box.innerHTML = `<p class="label">${m.label}</p><p class="value">${m.value}</p>`;
      grid.appendChild(box);
    });

    block.appendChild(grid);

    if (data.fiscal_summary && Object.keys(data.fiscal_summary).length > 0) {
      const fiscal = document.createElement('div');
      fiscal.style.marginTop = '12px';
      const fTitle = document.createElement('p');
      fTitle.style.cssText = 'font-size:.9rem;color:var(--muted);margin-bottom:6px;';
      fTitle.textContent = 'Resumen Fiscal';
      fiscal.appendChild(fTitle);

      const table = document.createElement('table');
      table.style.cssText = 'width:100%;font-size:.85rem;';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Año</th><th>P&L Realizado</th><th>Eventos</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      Object.entries(data.fiscal_summary).forEach(([year, val]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${year}</td><td>${App.fmt(val.realized_pnl)}</td><td>${val.tax_event_count}</td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      fiscal.appendChild(table);
      block.appendChild(fiscal);
    }

    wrap.appendChild(block);
  },

  _renderRiskMetrics(wrap, data) {
    if (!data) {
      wrap.textContent = '';
      return;
    }

    const block = document.createElement('div');
    block.className = 'inv-block';
    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'Métricas de Riesgo Avanzadas';
    block.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'inv-grid';

    const metrics = [
      { label: 'VaR 95%', value: data.var_95_pct !== null ? `${data.var_95_pct.toFixed(2)}%` : '—' },
      { label: 'VaR 99%', value: data.var_99_pct !== null ? `${data.var_99_pct.toFixed(2)}%` : '—' },
      { label: 'CVaR 95%', value: data.cvar_95_pct !== null ? `${data.cvar_95_pct.toFixed(2)}%` : '—' },
      { label: 'CVaR 99%', value: data.cvar_99_pct !== null ? `${data.cvar_99_pct.toFixed(2)}%` : '—' },
      { label: 'Max Drawdown', value: `${data.max_drawdown_pct.toFixed(2)}%` },
      { label: 'Drawdown Actual', value: `${data.current_drawdown_pct.toFixed(2)}%` },
    ];

    metrics.forEach(m => {
      const box = document.createElement('div');
      box.className = 'inv-metric';
      box.innerHTML = `<p class="label">${m.label}</p><p class="value">${m.value}</p>`;
      grid.appendChild(box);
    });

    block.appendChild(grid);

    // Stress scenarios
    if (data.stress_scenarios && Object.keys(data.stress_scenarios).length > 0) {
      const stress = document.createElement('div');
      stress.style.marginTop = '12px';
      const sTitle = document.createElement('p');
      sTitle.style.cssText = 'font-size:.9rem;color:var(--muted);margin-bottom:6px;';
      sTitle.textContent = 'Escenarios de Estrés';
      stress.appendChild(sTitle);

      const stressGrid = document.createElement('div');
      stressGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;';
      Object.entries(data.stress_scenarios).forEach(([scenario, value]) => {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid var(--navy3);padding:8px;border-radius:4px;font-size:.8rem;text-align:center;';
        box.innerHTML = `<p style="color:var(--muted);margin:0;">${scenario}</p><p style="margin:4px 0 0;font-weight:bold;">${App.fmt(value)}</p>`;
        stressGrid.appendChild(box);
      });
      stress.appendChild(stressGrid);
      block.appendChild(stress);
    }

    // Correlation matrix
    if (data.correlation && Object.keys(data.correlation).length > 0) {
      const corr = document.createElement('div');
      corr.style.marginTop = '12px';
      const cTitle = document.createElement('p');
      cTitle.style.cssText = 'font-size:.9rem;color:var(--muted);margin-bottom:6px;';
      cTitle.textContent = 'Matriz de Correlación';
      corr.appendChild(cTitle);

      const table = document.createElement('table');
      table.style.cssText = 'width:100%;font-size:.75rem;border-collapse:collapse;';
      const tickers = Object.keys(data.correlation).sort();

      // Header
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      headerRow.innerHTML = '<th style="text-align:left;"></th>';
      tickers.forEach(t => {
        headerRow.innerHTML += `<th style="padding:4px;">${t}</th>`;
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Body
      const tbody = document.createElement('tbody');
      tickers.forEach(t1 => {
        const row = document.createElement('tr');
        row.innerHTML = `<td style="text-align:left;font-weight:bold;">${t1}</td>`;
        tickers.forEach(t2 => {
          const val = data.correlation[t1] && data.correlation[t1][t2] !== undefined ? data.correlation[t1][t2] : 0;
          const color = val > 0 ? '#ff6b6b' : val < 0 ? '#51cf66' : '#888';
          row.innerHTML += `<td style="text-align:center;padding:4px;background-color:${color}20;">${val.toFixed(2)}</td>`;
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      corr.appendChild(table);
      block.appendChild(corr);
    }

    wrap.appendChild(block);
  },
};
