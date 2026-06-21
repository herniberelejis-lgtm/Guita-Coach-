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

    const [insights, budget, history] = await Promise.all([
      API.getInsights().catch(() => null),
      API.getBudget().catch(() => null),
      API.getBudgetHistory().catch(() => []),
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

    // Proyección de fin de mes (a este ritmo)
    const franjasArr = Array.isArray(insights.franjas) ? insights.franjas : [];
    const projectedTotal = franjasArr.reduce((s, f) => s + (f.projected_total || 0), 0);
    const incomeRef = (budget && budget.total_income) || insights.income || 0;
    if (projectedTotal > 0) {
      const willExceed = incomeRef > 0 && projectedTotal > incomeRef;
      const fc = document.createElement('div');
      fc.className = 'card';
      fc.style.cssText = 'margin-bottom:20px;border-left:4px solid var(--' + (willExceed ? 'danger' : 'ok') + ');';
      const t = document.createElement('p');
      t.className = 'section-title';
      t.style.marginBottom = '8px';
      t.textContent = 'Proyección a fin de mes';
      fc.appendChild(t);
      const big = document.createElement('div');
      big.style.cssText = 'font-size:1.6rem;font-weight:700;color:var(--' + (willExceed ? 'danger' : 'white') + ');';
      big.textContent = App.fmt(projectedTotal);
      fc.appendChild(big);
      const sub = document.createElement('p');
      sub.style.cssText = 'font-size:.85rem;color:var(--muted);margin-top:4px;';
      sub.textContent = incomeRef > 0
        ? (willExceed
            ? 'A este ritmo te vas a pasar ' + App.fmt(projectedTotal - incomeRef) + ' de tus ingresos (' + App.fmt(incomeRef) + ').'
            : 'A este ritmo vas a gastar el ' + Math.round(projectedTotal / incomeRef * 100) + '% de tus ingresos (' + App.fmt(incomeRef) + '). Te sobrarían ' + App.fmt(incomeRef - projectedTotal) + '.')
        : 'Gasto estimado al cierre del mes según tu ritmo actual.';
      fc.appendChild(sub);
      main.appendChild(fc);
    }

    // Evolución del gasto (últimos meses)
    const evo = Insights._evolutionChart(history);
    if (evo) {
      const evoTitle = document.createElement('p');
      evoTitle.className = 'section-title';
      evoTitle.textContent = 'Evolución del gasto';
      main.appendChild(evoTitle);
      const evoCard = document.createElement('div');
      evoCard.className = 'card';
      evoCard.style.marginBottom = '24px';
      evoCard.appendChild(evo);
      main.appendChild(evoCard);
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

      // Proyección de la franja a fin de mes
      if (f.projected_total != null) {
        const proj = document.createElement('div');
        proj.style.cssText = 'font-size:.8rem;margin-bottom:12px;color:var(--' + (f.will_exceed ? 'danger' : 'muted') + ');';
        proj.textContent = 'Proyección fin de mes: ' + App.fmt(f.projected_total) +
          (f.will_exceed ? ' · te vas a pasar del límite' : ' · dentro del límite');
        card.appendChild(proj);
      }

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

  _monthLabel(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    if (!m) return ym || '';
    return new Date(+m[1], +m[2] - 1, 1)
      .toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  },

  /* Gráfico de línea SVG del gasto total por mes (evolución). */
  _evolutionChart(history) {
    const months = (Array.isArray(history) ? history : [])
      .map(m => ({
        label: Insights._monthLabel(m.month),
        total: (m.franjas || []).reduce((s, f) => s + (f.spent || 0), 0),
      }))
      .filter(m => m.label);
    months.reverse(); // history viene de más reciente a más viejo → cronológico
    if (months.length < 2) return null;

    const W = 600, H = 200, padL = 10, padR = 10, padT = 18, padB = 26;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const max = Math.max(...months.map(m => m.total), 1);
    const x = i => padL + (i / (months.length - 1)) * innerW;
    const y = v => padT + innerH - (v / max) * innerH;
    const ns = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.maxHeight = '220px';

    const pts = months.map((m, i) => `${x(i).toFixed(1)},${y(m.total).toFixed(1)}`).join(' ');

    const area = document.createElementNS(ns, 'polygon');
    area.setAttribute('points', `${padL},${y(0)} ${pts} ${padL + innerW},${y(0)}`);
    area.style.fill = 'var(--gold)';
    area.style.opacity = '0.12';
    svg.appendChild(area);

    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', pts);
    line.style.fill = 'none';
    line.style.stroke = 'var(--gold)';
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);

    months.forEach((m, i) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x(i).toFixed(1));
      c.setAttribute('cy', y(m.total).toFixed(1));
      c.setAttribute('r', '3.5');
      c.style.fill = 'var(--gold)';
      const title = document.createElementNS(ns, 'title');
      title.textContent = m.label + ': ' + App.fmt(m.total);
      c.appendChild(title);
      svg.appendChild(c);

      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', x(i).toFixed(1));
      tx.setAttribute('y', H - 8);
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('font-size', '11');
      tx.style.fill = 'var(--muted)';
      tx.textContent = m.label;
      svg.appendChild(tx);
    });

    return svg;
  },
};
