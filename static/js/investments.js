/* Investments page — single unified view with holdings, history, and upload */
const Investments = {
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

    // Single unified view
    const container = _el('div', { className: 'card' });
    main.appendChild(container);

    await this._loadAllContent(container);
  },

  async _loadAllContent(container) {
    container.textContent = '';

    // Upload section at top
    container.appendChild(_el('div', { style: 'margin-bottom:40px;' },
      _el('p', { className: 'section-title' }, 'Subir movimientos'),
    ));
    this._loadUpload(container);

    // Holdings section
    container.appendChild(_el('div', { style: 'margin-top:40px;margin-bottom:40px;' },
      _el('p', { className: 'section-title' }, 'Posiciones abiertas'),
    ));
    await this._loadHoldings(container);

    // History section
    container.appendChild(_el('div', { style: 'margin-top:40px;' },
      _el('p', { className: 'section-title' }, 'Historial de transacciones'),
    ));
    await this._loadHistory(container);
  },

  async _loadHoldings(container) {
    try {
      const holdings = await API.getInvestmentHoldings();
      const section = _el('div', {});

      if (!holdings.length) {
        section.appendChild(_el('div', { className: 'empty' }, 'Sin posiciones abiertas'));
        container.appendChild(section);
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
      section.appendChild(table);
      container.appendChild(section);
    } catch (err) {
      section.appendChild(_el('div', { className: 'error' }, 'Error al cargar: ' + err.message));
      container.appendChild(section);
    }
  },

  async _loadHistory(container) {
    try {
      const history = await API.getInvestmentHistory();
      const section = _el('div', {});

      if (!history.length) {
        section.appendChild(_el('div', { className: 'empty' }, 'Sin historial'));
        container.appendChild(section);
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
      section.appendChild(table);
      container.appendChild(section);
    } catch (err) {
      section.appendChild(_el('div', { className: 'error' }, 'Error al cargar: ' + err.message));
      container.appendChild(section);
    }
  },

  _loadUpload(container) {
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
