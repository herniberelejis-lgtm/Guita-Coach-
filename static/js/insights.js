/* Insights page — proyecciones y resumen */
const Insights = {
  async render() {
    const main = document.getElementById('main');
    main.textContent = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    const title = document.createElement('h2');
    title.textContent = 'Proyecciones';
    header.appendChild(title);
    main.appendChild(header);

    const sp = document.createElement('div');
    sp.className = 'spinner';
    sp.style.cssText = 'display:block;margin:80px auto;';
    main.appendChild(sp);

    const [insights, history] = await Promise.all([
      API.getInsights().catch(e => ({ error: e.message })),
      API.getBudgetHistory().catch(() => []),
    ]);

    main.removeChild(sp);

    if (insights.error) {
      const msg = document.createElement('div');
      msg.className = 'card';
      msg.style.color = 'var(--muted)';
      msg.textContent = insights.error;
      main.appendChild(msg);
      return;
    }

    // Summary stats
    const grid = document.createElement('div');
    grid.className = 'grid-3';
    grid.style.marginBottom = '24px';
    [
      [App.fmt(insights.total_spent), 'Gastado este mes'],
      [insights.days_remaining + ' días', 'Hasta fin de mes'],
      [insights.days_to_payday + ' días', 'Para el próximo cobro'],
    ].forEach(([val, lbl]) => {
      const pill = document.createElement('div');
      pill.className = 'stat-pill';
      const inner = document.createElement('div');
      const v = document.createElement('div');
      v.className = 'val'; v.textContent = val;
      const l = document.createElement('div');
      l.className = 'lbl'; l.textContent = lbl;
      inner.appendChild(v); inner.appendChild(l);
      pill.appendChild(inner);
      grid.appendChild(pill);
    });
    main.appendChild(grid);

    // Per-franja projection cards
    const secTitle = document.createElement('p');
    secTitle.className = 'section-title';
    secTitle.textContent = 'Proyección por franja';
    main.appendChild(secTitle);

    const franjaGrid = document.createElement('div');
    franjaGrid.className = 'grid-3';
    franjaGrid.style.marginBottom = '24px';

    const labels = { necesidades: 'Necesidades', gustos: 'Gustos', ahorro: 'Ahorro' };
    for (const [cat, f] of Object.entries(insights.franjas)) {
      const card = document.createElement('div');
      card.className = 'card';

      const cardTitle = document.createElement('h3');
      cardTitle.style.marginBottom = '12px';
      cardTitle.style.color = 'var(--gold)';
      cardTitle.textContent = labels[cat];
      card.appendChild(cardTitle);

      const rows = [
        ['Gastado', App.fmt(f.spent)],
        ['Límite', App.fmt(f.limit)],
        ['Ritmo diario', App.fmt(f.daily_rate) + '/día'],
        ['Proyección', App.fmt(f.projected_total)],
      ];
      rows.forEach(([l, v]) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:6px;';
        const lbl = document.createElement('span');
        lbl.style.color = 'var(--muted)';
        lbl.textContent = l;
        const val = document.createElement('span');
        val.style.fontWeight = '600';
        val.textContent = v;
        row.appendChild(lbl); row.appendChild(val);
        card.appendChild(row);
      });

      if (f.will_exceed) {
        const warn = document.createElement('div');
        warn.style.cssText = 'margin-top:10px;padding:8px 12px;background:rgba(224,82,82,.1);border-radius:6px;font-size:.8rem;color:var(--danger);';
        warn.textContent = 'Va a superar el límite este mes';
        card.appendChild(warn);
      }

      if (f.top_merchants?.length) {
        const hr = document.createElement('hr');
        hr.className = 'divider';
        card.appendChild(hr);
        const topTitle = document.createElement('p');
        topTitle.style.cssText = 'font-size:.75rem;color:var(--muted);margin-bottom:8px;';
        topTitle.textContent = 'Top gastos';
        card.appendChild(topTitle);
        f.top_merchants.forEach(m => {
          const mRow = document.createElement('div');
          mRow.style.cssText = 'display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:4px;';
          const mn = document.createElement('span');
          mn.textContent = m.merchant;
          const ma = document.createElement('span');
          ma.style.color = 'var(--muted)';
          ma.textContent = App.fmt(m.amount);
          mRow.appendChild(mn); mRow.appendChild(ma);
          card.appendChild(mRow);
        });
      }

      franjaGrid.appendChild(card);
    }
    main.appendChild(franjaGrid);

    // Historical comparison
    if (history.length > 1) {
      const histTitle = document.createElement('p');
      histTitle.className = 'section-title';
      histTitle.textContent = 'Histórico (últimos meses)';
      main.appendChild(histTitle);

      const histCard = document.createElement('div');
      histCard.className = 'card';

      const table = document.createElement('table');
      table.className = 'tx-table';
      const thead = table.createTHead();
      const hr = thead.insertRow();
      ['Mes', 'Total', 'Necesidades', 'Gustos', 'Ahorro'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        hr.appendChild(th);
      });
      const tbody = table.createTBody();
      history.forEach(m => {
        const tr = tbody.insertRow();
        [
          m.month,
          App.fmt(m.total),
          App.fmt(m.by_category?.necesidades || 0),
          App.fmt(m.by_category?.gustos || 0),
          App.fmt(m.by_category?.ahorro || 0),
        ].forEach(val => {
          const td = tr.insertCell();
          td.textContent = val;
        });
      });
      histCard.appendChild(table);
      main.appendChild(histCard);
    }
  },
};
