/* Metas de ahorro + gastos fijos/cuotas */
const Goals = {
  async render() {
    const main = document.getElementById('main');
    main.textContent = '';
    const spin = document.createElement('div');
    spin.className = 'spinner';
    spin.style.cssText = 'margin:80px auto;display:block;';
    main.appendChild(spin);

    const [goals, recurring, dolar] = await Promise.all([
      API.getGoals().catch(() => []),
      API.getRecurring().catch(() => ({ items: [], monthly_committed: 0 })),
      API.getDolar().catch(() => null),
    ]);

    main.textContent = '';
    main.appendChild(this._build(goals, recurring, dolar));
  },

  _build(goals, recurring, dolar) {
    const frag = document.createDocumentFragment();

    frag.appendChild(_el('div', { className: 'page-header' },
      _el('div', {},
        _el('h2', {}, 'Metas y gastos fijos'),
        _el('p', { style: 'color:var(--muted);font-size:.88rem;margin-top:2px;' },
          dolar?.blue?.venta ? 'Dólar blue: $' + dolar.blue.venta : '')
      ),
      _el('button', { className: 'btn btn-primary btn-sm', onclick: () => Goals._goalForm() }, '+ Nueva meta')
    ));

    // ── Metas ──
    const goalsWrap = _el('div', { className: 'card', style: 'margin-bottom:20px;' },
      _el('p', { className: 'section-title' }, 'Metas de ahorro'));
    if (!goals.length) {
      goalsWrap.appendChild(_el('div', { className: 'empty' },
        'Creá tu primera meta: un viaje, el fondo de emergencia, lo que quieras.'));
    } else {
      goals.forEach(g => goalsWrap.appendChild(this._goalCard(g, dolar)));
    }
    frag.appendChild(goalsWrap);

    // ── Gastos fijos ──
    const recWrap = _el('div', { className: 'card' },
      _el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;' },
        _el('p', { className: 'section-title', style: 'margin:0;' },
          'Gastos fijos y cuotas · ' + App.fmt(recurring.monthly_committed) + '/mes'),
        _el('button', { className: 'btn btn-sm', onclick: () => Goals._recurringForm() }, '+ Agregar')
      ));
    if (!recurring.items.length) {
      recWrap.appendChild(_el('div', { className: 'empty' },
        'Cargá el alquiler, suscripciones o compras en cuotas una sola vez: se descuentan solos cada mes.'));
    } else {
      recurring.items.forEach(i => recWrap.appendChild(this._recurringRow(i)));
    }
    frag.appendChild(recWrap);
    return frag;
  },

  _goalCard(g, dolar) {
    const usd = g.currency === 'ARS' && dolar?.blue?.venta
      ? ' (~US$' + Math.round(g.saved_amount / dolar.blue.venta).toLocaleString('es-AR') + ')'
      : '';
    const card = _el('div', { className: 'goal-card' + (g.is_done ? ' done' : '') },
      _el('div', { className: 'goal-head' },
        _el('strong', {}, (g.is_done ? '✅ ' : '🎯 ') + g.name),
        _el('span', { className: 'goal-amounts' },
          App.fmt(g.saved_amount) + usd + ' / ' + App.fmt(g.target_amount) +
          (g.currency === 'USD' ? ' USD' : ''))
      ),
      _el('div', { className: 'progress-track' },
        _el('div', { className: 'progress-fill ' + (g.is_done ? 'ok' : 'gold'), style: 'width:' + g.progress_pct + '%' })
      ),
      _el('div', { className: 'goal-actions' },
        _el('span', { style: 'color:var(--muted);font-size:.78rem;' },
          g.progress_pct + '%' + (g.deadline ? ' · vence ' + g.deadline : '')),
        _el('span', {},
          _el('button', { className: 'btn-link', onclick: () => Goals._contribute(g) }, 'Aportar'),
          _el('button', { className: 'btn-link', onclick: () => Goals._goalForm(g.id) }, '+ Submeta'),
          _el('button', { className: 'btn-link danger', onclick: () => Goals._delete(g) }, 'Borrar')
        )
      )
    );
    (g.subgoals || []).forEach(sub => {
      card.appendChild(_el('div', { className: 'subgoal' },
        _el('span', {}, (sub.is_done ? '✅' : '·') + ' ' + sub.name),
        _el('span', { style: 'color:var(--muted)' },
          App.fmt(sub.saved_amount) + ' / ' + App.fmt(sub.target_amount)),
        _el('button', { className: 'btn-link', onclick: () => Goals._contribute(sub) }, 'Aportar')
      ));
    });
    return card;
  },

  _recurringRow(i) {
    const detail = i.installments_total > 0
      ? 'cuota ' + i.installments_paid + '/' + i.installments_total
      : 'todos los meses';
    return _el('div', { className: 'recurring-row' + (i.active ? '' : ' inactive') },
      _el('span', { className: 'rec-name' }, i.merchant),
      _el('span', { className: 'rec-detail' }, 'día ' + i.day_of_month + ' · ' + detail),
      _el('span', { className: 'rec-amount' }, App.fmt(i.amount)),
      _el('button', { className: 'btn-link danger', onclick: async () => {
        await API.deleteRecurring(i.id).catch(e => App.toast(e.message, 'error'));
        Goals.render();
      }}, '✕')
    );
  },

  async _contribute(g) {
    const val = prompt('¿Cuánto aportás a "' + g.name + '"?');
    const amount = parseFloat(val);
    if (!amount || amount <= 0) return;
    try {
      await API.contributeGoal(g.id, amount);
      App.toast('Aporte registrado 💪', 'success');
      this.render();
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async _delete(g) {
    if (!confirm('¿Borrar la meta "' + g.name + '" y sus submetas?')) return;
    try {
      await API.deleteGoal(g.id);
      this.render();
    } catch (e) { App.toast(e.message, 'error'); }
  },

  _goalForm(parentId) {
    const name = prompt(parentId ? 'Nombre de la submeta:' : 'Nombre de la meta (ej: Fondo de emergencia):');
    if (!name) return;
    const target = parseFloat(prompt('Monto objetivo ($):'));
    if (!target || target <= 0) return;
    API.createGoal({ name, target_amount: target, parent_id: parentId || null })
      .then(() => { App.toast('Meta creada 🎯', 'success'); this.render(); })
      .catch(e => App.toast(e.message, 'error'));
  },

  _recurringForm() {
    const merchant = prompt('Nombre (ej: Alquiler, Netflix, Heladera en cuotas):');
    if (!merchant) return;
    const amount = parseFloat(prompt('Monto mensual ($):'));
    if (!amount || amount <= 0) return;
    const day = parseInt(prompt('Día del mes que se debita (1-28):', '1')) || 1;
    const cuotas = parseInt(prompt('¿Cantidad de cuotas? (0 = gasto fijo sin fin):', '0')) || 0;
    API.createRecurring({ merchant, amount, day_of_month: Math.min(Math.max(day, 1), 28), installments_total: cuotas })
      .then(() => { App.toast('Gasto fijo agregado', 'success'); this.render(); })
      .catch(e => App.toast(e.message, 'error'));
  },
};
