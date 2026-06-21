/* Transactions page — list, search, filter, category edit */
const Transactions = {
  state: { page: 0, limit: 30, search: '', category: '', payment: '', month: '' },

  PM_LABELS: {
    credito: 'Crédito', debito: 'Débito', qr: 'QR / billetera',
    transferencia: 'Transferencia', efectivo: 'Efectivo', otro: 'Otro',
  },

  async render() {
    const main = document.getElementById('main');
    main.textContent = '';

    const header = document.createElement('div');
    header.className = 'page-header';

    const title = document.createElement('h2');
    title.textContent = 'Transacciones';
    header.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.textContent = '+ Agregar';
    addBtn.onclick = () => Transactions.showAddModal();
    header.appendChild(addBtn);
    main.appendChild(header);

    // Filter bar
    const filters = document.createElement('div');
    filters.className = 'filter-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Buscar comercio…';
    searchInput.style.flex = '1';
    searchInput.value = this.state.search;
    searchInput.oninput = () => { this.state.search = searchInput.value; this.state.page = 0; this._load(); };
    filters.appendChild(searchInput);

    const catSel = document.createElement('select');
    [['', 'Todas las categorías'], ['necesidades', 'Necesidades'], ['gustos', 'Gustos'], ['ahorro', 'Ahorro']].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = l;
      if (v === this.state.category) opt.selected = true;
      catSel.appendChild(opt);
    });
    catSel.onchange = () => { this.state.category = catSel.value; this.state.page = 0; this._load(); };
    filters.appendChild(catSel);

    const pmSel = document.createElement('select');
    [['', 'Todos los medios'], ['credito', 'Crédito'], ['debito', 'Débito'],
     ['qr', 'QR / billetera'], ['transferencia', 'Transferencia'],
     ['efectivo', 'Efectivo'], ['otro', 'Otro']].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = l;
      if (v === this.state.payment) opt.selected = true;
      pmSel.appendChild(opt);
    });
    pmSel.onchange = () => { this.state.payment = pmSel.value; this.state.page = 0; this._load(); };
    filters.appendChild(pmSel);

    main.appendChild(filters);

    // Review notice
    const reviewWrap = document.createElement('div');
    reviewWrap.id = 'review-notice';
    main.appendChild(reviewWrap);
    this._loadReview(reviewWrap);

    // Table card
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'tx-card';
    main.appendChild(card);

    this._load();

    // Modal placeholder
    const modalOv = document.createElement('div');
    modalOv.className = 'modal-overlay';
    modalOv.id = 'tx-modal';
    modalOv.addEventListener('click', e => { if (e.target === modalOv) modalOv.classList.remove('open'); });
    main.appendChild(modalOv);
  },

  async _load() {
    const card = document.getElementById('tx-card');
    if (!card) return;
    card.textContent = '';
    const sp = document.createElement('div');
    sp.className = 'spinner';
    sp.style.cssText = 'display:block;margin:30px auto;';
    card.appendChild(sp);

    const params = {};
    if (this.state.search) params.search = this.state.search;
    if (this.state.category) params.category = this.state.category;
    if (this.state.payment) params.payment_method = this.state.payment;
    if (this.state.month) params.month = this.state.month;
    params.limit = this.state.limit;
    params.offset = this.state.page * this.state.limit;

    try {
      const data = await API.getTransactions(params);
      card.textContent = '';
      if (!data.items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Sin transacciones';
        card.appendChild(empty);
        return;
      }

      // Count info
      const info = document.createElement('p');
      info.style.cssText = 'font-size:.8rem;color:var(--muted);margin-bottom:12px;';
      info.textContent = data.total + ' transacciones';
      card.appendChild(info);

      card.appendChild(this._buildTable(data.items));

      // Pagination
      if (data.total > this.state.limit) {
        const nav = document.createElement('div');
        nav.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:16px;';
        if (this.state.page > 0) {
          const prev = document.createElement('button');
          prev.className = 'btn btn-ghost btn-sm';
          prev.textContent = '← Anterior';
          prev.onclick = () => { this.state.page--; this._load(); };
          nav.appendChild(prev);
        }
        if ((this.state.page + 1) * this.state.limit < data.total) {
          const next = document.createElement('button');
          next.className = 'btn btn-ghost btn-sm';
          next.textContent = 'Siguiente →';
          next.onclick = () => { this.state.page++; this._load(); };
          nav.appendChild(next);
        }
        card.appendChild(nav);
      }
    } catch (err) {
      card.textContent = 'Error cargando transacciones: ' + err.message;
    }
  },

  async _loadReview(wrap) {
    try {
      const items = await API.getNeedsReview();
      wrap.textContent = '';
      if (!items.length) return;
      const notice = document.createElement('div');
      notice.className = 'card';
      notice.style.cssText = 'margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border:1px solid rgba(245,158,11,.2);';

      const left = document.createElement('div');
      const countBadge = document.createElement('span');
      countBadge.style.cssText = 'background:var(--warn);color:#000;font-weight:700;border-radius:99px;padding:2px 10px;font-size:.8rem;margin-right:10px;';
      countBadge.textContent = String(items.length);
      left.appendChild(countBadge);
      left.appendChild(document.createTextNode('transacciones sin categoría'));

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

      const aiBtn = document.createElement('button');
      aiBtn.className = 'btn btn-primary btn-sm';
      aiBtn.textContent = '✨ Categorizar con IA';
      aiBtn.onclick = async function() {
        aiBtn.disabled = true;
        aiBtn.textContent = 'Catalogando…';
        try {
          const r = await API.reclassifyPending();
          App.toast(`IA catalogó ${r.classified} de ${r.pending} pendientes`, 'success');
          Transactions.render();
        } catch (err) {
          App.toast(err.message, 'error');
          aiBtn.disabled = false;
          aiBtn.textContent = '✨ Categorizar con IA';
        }
      };

      const reviewBtn = document.createElement('button');
      reviewBtn.className = 'btn btn-ghost btn-sm';
      reviewBtn.textContent = 'Manual';
      reviewBtn.onclick = function() { Transactions.showReviewModal(items); };

      btns.appendChild(aiBtn);
      btns.appendChild(reviewBtn);
      notice.appendChild(left);
      notice.appendChild(btns);
      wrap.appendChild(notice);
    } catch (_) { /* ignore */ }
  },

  _buildTable(items) {
    const table = document.createElement('table');
    table.className = 'tx-table';
    const thead = table.createTHead();
    const hr = thead.insertRow();
    ['Comercio', 'Categoría', 'Fuente', 'Fecha', 'Monto', ''].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      if (h === 'Monto') th.style.textAlign = 'right';
      hr.appendChild(th);
    });
    const tbody = table.createTBody();
    items.forEach(t => {
      const tr = tbody.insertRow();

      const tdMerchant = tr.insertCell();
      tdMerchant.textContent = t.merchant;

      const tdCat = tr.insertCell();
      const badge = document.createElement('span');
      badge.className = 'badge ' + (t.needs_review ? 'review' : t.category);
      badge.textContent = t.needs_review ? '? revisar' : t.category;
      tdCat.appendChild(badge);
      if (t.subcategory) {
        const sub = document.createElement('span');
        sub.style.cssText = 'font-size:.75rem;color:var(--muted);margin-left:6px;';
        sub.textContent = t.subcategory;
        tdCat.appendChild(sub);
      }
      if (t.payment_method) {
        const pm = document.createElement('span');
        pm.className = 'pm-badge ' + t.payment_method;
        pm.textContent = Transactions.PM_LABELS[t.payment_method] || t.payment_method;
        tdCat.appendChild(pm);
      }

      const tdSrc = tr.insertCell();
      tdSrc.style.color = 'var(--muted)';
      tdSrc.style.fontSize = '.8rem';
      tdSrc.textContent = t.provider || t.source;

      const tdDate = tr.insertCell();
      tdDate.style.color = 'var(--muted)';
      tdDate.textContent = t.date;

      const tdAmt = tr.insertCell();
      tdAmt.style.cssText = 'text-align:right;font-weight:600;';
      tdAmt.textContent = App.fmt(t.amount);

      const tdAction = tr.insertCell();
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-ghost btn-sm';
      editBtn.textContent = 'Editar';
      editBtn.onclick = () => Transactions.showEditModal(t);
      tdAction.appendChild(editBtn);
    });
    return table;
  },

  showEditModal(tx) {
    const ov = document.getElementById('tx-modal');
    ov.textContent = '';
    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h3');
    title.textContent = 'Categorizar: ' + tx.merchant;
    modal.appendChild(title);

    const form = document.createElement('form');

    const catGroup = document.createElement('div');
    catGroup.className = 'form-group';
    const catLabel = document.createElement('label');
    catLabel.textContent = 'Categoría';
    catGroup.appendChild(catLabel);
    const catSel = document.createElement('select');
    catSel.name = 'category';
    [['necesidades', 'Necesidades'], ['gustos', 'Gustos'], ['ahorro', 'Ahorro']].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = l;
      if (v === tx.category) opt.selected = true;
      catSel.appendChild(opt);
    });
    catGroup.appendChild(catSel);
    form.appendChild(catGroup);

    const subGroup = document.createElement('div');
    subGroup.className = 'form-group';
    const subLabel = document.createElement('label');
    subLabel.textContent = 'Subcategoría (opcional)';
    subGroup.appendChild(subLabel);
    const subInput = document.createElement('input');
    subInput.type = 'text';
    subInput.name = 'subcategory';
    subInput.value = tx.subcategory || '';
    subInput.placeholder = 'ej: Delivery, Supermercado…';
    subGroup.appendChild(subInput);
    form.appendChild(subGroup);

    const ruleGroup = document.createElement('div');
    ruleGroup.className = 'form-group';
    const ruleLabel = document.createElement('label');
    ruleLabel.style.display = 'flex';
    ruleLabel.style.gap = '8px';
    ruleLabel.style.alignItems = 'center';
    const ruleCheck = document.createElement('input');
    ruleCheck.type = 'checkbox';
    ruleCheck.checked = true;
    ruleLabel.appendChild(ruleCheck);
    ruleLabel.appendChild(document.createTextNode('Recordar para futuros pagos a este comercio'));
    ruleGroup.appendChild(ruleLabel);
    form.appendChild(ruleGroup);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;margin-top:20px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = () => ov.classList.remove('open');
    actions.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Guardar';
    actions.appendChild(saveBtn);

    form.appendChild(actions);

    form.onsubmit = async (e) => {
      e.preventDefault();
      saveBtn.disabled = true;
      try {
        await API.correctCategory(tx.id, {
          category: catSel.value,
          subcategory: subInput.value,
          save_rule: ruleCheck.checked,
        });
        ov.classList.remove('open');
        App.toast('Categoría actualizada', 'success');
        Transactions._load();
      } catch (err) {
        App.toast(err.message, 'error');
        saveBtn.disabled = false;
      }
    };

    modal.appendChild(form);
    ov.appendChild(modal);
    ov.classList.add('open');
  },

  showAddModal() {
    const ov = document.getElementById('tx-modal');
    ov.textContent = '';
    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h3');
    title.textContent = 'Agregar movimiento';
    modal.appendChild(title);

    const form = document.createElement('form');

    // Toggle Gasto / Ingreso
    let txType = 'expense';
    const toggle = document.createElement('div');
    toggle.className = 'type-toggle';
    const btnExpense = document.createElement('button');
    btnExpense.type = 'button';
    btnExpense.textContent = 'Gasto';
    btnExpense.className = 'active';
    const btnIncome = document.createElement('button');
    btnIncome.type = 'button';
    btnIncome.textContent = 'Ingreso';
    toggle.appendChild(btnExpense);
    toggle.appendChild(btnIncome);
    form.appendChild(toggle);

    const fields = [
      { label: 'Comercio / descripción', name: 'merchant', type: 'text', placeholder: 'ej: Farmacity' },
      { label: 'Monto ($)', name: 'amount', type: 'number', placeholder: '1500' },
      { label: 'Fecha', name: 'date', type: 'date', value: new Date().toISOString().slice(0, 10) },
    ];
    fields.forEach(f => {
      const grp = document.createElement('div');
      grp.className = 'form-group';
      const lbl = document.createElement('label');
      lbl.textContent = f.label;
      grp.appendChild(lbl);
      const inp = document.createElement('input');
      inp.type = f.type;
      inp.name = f.name;
      inp.placeholder = f.placeholder || '';
      if (f.value) inp.value = f.value;
      inp.required = true;
      grp.appendChild(inp);
      form.appendChild(grp);
    });

    // Campos sólo de gasto (categoría + medio de pago)
    const expenseFields = document.createElement('div');

    const catGroup = document.createElement('div');
    catGroup.className = 'form-group';
    const catLabel = document.createElement('label');
    catLabel.textContent = 'Categoría';
    catGroup.appendChild(catLabel);
    const catSel = document.createElement('select');
    catSel.name = 'category';
    [['necesidades', 'Necesidades'], ['gustos', 'Gustos'], ['ahorro', 'Ahorro']].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = l;
      catSel.appendChild(opt);
    });
    catGroup.appendChild(catSel);
    expenseFields.appendChild(catGroup);

    const pmGroup = document.createElement('div');
    pmGroup.className = 'form-group';
    const pmLabel = document.createElement('label');
    pmLabel.textContent = 'Medio de pago';
    pmGroup.appendChild(pmLabel);
    const pmSel = document.createElement('select');
    pmSel.name = 'payment_method';
    [['', 'Sin especificar'], ['credito', 'Tarjeta de crédito'], ['debito', 'Tarjeta de débito'],
     ['qr', 'QR / billetera'], ['transferencia', 'Transferencia'], ['efectivo', 'Efectivo']].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = l;
      pmSel.appendChild(opt);
    });
    pmGroup.appendChild(pmSel);
    expenseFields.appendChild(pmGroup);
    form.appendChild(expenseFields);

    const setType = (type) => {
      txType = type;
      btnExpense.classList.toggle('active', type === 'expense');
      btnIncome.classList.toggle('active', type === 'income');
      expenseFields.style.display = type === 'expense' ? '' : 'none';
    };
    btnExpense.onclick = () => setType('expense');
    btnIncome.onclick = () => setType('income');

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;margin-top:20px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = () => ov.classList.remove('open');
    actions.appendChild(cancelBtn);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Guardar';
    actions.appendChild(saveBtn);
    form.appendChild(actions);

    form.onsubmit = async (e) => {
      e.preventDefault();
      saveBtn.disabled = true;
      const fd = new FormData(form);
      const payload = {
        merchant: fd.get('merchant'),
        amount: parseFloat(fd.get('amount')),
        date: fd.get('date'),
        tx_type: txType,
      };
      if (txType === 'expense') {
        payload.category = fd.get('category');
        payload.payment_method = fd.get('payment_method') || '';
      }
      try {
        await API.addTransaction(payload);
        ov.classList.remove('open');
        App.toast(txType === 'income' ? 'Ingreso registrado' : 'Gasto agregado', 'success');
        Transactions._load();
      } catch (err) {
        App.toast(err.message, 'error');
        saveBtn.disabled = false;
      }
    };

    modal.appendChild(form);
    ov.appendChild(modal);
    ov.classList.add('open');
  },

  showReviewModal(items) {
    const ov = document.getElementById('tx-modal');
    ov.textContent = '';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '520px';

    const title = document.createElement('h3');
    title.textContent = 'Revisar ' + items.length + ' transacciones';
    modal.appendChild(title);

    const p = document.createElement('p');
    p.style.cssText = 'color:var(--muted);font-size:.85rem;margin-bottom:16px;';
    p.textContent = 'El clasificador no pudo determinar la categoría. Asignalas vos:';
    modal.appendChild(p);

    items.slice(0, 5).forEach(tx => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px;padding:10px;background:var(--navy3);border-radius:8px;';

      const name = document.createElement('span');
      name.style.flex = '1';
      name.textContent = tx.merchant + ' · ' + App.fmt(tx.amount);
      row.appendChild(name);

      const sel = document.createElement('select');
      sel.style.background = 'var(--navy2)';
      sel.style.border = '1px solid rgba(255,255,255,.1)';
      sel.style.borderRadius = '6px';
      sel.style.color = 'var(--white)';
      sel.style.padding = '6px 10px';
      [['necesidades', 'Necesidades'], ['gustos', 'Gustos'], ['ahorro', 'Ahorro']].forEach(([v, l]) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = l;
        sel.appendChild(opt);
      });
      row.appendChild(sel);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-ghost btn-sm';
      saveBtn.textContent = 'OK';
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        await API.correctCategory(tx.id, { category: sel.value, save_rule: true }).catch(() => {});
        row.style.opacity = '.4';
        row.style.pointerEvents = 'none';
      };
      row.appendChild(saveBtn);
      modal.appendChild(row);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-primary';
    closeBtn.style.marginTop = '16px';
    closeBtn.textContent = 'Listo';
    closeBtn.onclick = () => { ov.classList.remove('open'); Transactions.render(); };
    modal.appendChild(closeBtn);

    ov.appendChild(modal);
    ov.classList.add('open');
  },
};
