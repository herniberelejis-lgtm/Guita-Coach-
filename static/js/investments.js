/* Investments page — single unified view with holdings, history, and CSV upload */
const Investments = {
  async render() {
    const main = document.getElementById('main');
    main.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-icon';
    backBtn.textContent = '←';
    backBtn.onclick = () => App.navigate('dashboard');
    header.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = 'Inversiones';
    header.appendChild(title);
    main.appendChild(header);

    const container = document.createElement('div');
    container.className = 'card';
    main.appendChild(container);

    await this._loadAllContent(container);
  },

  async _loadAllContent(container) {
    container.innerHTML = '';

    // Upload section
    const uploadTitle = document.createElement('p');
    uploadTitle.className = 'section-title';
    uploadTitle.textContent = 'Subir movimientos';
    uploadTitle.style.marginBottom = '20px';
    container.appendChild(uploadTitle);

    this._buildUploadForm(container);

    // Holdings section
    const holdingsDiv = document.createElement('div');
    holdingsDiv.style.marginTop = '40px';
    holdingsDiv.style.marginBottom = '40px';
    const holdingsTitle = document.createElement('p');
    holdingsTitle.className = 'section-title';
    holdingsTitle.textContent = 'Posiciones abiertas';
    holdingsTitle.style.marginBottom = '20px';
    holdingsDiv.appendChild(holdingsTitle);
    container.appendChild(holdingsDiv);

    const holdingsContent = document.createElement('div');
    container.appendChild(holdingsContent);
    await this._loadHoldings(holdingsContent);

    // History section
    const historyDiv = document.createElement('div');
    historyDiv.style.marginTop = '40px';
    const historyTitle = document.createElement('p');
    historyTitle.className = 'section-title';
    historyTitle.textContent = 'Historial de transacciones';
    historyTitle.style.marginBottom = '20px';
    historyDiv.appendChild(historyTitle);
    container.appendChild(historyDiv);

    const historyContent = document.createElement('div');
    container.appendChild(historyContent);
    await this._loadHistory(historyContent);
  },

  async _loadHoldings(container) {
    try {
      const holdings = await API.getInvestmentHoldings();

      if (!holdings || !holdings.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Sin posiciones abiertas';
        container.appendChild(empty);
        return;
      }

      const table = document.createElement('table');
      table.className = 'table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Ticker', 'Broker', 'Cantidad', 'Costo Prom.', 'Precio Act.', 'Ganancia', 'Ganancia %'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        if (text !== 'Ticker' && text !== 'Broker') th.style.textAlign = 'right';
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      holdings.forEach(h => {
        const row = document.createElement('tr');
        const pnlClass = h.pnl >= 0 ? 'gain' : 'loss';

        const tickerCell = document.createElement('td');
        tickerCell.textContent = h.ticker;
        tickerCell.style.fontWeight = 'bold';
        row.appendChild(tickerCell);

        const brokerCell = document.createElement('td');
        brokerCell.textContent = this._formatBroker(h.broker);
        row.appendChild(brokerCell);

        const qtyCell = document.createElement('td');
        qtyCell.textContent = h.quantity.toFixed(2);
        qtyCell.style.textAlign = 'right';
        row.appendChild(qtyCell);

        const avgCell = document.createElement('td');
        avgCell.textContent = App.fmt(h.avg_cost);
        avgCell.style.textAlign = 'right';
        row.appendChild(avgCell);

        const priceCell = document.createElement('td');
        priceCell.textContent = App.fmt(h.current_price);
        priceCell.style.textAlign = 'right';
        row.appendChild(priceCell);

        const pnlCell = document.createElement('td');
        pnlCell.textContent = App.fmt(h.pnl);
        pnlCell.style.textAlign = 'right';
        pnlCell.style.color = `var(--color-${pnlClass})`;
        row.appendChild(pnlCell);

        const pctCell = document.createElement('td');
        pctCell.textContent = h.pnl_percent.toFixed(2) + '%';
        pctCell.style.textAlign = 'right';
        pctCell.style.color = `var(--color-${pnlClass})`;
        row.appendChild(pctCell);

        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch (err) {
      const error = document.createElement('div');
      error.className = 'error';
      error.textContent = 'Error al cargar: ' + err.message;
      container.appendChild(error);
    }
  },

  async _loadHistory(container) {
    try {
      const history = await API.getInvestmentHistory();

      if (!history || !history.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Sin historial';
        container.appendChild(empty);
        return;
      }

      const table = document.createElement('table');
      table.className = 'table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Fecha', 'Ticker', 'Tipo', 'Cantidad', 'Precio', 'Broker', 'Total'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        if (text !== 'Fecha' && text !== 'Tipo' && text !== 'Broker') th.style.textAlign = 'right';
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      history.forEach(h => {
        const row = document.createElement('tr');
        const typeLabel = h.type === 'buy' ? 'Compra' : 'Venta';

        const dateCell = document.createElement('td');
        dateCell.textContent = h.date;
        row.appendChild(dateCell);

        const tickerCell = document.createElement('td');
        tickerCell.textContent = h.ticker;
        tickerCell.style.fontWeight = 'bold';
        row.appendChild(tickerCell);

        const typeCell = document.createElement('td');
        typeCell.textContent = typeLabel;
        row.appendChild(typeCell);

        const qtyCell = document.createElement('td');
        qtyCell.textContent = h.quantity.toFixed(2);
        qtyCell.style.textAlign = 'right';
        row.appendChild(qtyCell);

        const priceCell = document.createElement('td');
        priceCell.textContent = App.fmt(h.price);
        priceCell.style.textAlign = 'right';
        row.appendChild(priceCell);

        const brokerCell = document.createElement('td');
        brokerCell.textContent = this._formatBroker(h.broker);
        row.appendChild(brokerCell);

        const totalCell = document.createElement('td');
        totalCell.textContent = App.fmt(h.total);
        totalCell.style.textAlign = 'right';
        row.appendChild(totalCell);

        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } catch (err) {
      const error = document.createElement('div');
      error.className = 'error';
      error.textContent = 'Error al cargar: ' + err.message;
      container.appendChild(error);
    }
  },

  _buildUploadForm(container) {
    const form = document.createElement('div');
    form.className = 'upload-form';

    const h3 = document.createElement('h3');
    h3.textContent = 'Sube el estado de tu broker';
    form.appendChild(h3);

    const p1 = document.createElement('p');
    p1.textContent = 'Soportamos: Cocos Capital, Invertir Online, Bull Market';
    form.appendChild(p1);

    const zone = document.createElement('div');
    zone.className = 'upload-zone';
    zone.id = 'upload-zone-' + Date.now();
    zone.style.cssText = 'border:2px dashed var(--color-border);border-radius:8px;padding:40px;text-align:center;cursor:pointer;transition:all 0.2s;';

    const icon = document.createElement('div');
    icon.style.fontSize = '24px';
    icon.style.marginBottom = '10px';
    icon.textContent = '📁';
    zone.appendChild(icon);

    const p2 = document.createElement('p');
    p2.textContent = 'Arrastra un archivo CSV o XLSX aquí';
    zone.appendChild(p2);

    const p3 = document.createElement('p');
    p3.style.color = 'var(--color-text-secondary)';
    p3.style.fontSize = '12px';
    p3.textContent = 'o haz clic para seleccionar';
    zone.appendChild(p3);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.xlsx';
    fileInput.id = 'file-input-' + Date.now();
    fileInput.style.display = 'none';
    zone.appendChild(fileInput);

    form.appendChild(zone);

    const status = document.createElement('div');
    status.id = 'upload-status-' + Date.now();
    status.style.marginTop = '20px';
    status.style.display = 'none';
    form.appendChild(status);

    container.appendChild(form);

    const zoneEl = document.getElementById(zone.id);
    const fileInputEl = document.getElementById(fileInput.id);
    const statusEl = document.getElementById(status.id);

    fileInputEl.addEventListener('change', (e) => this._handleFileSelect(e, statusEl));

    zoneEl.addEventListener('click', () => fileInputEl.click());
    zoneEl.addEventListener('dragover', e => {
      e.preventDefault();
      zoneEl.style.borderColor = 'var(--color-accent)';
      zoneEl.style.background = 'var(--color-bg-secondary)';
    });
    zoneEl.addEventListener('dragleave', () => {
      zoneEl.style.borderColor = 'var(--color-border)';
      zoneEl.style.background = 'transparent';
    });
    zoneEl.addEventListener('drop', e => {
      e.preventDefault();
      zoneEl.style.borderColor = 'var(--color-border)';
      zoneEl.style.background = 'transparent';
      if (e.dataTransfer.files.length) {
        this._handleFileSelect({ target: { files: e.dataTransfer.files } }, statusEl);
      }
    });
  },

  async _handleFileSelect(e, statusEl) {
    const file = e.target.files[0];
    if (!file) return;

    statusEl.style.display = 'block';
    statusEl.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.display = 'block';
    spinner.style.margin = '20px auto';
    statusEl.appendChild(spinner);

    try {
      const result = await API.uploadInvestmentCSV(file);
      statusEl.textContent = '';
      statusEl.className = 'success-msg';

      const title = document.createElement('p');
      title.style.color = 'var(--color-gain)';
      title.style.fontWeight = 'bold';
      title.textContent = '✓ Importado exitosamente';
      statusEl.appendChild(title);

      const brokerP = document.createElement('p');
      brokerP.textContent = `Broker: ${result.broker}`;
      statusEl.appendChild(brokerP);

      const fetchedP = document.createElement('p');
      fetchedP.textContent = `Transacciones procesadas: ${result.fetched}`;
      statusEl.appendChild(fetchedP);

      const savedP = document.createElement('p');
      savedP.textContent = `Transacciones guardadas: ${result.saved}`;
      statusEl.appendChild(savedP);

      setTimeout(() => { Investments.render(); }, 1500);
    } catch (err) {
      statusEl.textContent = '';
      statusEl.className = 'error-msg';

      const title = document.createElement('p');
      title.style.fontWeight = 'bold';
      title.style.color = 'var(--color-loss)';
      title.textContent = '✗ Error al importar';
      statusEl.appendChild(title);

      const msg = document.createElement('p');
      msg.style.color = 'var(--color-loss)';
      msg.textContent = err.message;
      statusEl.appendChild(msg);
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
