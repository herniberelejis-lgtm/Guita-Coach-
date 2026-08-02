/* Objetivos SMART — seguimiento de metas de ahorro */
const Goals = {
  async render() {
    const main = document.getElementById('main');
    main.textContent = '';
    const spin = document.createElement('div');
    spin.className = 'spinner';
    spin.style.cssText = 'margin:80px auto;display:block;';
    main.appendChild(spin);

    const [goals, dolar, budget] = await Promise.all([
      API.getGoals().catch(() => []),
      API.getDolar().catch(() => null),
      API.getBudget().catch(() => null),
    ]);

    main.textContent = '';
    main.appendChild(this._build(goals, budget, dolar));
  },

  _build(goals, budget, dolar) {
    const frag = document.createDocumentFragment();

    // ── Header ───────────────────────────────────────────────────────────────
    let formOpen = false;
    const formCard = this._newGoalForm(budget, () => Goals.render());
    formCard.style.display = 'none';

    const addBtn = _el('button', { className: 'btn btn-primary btn-sm' }, '+ Nueva meta');
    addBtn.onclick = () => {
      formOpen = !formOpen;
      formCard.style.display = formOpen ? 'block' : 'none';
      addBtn.textContent = formOpen ? '✕ Cancelar' : '+ Nueva meta';
      if (formOpen) formCard.querySelector('input')?.focus();
    };

    frag.appendChild(_el('div', { className: 'page-header' },
      _el('div', {},
        _el('h2', {}, 'Mis objetivos'),
        _el('p', { style: 'color:var(--muted);font-size:.88rem;margin-top:2px;' },
          'Metas SMART con seguimiento de progreso')
      ),
      addBtn
    ));

    frag.appendChild(formCard);

    // ── Lista de metas ───────────────────────────────────────────────────────
    const active = goals.filter(g => !g.is_done);
    const done   = goals.filter(g => g.is_done);

    if (!goals.length) {
      frag.appendChild(_el('div', { className: 'card smart-empty' },
        _el('div', { style: 'font-size:2.2rem;margin-bottom:12px;' }, '🎯'),
        _el('div', { style: 'font-weight:600;margin-bottom:6px;' }, 'Todavía no tenés metas'),
        _el('div', { style: 'color:var(--muted);font-size:.86rem;' },
          'Creá tu primera meta: un fondo de emergencia, un viaje, lo que quieras lograr.')
      ));
    } else {
      active.forEach(g => frag.appendChild(this._smartCard(g, budget, dolar)));
    }

    if (done.length) {
      const doneSection = _el('div', { className: 'card', style: 'margin-top:20px;' },
        _el('p', { className: 'section-title', style: 'color:var(--ok);margin-bottom:12px;' }, '✓ Completadas')
      );
      done.forEach(g => doneSection.appendChild(this._smartCard(g, budget, dolar)));
      frag.appendChild(doneSection);
    }

    return frag;
  },

  // ── Formulario de nueva meta ─────────────────────────────────────────────
  _newGoalForm(budget, onCreated) {
    const card = _el('div', { className: 'card smart-form-card', style: 'margin-bottom:20px;' },
      _el('p', { className: 'section-title', style: 'margin-bottom:16px;' }, 'Nueva meta')
    );

    const nameInput = _smartInput('text', '¿Para qué ahorrás? Ej: Fondo de emergencia, Viaje...');
    const amountInput = _smartInput('number', 'Monto objetivo');
    amountInput.min = '1';

    const currencySelect = document.createElement('select');
    currencySelect.className = 'smart-select';
    ['ARS', 'USD'].forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      currencySelect.appendChild(o);
    });

    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'month';
    deadlineInput.className = 'smart-select';
    // Min = next month
    const minDate = new Date();
    minDate.setMonth(minDate.getMonth() + 1);
    deadlineInput.min = minDate.getFullYear() + '-' + String(minDate.getMonth() + 1).padStart(2, '0');

    const calcBox = _el('div', { className: 'smart-calc-box' });

    const recalc = () => {
      const amount = parseFloat(amountInput.value);
      const deadline = deadlineInput.value;
      calcBox.textContent = '';
      if (!amount || !deadline) return;
      const [y, m] = deadline.split('-').map(Number);
      const now = new Date();
      const months = Math.max(1, (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1)));
      const monthly = Math.ceil(amount / months);
      const ahorro = budget?.franjas?.find(f => f.name === 'ahorro');
      const achievable = ahorro?.limit > 0 ? monthly <= ahorro.limit : null;

      calcBox.appendChild(_el('span', { className: 'calc-monthly' },
        'Necesitás ahorrar ' + App.fmt(monthly) + '/mes durante ' + months + ' mes' + (months !== 1 ? 'es' : '')));

      if (achievable !== null) {
        calcBox.appendChild(_el('span', { className: 'calc-badge ' + (achievable ? 'achievable' : 'stretch') },
          achievable ? '✓ Alcanzable' : '⚠ Supera tu ahorro mensual actual'));
      }
    };

    amountInput.addEventListener('input', recalc);
    deadlineInput.addEventListener('change', recalc);

    card.appendChild(_el('div', { className: 'smart-form-grid' },
      _el('div', { className: 'form-group' },
        _el('label', {}, '¿Para qué ahorrás?'),
        nameInput
      ),
      _el('div', { className: 'form-group' },
        _el('label', {}, 'Monto objetivo'),
        _el('div', { style: 'display:flex;gap:8px;align-items:flex-end;' }, amountInput, currencySelect)
      ),
      _el('div', { className: 'form-group' },
        _el('label', {}, 'Plazo (opcional)'),
        deadlineInput
      )
    ));

    card.appendChild(calcBox);

    const saveBtn = _el('button', { className: 'btn btn-primary btn-sm', style: 'margin-top:16px;' }, 'Crear meta');
    saveBtn.onclick = async function() {
      const name = nameInput.value.trim();
      const target = parseFloat(amountInput.value);
      if (!name)           { App.toast('Ingresá un nombre', 'error'); return; }
      if (!target || target <= 0) { App.toast('Ingresá un monto válido', 'error'); return; }
      this.disabled = true;
      try {
        await API.createGoal({
          name,
          target_amount: target,
          currency: currencySelect.value,
          deadline: deadlineInput.value || null,
        });
        App.toast('Meta creada', 'success');
        onCreated();
      } catch (e) {
        App.toast(e.message, 'error');
        this.disabled = false;
      }
    };
    card.appendChild(saveBtn);
    return card;
  },

  // ── Tarjeta SMART de una meta ────────────────────────────────────────────
  _smartCard(g, budget, dolar) {
    const monthly = _monthlyNeeded(g);
    const ahorro  = budget?.franjas?.find(f => f.name === 'ahorro');
    const achievable = monthly && ahorro?.limit > 0 ? monthly <= ahorro.limit : null;
    const usdNote = g.currency === 'ARS' && dolar?.blue?.venta
      ? ' (~US$' + Math.round(g.saved_amount / dolar.blue.venta).toLocaleString('es-AR') + ')'
      : '';

    const card = _el('div', { className: 'smart-goal-card' + (g.is_done ? ' done' : '') });

    // Título + borrar
    const titleIcon = _el('span', { style: 'display:inline-flex;align-items:center;margin-right:6px;color:' + (g.is_done ? 'var(--ok)' : 'var(--gold)') + ';' });
    titleIcon.innerHTML = Icon(g.is_done ? 'check-circle' : 'target', 16);

    const delBtn = _el('button', { className: 'btn-icon-ghost', title: 'Borrar meta', onclick: () => Goals._delete(g) });
    delBtn.innerHTML = Icon('x-circle', 14);

    card.appendChild(_el('div', { className: 'smart-title-row' },
      _el('div', { style: 'display:flex;align-items:center;' }, titleIcon, _el('strong', {}, g.name)),
      delBtn
    ));

    // Barra de progreso
    const fillStyle = g.is_done ? 'width:100%;background:var(--ok)' : 'width:' + g.progress_pct + '%';
    card.appendChild(_el('div', { className: 'smart-track' },
      _el('div', { className: 'smart-fill', style: fillStyle })
    ));

    // Fila de info
    const monoStyle = 'font-variant-numeric:tabular-nums;';
    card.appendChild(_el('div', { className: 'smart-info-row' },
      _el('span', { style: monoStyle },
        App.fmt(g.saved_amount) + usdNote + ' de ' + App.fmt(g.target_amount) +
        (g.currency === 'USD' ? ' USD' : '')),
      _el('div', { style: 'display:flex;gap:10px;align-items:center;' },
        g.deadline ? _el('span', { className: 'goal-deadline-badge' }, _deadlineLabel(g.deadline)) : null,
        _el('span', { style: 'font-weight:600;color:' + (g.is_done ? 'var(--ok)' : 'var(--muted)') + ';font-size:.82rem;' }, g.progress_pct + '%')
      )
    ));

    // Análisis SMART
    if (monthly && !g.is_done) {
      const analysis = _el('div', { className: 'smart-analysis' },
        _el('span', { className: 'smart-monthly-label' }, 'Necesitás aportar ' + App.fmt(monthly) + '/mes')
      );
      if (achievable !== null) {
        analysis.appendChild(_el('span', { className: 'smart-achievable-badge ' + (achievable ? 'ok' : 'warn') },
          achievable ? '✓ Alcanzable' : '⚠ Requiere más ahorro'));
      }
      card.appendChild(analysis);
    }

    // Submetas
    if (g.subgoals?.length) {
      const subWrap = _el('div', { className: 'smart-subgoals' });
      g.subgoals.forEach(sub => {
        const subIcon = _el('span', { style: 'color:' + (sub.is_done ? 'var(--ok)' : 'var(--muted)') + ';margin-right:5px;' });
        subIcon.innerHTML = sub.is_done ? Icon('check-circle', 11) : '○';
        subWrap.appendChild(_el('div', { className: 'smart-sub-row' },
          _el('span', {}, subIcon, sub.name),
          _el('span', { style: 'color:var(--muted);font-size:.78rem;' },
            App.fmt(sub.saved_amount) + ' / ' + App.fmt(sub.target_amount))
        ));
      });
      card.appendChild(subWrap);
    }

    // Aportar (inline)
    if (!g.is_done) {
      const contInput = _smartInput('number', 'Monto a aportar');
      contInput.min = '1';
      contInput.style.width = '160px';

      const contBtn = _el('button', { className: 'btn btn-primary btn-sm' }, 'Aportar');
      contBtn.onclick = async function() {
        const val = parseFloat(contInput.value);
        if (!val || val <= 0) { App.toast('Ingresá un monto', 'error'); return; }
        this.disabled = true;
        try {
          await API.contributeGoal(g.id, val);
          App.toast('Aporte registrado ✓', 'success');
          Goals.render();
        } catch (e) { App.toast(e.message, 'error'); this.disabled = false; }
      };

      const subBtn = _el('button', {
        className: 'btn btn-ghost btn-sm',
        onclick: () => Goals._subGoalInline(g.id),
      }, '+ Submeta');

      card.appendChild(_el('div', { className: 'smart-contribute-row' }, contInput, contBtn, subBtn));
    }

    return card;
  },

  async _subGoalInline(parentId) {
    const name = prompt('Nombre de la submeta:');
    if (!name?.trim()) return;
    const target = parseFloat(prompt('Monto objetivo ($):'));
    if (!target || target <= 0) return;
    try {
      await API.createGoal({ name: name.trim(), target_amount: target, parent_id: parentId });
      App.toast('Submeta creada', 'success');
      this.render();
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async _delete(g) {
    if (!confirm('¿Borrar la meta "' + g.name + '"' + (g.subgoals?.length ? ' y sus submetas' : '') + '?')) return;
    try {
      await API.deleteGoal(g.id);
      this.render();
    } catch (e) { App.toast(e.message, 'error'); }
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function _smartInput(type, placeholder) {
  const el = document.createElement('input');
  el.type = type;
  el.placeholder = placeholder;
  el.className = 'smart-input';
  return el;
}

function _monthlyNeeded(g) {
  if (!g.deadline) return null;
  const [y, m] = g.deadline.split('-').map(Number);
  const now = new Date();
  const months = Math.max(1, (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1)));
  const remaining = g.target_amount - g.saved_amount;
  return remaining > 0 ? Math.ceil(remaining / months) : 0;
}

function _deadlineLabel(deadline) {
  const [y, mo] = deadline.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
