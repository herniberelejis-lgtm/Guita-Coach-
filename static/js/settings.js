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

    // ── Plaid (Bancos) ─────────────────────────────────────────────────────
    const plaidStatus = syncStatus['plaid'];
    const plaidConnected = plaidStatus?.status === 'connected';
    main.appendChild(this._buildPlaidCard(plaidConnected, plaidStatus?.last_sync));

    // ── Prometeo (Open Banking - Argentina) ──────────────────────────────────
    const prometeoStatus = syncStatus['prometeo'];
    const prometeoConnected = prometeoStatus?.status === 'connected';
    main.appendChild(this._buildPrometeoCard(prometeoConnected, prometeoStatus?.last_sync));

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

    await this._loadRecurring(main);
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

  _buildPlaidCard(connected, lastSync) {
    const card = document.createElement('div');
    card.className = 'conn-card';

    const icon = document.createElement('div');
    icon.className = 'conn-icon';
    icon.style.cssText = 'background:#52b882;color:#fff;';
    icon.textContent = '🏦';
    card.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'conn-info';
    const name = document.createElement('div');
    name.className = 'conn-name';
    name.textContent = 'Banco (Plaid)';
    const statusEl = document.createElement('div');
    statusEl.className = 'conn-status ' + (connected ? 'connected' : 'disconnected');
    statusEl.textContent = connected
      ? 'Conectado' + (lastSync ? ' · última sync ' + new Date(lastSync).toLocaleDateString('es-AR') : '')
      : 'Conectá tu banco para sincronizar automáticamente';
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
          await API.disconnectProvider('plaid');
          App.toast('Banco desconectado', 'success');
          Settings.render();
        } catch (err) {
          App.toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    } else {
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = 'Conectar';
      btn.onclick = () => this._initPlaidLink();
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
          const r = await API.syncPlaidTransactions();
          App.toast(r.saved + ' transacciones nuevas sincronizadas', 'success');
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

  async _initPlaidLink() {
    try {
      const { link_token } = await API.getPlaidLinkToken();
      if (!link_token) {
        App.toast('Error obteniendo link token', 'error');
        return;
      }

      if (!window.Plaid) {
        const script = document.createElement('script');
        script.src = 'https://cdn.plaid.com/link/v3/stable/link-initialize.js';
        script.async = true;
        script.onload = () => this._openPlaidLink(link_token);
        script.onerror = () => App.toast('Error cargando Plaid', 'error');
        document.body.appendChild(script);
      } else {
        this._openPlaidLink(link_token);
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  _openPlaidLink(linkToken) {
    if (!window.Plaid) {
      App.toast('Plaid no está disponible', 'error');
      return;
    }

    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (public_token, metadata) => {
        try {
          await API.exchangePlaidToken(public_token);
          App.toast('✅ Banco conectado exitosamente', 'success');

          const result = await API.syncPlaidTransactions();
          App.toast(`✅ ${result.saved} transacciones sincronizadas`, 'success');

          Settings.render();
        } catch (err) {
          App.toast(err.message, 'error');
        }
      },
      onExit: (err, metadata) => {
        if (err !== null) {
          console.error('Error en Plaid:', err);
        }
      },
      onEvent: (eventName, metadata) => {
        console.log('Plaid event:', eventName);
      },
    });

    handler.open();
  },

  _buildPrometeoCard(connected, lastSync) {
    const card = document.createElement('div');
    card.className = 'conn-card';

    const icon = document.createElement('div');
    icon.className = 'conn-icon';
    icon.style.cssText = 'background:#6b3cc9;color:#fff;';
    icon.textContent = '🏦';
    card.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'conn-info';
    const name = document.createElement('div');
    name.className = 'conn-name';
    name.textContent = 'Prometeo (Open Banking)';
    const statusEl = document.createElement('div');
    statusEl.className = 'conn-status ' + (connected ? 'connected' : 'disconnected');
    statusEl.textContent = connected
      ? 'Conectado' + (lastSync ? ' · última sync ' + new Date(lastSync).toLocaleDateString('es-AR') : '')
      : 'Conectá con Prometeo para sincronizar tus bancos';
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
          await API.disconnectProvider('prometeo');
          App.toast('Prometeo desconectado', 'success');
          Settings.render();
        } catch (err) {
          App.toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    } else {
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = 'Conectar';
      btn.onclick = () => this._initPrometeoLink();
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
          const r = await API.syncPrometeoTransactions();
          App.toast(r.saved + ' transacciones nuevas sincronizadas', 'success');
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

  async _initPrometeoLink() {
    try {
      const { connector_id, auth_url } = await API.createPrometeoConnector();
      if (!auth_url) {
        App.toast('Error obteniendo URL de autorización', 'error');
        return;
      }

      // Abrir URL en nueva pestaña
      const authWindow = window.open(auth_url, 'prometeo-auth', 'width=600,height=700');

      // Esperar confirmación del usuario (después de autorizar)
      const checkInterval = setInterval(async () => {
        if (authWindow.closed) {
          clearInterval(checkInterval);
          try {
            await API.authorizePrometeo(connector_id);
            App.toast('✅ Banco conectado exitosamente con Prometeo', 'success');

            const result = await API.syncPrometeoTransactions();
            App.toast(`✅ ${result.saved} transacciones sincronizadas`, 'success');

            Settings.render();
          } catch (err) {
            App.toast(err.message, 'error');
          }
        }
      }, 1000);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  _buildBudgetForm(budget) {
    const card = document.createElement('div');
    card.className = 'card';

    const form = document.createElement('form');

    const row1 = document.createElement('div');
    row1.className = 'grid-2';
    row1.style.marginBottom = '16px';

    const isVariable = !!budget.income_is_variable;
    const incGrp = this._formGroup(
      isVariable ? 'Último ingreso ($)' : 'Sueldo mensual ($)',
      'monthly_income', 'number', budget.income);
    const dayGrp = this._formGroup('Día de cobro', 'payday', 'number', budget.payday);
    row1.appendChild(incGrp);
    row1.appendChild(dayGrp);
    form.appendChild(row1);

    // Modo ingreso variable
    const varGrp = document.createElement('div');
    varGrp.className = 'form-group';
    const varLabel = document.createElement('label');
    varLabel.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer;';
    const varCheck = document.createElement('input');
    varCheck.type = 'checkbox';
    varCheck.name = 'income_is_variable';
    varCheck.checked = isVariable;
    varCheck.style.width = 'auto';
    varLabel.appendChild(varCheck);
    varLabel.appendChild(document.createTextNode('No tengo sueldo fijo (ingreso variable)'));
    varGrp.appendChild(varLabel);
    const varHint = document.createElement('p');
    varHint.style.cssText = 'font-size:.76rem;color:var(--muted);margin-top:6px;';
    varHint.textContent = 'Con ingreso variable, el presupuesto se calcula sobre los ingresos que vas registrando en el mes, no sobre un sueldo fijo. Cargá cada ingreso desde Transacciones → + Agregar → Ingreso.';
    varGrp.appendChild(varHint);
    form.appendChild(varGrp);

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
          income_is_variable: fd.get('income_is_variable') === 'on',
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

  async _loadRecurring(main) {
    const sec = document.createElement('div');
    sec.style.marginTop = '40px';

    const title = document.createElement('p');
    title.className = 'section-title';
    title.textContent = 'Gastos fijos';
    sec.appendChild(title);

    const recurring = await API.getRecurring().catch(() => []);

    if (recurring.length) {
      recurring.forEach(r => {
        const item = document.createElement('div');
        item.className = 'card';
        item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;margin-bottom:8px;';
        item.appendChild(document.createTextNode(r.merchant + ' - $' + App.fmt(r.amount) + ' (día ' + r.day_of_month + ')'));
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.textContent = '✕';
        btn.style.cssText = 'background:#f44;color:#fff;border:none;cursor:pointer;';
        btn.onclick = async () => {
          await API.deleteRecurring(r.id);
          Settings.render();
        };
        item.appendChild(btn);
        sec.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Sin gastos fijos';
      sec.appendChild(empty);
    }

    const form = document.createElement('form');
    form.style.cssText = 'margin-top:16px;padding:16px;background:var(--color-bg-secondary);border-radius:8px;';
    form.appendChild(this._formGroup('Descripción', 'merchant', 'text', ''));
    form.appendChild(this._formGroup('Monto', 'amount', 'number', ''));
    form.appendChild(this._formGroup('Día del mes', 'day_of_month', 'number', '1'));

    const catSel = document.createElement('div');
    catSel.className = 'form-group';
    const catLbl = document.createElement('label');
    catLbl.textContent = 'Categoría';
    catSel.appendChild(catLbl);
    const catInp = document.createElement('select');
    catInp.name = 'category';
    ['necesidades', 'gustos', 'ahorro'].forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      catInp.appendChild(opt);
    });
    catSel.appendChild(catInp);
    form.appendChild(catSel);

    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'btn btn-primary';
    btn.textContent = 'Agregar gasto fijo';
    form.appendChild(btn);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      await API.createRecurring({
        merchant: fd.get('merchant'),
        amount: parseFloat(fd.get('amount')),
        day_of_month: parseInt(fd.get('day_of_month')),
        category: fd.get('category'),
      });
      Settings.render();
    });

    sec.appendChild(form);
    main.appendChild(sec);
  },
};
