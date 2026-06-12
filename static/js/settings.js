/* Settings page — conexiones, presupuesto, perfil */
const Settings = {
  async render() {
    const main = document.getElementById('main');
    main.textContent = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    const title = document.createElement('h2');
    title.textContent = 'Configuración';
    header.appendChild(title);
    main.appendChild(header);

    const sp = document.createElement('div');
    sp.className = 'spinner';
    sp.style.cssText = 'display:block;margin:60px auto;';
    main.appendChild(sp);

    const [budget, syncStatus] = await Promise.all([
      API.getBudget(),
      API.syncStatus().catch(() => ({})),
    ]);
    main.removeChild(sp);
    App.state.syncStatus = syncStatus;

    // ── Connections ─────────────────────────────────────────────────────────
    const connTitle = document.createElement('p');
    connTitle.className = 'section-title';
    connTitle.textContent = 'Conexiones';
    main.appendChild(connTitle);

    [
      {
        provider: 'gmail',
        label: 'Gmail',
        desc: 'Importá emails de confirmación de pagos',
        iconClass: 'gmail',
        iconText: 'G',
        connectUrl: '/api/auth/gmail',
      },
      {
        provider: 'mercadopago',
        label: 'Mercado Pago',
        desc: 'Importá pagos directamente de tu cuenta',
        iconClass: 'mp',
        iconText: 'MP',
        connectUrl: '/api/auth/mp',
      },
    ].forEach(cfg => {
      const status = syncStatus[cfg.provider];
      const connected = status?.status === 'connected';
      main.appendChild(this._buildConnCard(cfg, connected, status?.last_sync));
    });

    // ── Import CSV de MP ─────────────────────────────────────────────────────
    main.appendChild(this._buildCsvImportCard());

    // ── Budget settings ──────────────────────────────────────────────────────
    const hr1 = document.createElement('hr');
    hr1.className = 'divider';
    main.appendChild(hr1);

    const budgetTitle = document.createElement('p');
    budgetTitle.className = 'section-title';
    budgetTitle.textContent = 'Presupuesto';
    main.appendChild(budgetTitle);

    main.appendChild(this._buildBudgetForm(budget));
  },

  /* Importar estado de cuenta de MP: cubre compras con tarjeta que la API no expone. */
  _buildCsvImportCard() {
    const card = document.createElement('div');
    card.className = 'conn-card';

    const icon = document.createElement('div');
    icon.className = 'conn-icon mp';
    icon.textContent = '📄';
    card.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'conn-info';
    const name = document.createElement('div');
    name.className = 'conn-name';
    name.textContent = 'Estado de cuenta de MP (CSV)';
    const desc = document.createElement('div');
    desc.className = 'conn-desc';
    desc.textContent = 'Las compras con tarjeta MP no salen por la API. Descargá tu estado de cuenta desde la app de MP (Más → Estado de cuenta → Descargar) y subilo acá. Se deduplica solo.';
    info.appendChild(name);
    info.appendChild(desc);
    card.appendChild(info);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.style.display = 'none';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = 'Subir CSV';
    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      btn.disabled = true;
      btn.textContent = 'Importando…';
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/sync/csv', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error al importar');
        App.toast(`Importado: ${data.saved} movimientos nuevos de ${data.fetched} leídos`, 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Subir CSV';
        input.value = '';
      }
    });

    card.appendChild(input);
    card.appendChild(btn);
    return card;
  },

  _buildConnCard(cfg, connected, lastSync) {
    const card = document.createElement('div');
    card.className = 'conn-card';

    const icon = document.createElement('div');
    icon.className = 'conn-icon ' + cfg.iconClass;
    icon.textContent = cfg.iconText;
    card.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'conn-info';
    const name = document.createElement('div');
    name.className = 'conn-name';
    name.textContent = cfg.label;
    const statusEl = document.createElement('div');
    statusEl.className = 'conn-status ' + (connected ? 'connected' : 'disconnected');
    statusEl.textContent = connected
      ? 'Conectado' + (lastSync ? ' · última sync ' + new Date(lastSync).toLocaleDateString('es-AR') : '')
      : cfg.desc;
    info.appendChild(name);
    info.appendChild(statusEl);
    card.appendChild(info);

    const btn = document.createElement('button');
    if (connected) {
      btn.className = 'btn btn-danger btn-sm';
      btn.textContent = 'Desconectar';
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await API.disconnectProvider(cfg.provider);
          App.toast(cfg.label + ' desconectado', 'success');
          Settings.render();
        } catch (err) {
          App.toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    } else {
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = 'Conectar';
      btn.onclick = () => { window.location.href = cfg.connectUrl; };
    }
    card.appendChild(btn);

    if (connected) {
      const syncBtn = document.createElement('button');
      syncBtn.className = 'btn btn-ghost btn-sm';
      syncBtn.style.marginLeft = '6px';
      syncBtn.textContent = '↻';
      syncBtn.title = 'Sincronizar ahora';
      syncBtn.onclick = async () => {
        syncBtn.disabled = true;
        try {
          const fn = cfg.provider === 'gmail' ? API.syncGmail : API.syncMP;
          const r = await fn();
          App.toast(r.saved + ' transacciones nuevas importadas', 'success');
        } catch (err) {
          App.toast(err.message, 'error');
        } finally {
          syncBtn.disabled = false;
        }
      };
      card.appendChild(syncBtn);
    }

    return card;
  },

  _buildBudgetForm(budget) {
    const card = document.createElement('div');
    card.className = 'card';

    const form = document.createElement('form');

    const row1 = document.createElement('div');
    row1.className = 'grid-2';
    row1.style.marginBottom = '16px';

    const incGrp = this._formGroup('Sueldo mensual ($)', 'monthly_income', 'number', budget.income);
    const dayGrp = this._formGroup('Día de cobro', 'payday', 'number', budget.payday);
    row1.appendChild(incGrp);
    row1.appendChild(dayGrp);
    form.appendChild(row1);

    const pctTitle = document.createElement('p');
    pctTitle.style.cssText = 'font-size:.82rem;color:var(--muted);margin-bottom:10px;';
    pctTitle.textContent = 'Distribución del presupuesto (debe sumar 100%)';
    form.appendChild(pctTitle);

    const row2 = document.createElement('div');
    row2.className = 'pct-row';
    const franjas = budget.franjas || [];
    ['necesidades', 'gustos', 'ahorro'].forEach(cat => {
      const f = franjas.find(x => x.name === cat);
      row2.appendChild(this._formGroup(
        { necesidades: 'Necesidades %', gustos: 'Gustos %', ahorro: 'Ahorro %' }[cat],
        cat + '_pct', 'number', f?.pct_config || 0
      ));
    });
    form.appendChild(row2);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.marginTop = '20px';
    saveBtn.textContent = 'Guardar cambios';
    form.appendChild(saveBtn);

    form.onsubmit = async (e) => {
      e.preventDefault();
      saveBtn.disabled = true;
      const fd = new FormData(form);
      const n = parseInt(fd.get('necesidades_pct'));
      const g = parseInt(fd.get('gustos_pct'));
      const a = parseInt(fd.get('ahorro_pct'));
      if (n + g + a !== 100) {
        App.toast('Los porcentajes deben sumar 100', 'error');
        saveBtn.disabled = false;
        return;
      }
      try {
        await API.patchBudgetSettings({
          monthly_income: parseFloat(fd.get('monthly_income')),
          necesidades_pct: n,
          gustos_pct: g,
          ahorro_pct: a,
          payday: parseInt(fd.get('payday')),
        });
        App.toast('Configuración guardada', 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
      }
    };

    card.appendChild(form);
    return card;
  },

  _formGroup(label, name, type, value) {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    grp.appendChild(lbl);
    const inp = document.createElement('input');
    inp.type = type;
    inp.name = name;
    inp.value = value ?? '';
    grp.appendChild(inp);
    return grp;
  },
};
