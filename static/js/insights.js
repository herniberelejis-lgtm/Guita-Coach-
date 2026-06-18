/* Insights page — franjas con limite diario + comercios frecuentes */
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

    const month = new Date().toISOString().slice(0, 7);

    const [insights, budget] = await Promise.all([
      API.getInsights().catch(() => null),
      API.getBudget().catch(() => null),
    ]);

    main.removeChild(sp);

    if (!insights) {
      const msg = document.createElement('div');
      msg.className = 'card';
      msg.style.color = 'var(--muted)';
      msg.textContent = 'No hay datos para mostrar este mes.';
      main.appendChild(msg);
      return;
    }

    // Top stat: daily allowance global
    if (insights.daily_allowance != null) {
      const pill = document.createElement('div');
      pill.className = 'card';
      pill.style.cssText = 'margin-bottom:20px;display:flex;align-items:center;gap:16px;padding:20px;';
      const icon = document.createElement('div');
      icon.style.cssText = 'font-size:1.5rem;font-weight:800;color:var(--ok);min-width:40px;text-align:center;';
      icon.textContent = '$';
      const txt = document.createElement('div');
      const v = document.createElement('div');
      v.style.cssText = 'font-size:1.5rem;font-weight:700;color:var(--ok);';
      v.textContent = App.fmt(insights.daily_allowance) + '/día';
      const l = document.createElement('div');
      l.style.cssText = 'font-size:.82rem;color:var(--muted);margin-top:2px;';
      l.textContent = 'Disponible diario · ' + (insights.days_remaining || 0) + ' días restantes';
      txt.appendChild(v);
      txt.appendChild(l);
      pill.appendChild(icon);
      pill.appendChild(txt);
      main.appendChild(pill);
    }

    // Franjas
    const LABELS = { necesidades: 'Necesidades', gustos: 'Gustos', ahorro: 'Ahorro' };
    const COLORS = { necesidades: '#3B82F6', gustos: '#A855F7', ahorro: 'var(--ok)' };

    const franjasTitle = document.createElement('p');
    franjasTitle.className = 'section-title';
    franjasTitle.textContent = 'Franjas del mes';
    main.appendChild(franjasTitle);

    (Array.isArray(insights.franjas) ? insights.franjas : []).forEach(function(f) {
      const pct = f.limit > 0 ? Math.round(f.spent / f.limit * 100) : 0;
      const cls = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : 'ok';

      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '16px';

      // Header row
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
      const name = document.createElement('span');
      name.style.fontWeight = '600';
      name.textContent = LABELS[f.category] || f.category;
      const pctLbl = document.createElement('span');
      pctLbl.style.cssText = 'font-size:.85rem;font-weight:600;color:var(--' + cls + ');';
      pctLbl.textContent = pct + '%';
      hdr.appendChild(name);
      hdr.appendChild(pctLbl);
      card.appendChild(hdr);

      // Progress bar
      const barBg = document.createElement('div');
      barBg.style.cssText = 'background:rgba(255,255,255,.08);border-radius:99px;height:8px;margin-bottom:14px;overflow:hidden;';
      const barFill = document.createElement('div');
      barFill.style.cssText = 'height:100%;border-radius:99px;transition:width .4s;background:' + (COLORS[f.category] || '#888') + ';width:' + Math.min(pct, 100) + '%;';
      barBg.appendChild(barFill);
      card.appendChild(barBg);

      // Stats row
      const stats = document.createElement('div');
      stats.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;font-size:.82rem;color:var(--muted);margin-bottom:12px;';
      [
        'Gastado: ' + App.fmt(f.spent),
        'Límite: ' + App.fmt(f.limit),
        'Resta: ' + App.fmt(f.remaining),
      ].forEach(function(txt) {
        const s = document.createElement('span');
        s.textContent = txt;
        stats.appendChild(s);
      });
      // Daily allowance highlight
      const daily = document.createElement('span');
      daily.style.cssText = 'color:var(--ok);font-weight:600;';
      daily.textContent = App.fmt(f.daily_allowance) + '/día disponible';
      stats.appendChild(daily);
      card.appendChild(stats);

      // Advice button
      const adviceBtn = document.createElement('button');
      adviceBtn.className = 'btn btn-ghost btn-sm';
      adviceBtn.textContent = 'Pedir consejo IA';
      const adviceBox = document.createElement('div');
      adviceBox.style.cssText = 'display:none;margin-top:12px;padding:12px;background:var(--navy3);border-radius:8px;font-size:.85rem;line-height:1.55;color:var(--white);';

      adviceBtn.addEventListener('click', async function() {
        adviceBtn.disabled = true;
        adviceBtn.textContent = 'Consultando…';
        try {
          const res = await fetch('/api/advisor/advice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month: month, focus: f.category }),
          });
          const d = await res.json();
          adviceBox.textContent = d.advice;
          adviceBox.style.display = 'block';
        } catch (_) {
          adviceBox.textContent = 'No se pudo obtener el consejo. Intentá de nuevo.';
          adviceBox.style.display = 'block';
        } finally {
          adviceBtn.disabled = false;
          adviceBtn.textContent = 'Pedir consejo IA';
        }
      });

      card.appendChild(adviceBtn);
      card.appendChild(adviceBox);
      main.appendChild(card);
    });

    // Frequent merchants
    if (insights.frequent_merchants && insights.frequent_merchants.length > 0) {
      const freqTitle = document.createElement('p');
      freqTitle.className = 'section-title';
      freqTitle.textContent = 'Tus hábitos este mes';
      main.appendChild(freqTitle);

      const freqCard = document.createElement('div');
      freqCard.className = 'card';

      insights.frequent_merchants.forEach(function(m, i) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;' +
          (i < insights.frequent_merchants.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,.06);' : '');

        const left = document.createElement('div');
        const mName = document.createElement('div');
        mName.style.fontWeight = '500';
        mName.textContent = m.merchant;
        const mCount = document.createElement('div');
        mCount.style.cssText = 'font-size:.78rem;color:var(--muted);margin-top:2px;';
        mCount.textContent = m.count + ' veces este mes';
        left.appendChild(mName);
        left.appendChild(mCount);

        const right = document.createElement('div');
        right.style.cssText = 'font-weight:600;text-align:right;';
        right.textContent = App.fmt(m.total);

        row.appendChild(left);
        row.appendChild(right);
        freqCard.appendChild(row);
      });

      main.appendChild(freqCard);
    }
  },
};
