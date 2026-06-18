/* Investments page — holdings, history, CSV/XLSX upload */
const Investments = {
  state: { activeTab: 'holdings' },

  async render() {
    const main = document.getElementById('main');
    main.textContent = '';

    const header = _el('div', { className: 'page-header' },
      _el('button', {
        className: 'btn-icon',
        onClick: () => App.navigate('dashboard'),
      }, '←'),
      _el('h2', {}, 'Inversiones'),
    );
    main.appendChild(header);

    const tabNav = _el('div', { className: 'tab-nav' },
      _el('button', {
        className: `tab-btn ${this.state.activeTab === 'holdings' ? 'active' : ''}`,
        onClick: () => this._switchTab('holdings'),
      }, 'Posiciones'),
      _el('button', {
        className: `tab-btn ${this.state.activeTab === 'history' ? 'active' : ''}`,
        onClick: () => this._switchTab('history'),
      }, 'Historial'),
      _el('button', {
        className: `tab-btn ${this.state.activeTab === 'upload' ? 'active' : ''}`,
        onClick: () => this._switchTab('upload'),
      }, 'Subir'),
    );
    main.appendChild(tabNav);

    const content = _el('div', { className: 'card', id: 'inv-content' });
    main.appendChild(content);

    this._loadTab(content);
  },

  _switchTab(tab) {
    this.state.activeTab = tab;
    const content = document.getElementById('inv-content');
    if (content) this._loadTab(content);
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.toLowerCase().includes(
        tab === 'holdings' ? 'posic' : tab === 'history' ? 'histor' : 'subir'
      ));
    });
  },

  async _loadTab(container) {
    container.textContent = '';
    const spinner = _el('div', { className: 'spinner', style: 'display:block;margin:30px auto;' });
    container.appendChild(spinner);

    if (this.state.activeTab === 'holdings') {
      await this._loadHoldings(container);
    } else if (this.state.activeTab === 'history') {
      await this._loadHistory(container);
    } else if (this.state.activeTab === 'upload') {
      this._loadUpload(container);
    }
  },

  async _loadHoldings(container) {
    try {
      const holdings = await API.getInvestmentHoldings();
      container.textContent = '';

      if (!holdings.length) {
        container.appendChild(_el('div', { className: 'empty' }, 'Sin posiciones abiertas'));
        return;
      }

      const table = _el('table', { className: 'table' });
      const thead = _el('thead', {},
        _el('tr', {},
          _el('th', {}, 'Ticker'),
          _el('th', {}, 'Broker'),
          _el('th', { style: 'text-align:right' }, 'Cantidad'),
          _el('th', { style: 'text-align:right' }, 'Costo Prom.'),
          _el('th', { style: 'text-align:right' }, 'Precio Act.'),
          _el('th', { style: 'text-align:right' }, 'Ganancia'),
          _el('th', { style: 'text-align:right' }, 'Ganancia %'),
        ),
      );
      table.appendChild(thead);

      const tbody = _el('tbody');
      holdings.forEach(h => {
        const pnlClass = h.pnl >= 0 ? 'gain' : 'loss';
        tbody.appendChild(_el('tr', {},
          _el('td', { style: 'font-weight:bold' }, h.ticker),
          _el('td', {}, this._formatBroker(h.broker)),
          _el('td', { style: 'text-align:right' }, h.quantity.toFixed(2)),
          _el('td', { style: 'text-align:right' }, App.fmt(h.avg_cost)),
          _el('td', { style: 'text-align:right' }, App.fmt(h.current_price)),
          _el('td', { style: `text-align:right;color:var(--color-${pnlClass})` }, App.fmt(h.pnl)),
          _el('td', { style: `text-align:right;color:var(--color-${pnlClass})` }, h.pnl_percent.toFixed(2) + '%'),
        ));
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch (err) {
      container.textContent = '';
      container.appendChild(_el('div', { className: 'error' }, 'Error al cargar: ' + err.message));
    }
  },

  async _loadHistory(container) {
    try {
      const history = await API.getInvestmentHistory();
      container.textContent = '';

      if (!history.length) {
        container.appendChild(_el('div', { className: 'empty' }, 'Sin historial'));
        return;
      }

      const table = _el('table', { className: 'table' });
      const thead = _el('thead', {},
        _el('tr', {},
          _el('th', {}, 'Fecha'),
          _el('th', {}, 'Ticker'),
          _el('th', {}, 'Tipo'),
          _el('th', { style: 'text-align:right' }, 'Cantidad'),
          _el('th', { style: 'text-align:right' }, 'Precio'),
          _el('th', {}, 'Broker'),
          _el('th', { style: 'text-align:right' }, 'Total'),
        ),
      );
      table.appendChild(thead);

      const tbody = _el('tbody');
      history.forEach(h => {
        const typeLabel = h.type === 'buy' ? 'Compra' : 'Venta';
        tbody.appendChild(_el('tr', {},
          _el('td', {}, h.date),
          _el('td', { style: 'font-weight:bold' }, h.ticker),
          _el('td', {}, typeLabel),
          _el('td', { style: 'text-align:right' }, h.quantity.toFixed(2)),
          _el('td', { style: 'text-align:right' }, App.fmt(h.price)),
          _el('td', {}, this._formatBroker(h.broker)),
          _el('td', { style: 'text-align:right' }, App.fmt(h.total)),
        ));
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch (err) {
      container.textContent = '';
      container.appendChild(_el('div', { className: 'error' }, 'Error al cargar: ' + err.message));
    }
  },

  _loadUpload(container) {
    container.textContent = '';

    const form = _el('div', { className: 'upload-form' },
      _el('h3', {}, 'Sube el estado de tu broker'),
      _el('p', {}, 'Soportamos: Cocos Capital, Invertir Online, Bull Market'),

      _el('div', {
        className: 'upload-zone',
        id: 'upload-zone',
        style: 'border:2px dashed var(--color-border);border-radius:8px;padding:40px;text-align:center;cursor:pointer;transition:all 0.2s;',
      },
        _el('div', { style: 'font-size:24px;margin-bottom:10px' }, '📁'),
        _el('p', {}, 'Arrastra un archivo CSV o XLSX aquí'),
        _el('p', { style: 'color:var(--color-text-secondary);font-size:12px' }, 'o haz clic para seleccionar'),
        _el('input', {
          type: 'file',
          accept: '.csv,.xlsx',
          id: 'file-input',
          style: 'display:none',
        }),
      ),

      _el('div', { id: 'upload-status', style: 'margin-top:20px;display:none' }),
    );

    container.appendChild(form);

    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    // Use arrow function to keep 'this' context
    fileInput.addEventListener('change', (e) => this._handleFileSelect(e));

    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.style.borderColor = 'var(--color-accent)';
      zone.style.background = 'var(--color-bg-secondary)';
    });
    zone.addEventListener('dragleave', () => {
      zone.style.borderColor = 'var(--color-border)';
      zone.style.background = 'transparent';
    });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.borderColor = 'var(--color-border)';
      zone.style.background = 'transparent';
      if (e.dataTransfer.files.length) {
        this._handleFileSelect({ target: { files: e.dataTransfer.files } });
      }
    });
  },

  async _handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const status = document.getElementById('upload-status');
    status.style.display = 'block';
    status.textContent = '';
    status.appendChild(_el('div', { className: 'spinner', style: 'display:block;margin:20px auto' }));

    try {
      const result = await API.uploadInvestmentCSV(file);
      status.textContent = '';
      status.className = 'success-msg';
      status.appendChild(_el('div', {},
        _el('p', { style: 'color:var(--color-gain);font-weight:bold' }, '✓ Importado exitosamente'),
        _el('p', {}, `Broker: ${result.broker}`),
        _el('p', {}, `Transacciones procesadas: ${result.fetched}`),
        _el('p', {}, `Transacciones guardadas: ${result.saved}`),
      ));
      setTimeout(() => { Investments.render(); }, 1500);
    } catch (err) {
      status.textContent = '';
      status.className = 'error-msg';
      status.appendChild(_el('div', { style: 'color:var(--color-loss)' },
        _el('p', { style: 'font-weight:bold' }, '✗ Error al importar'),
        _el('p', {}, err.message),
      ));
    }
  },

  _formatBroker(broker) {
    const names = {
      'cocos_capital': 'Cocos Capital',
      'invertir_online': 'Invertir Online',
      'bull_market': 'Bull Market',
    };
    return names[broker] || broker;
  },
};
