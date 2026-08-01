/* Floating AI chat widget */
const _chatHistory = [];

const ChatWidget = {
  _isOpen: false,
  _ready: false,
  _dragging: false,

  init() {
    const wrap = document.createElement('div');
    wrap.id = 'chat-widget';
    wrap.innerHTML = `
      <button id="cw-btn" title="Asesor IA" aria-label="Abrir asesor financiero">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="22" height="22">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <div id="cw-panel" style="display:none">
        <div id="cw-header">
          <div id="cw-header-left">
            <div id="cw-avatar">G</div>
            <div>
              <div id="cw-name">Guita Coach</div>
              <div id="cw-status-line"><span class="cw-dot"></span> En línea</div>
            </div>
          </div>
          <div id="cw-header-actions">
            <button id="cw-min" title="Minimizar">—</button>
            <button id="cw-cls" title="Cerrar">✕</button>
          </div>
        </div>
        <div id="cw-messages"></div>
        <div id="cw-footer">
          <input id="cw-input" type="text" placeholder="Escribí tu consulta…" autocomplete="off">
          <button id="cw-send" aria-label="Enviar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    document.getElementById('cw-btn').addEventListener('click', () => {
      if (!this._dragging) this.toggle();
    });
    document.getElementById('cw-min').addEventListener('click', () => this.close());
    document.getElementById('cw-cls').addEventListener('click', () => this.close());
    document.getElementById('cw-send').addEventListener('click', () => this._send());
    document.getElementById('cw-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
    });
    this._makeDraggable();
  },

  toggle() { this._isOpen ? this.close() : this.open(); },

  open() {
    this._isOpen = true;
    const panel = document.getElementById('cw-panel');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    if (!this._ready) {
      this._bubble('assistant',
        '¡Hola! Soy tu asesor financiero de Guita Coach.\n\n' +
        'Podés preguntarme sobre tu presupuesto, gastos, inversiones o cualquier duda de finanzas personales.'
      );
      this._ready = true;
      this._loadStarters();
    }
    setTimeout(() => document.getElementById('cw-input')?.focus(), 150);
  },

  close() {
    this._isOpen = false;
    const panel = document.getElementById('cw-panel');
    if (panel) panel.style.display = 'none';
  },

  _bubble(role, text) {
    const msgs = document.getElementById('cw-messages');
    if (!msgs) return null;
    const b = document.createElement('div');
    b.className = 'cw-bubble ' + role;
    b.textContent = text;
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
    return b;
  },

  async _loadStarters() {
    try {
      const data = await fetch('/api/chat/starters').then(r => r.json());
      const msgs = document.getElementById('cw-messages');
      if (!msgs || !data.starters?.length) return;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:2px;';
      data.starters.slice(0, 3).forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'cw-starter';
        btn.textContent = s;
        btn.addEventListener('click', () => {
          wrap.remove();
          document.getElementById('cw-input').value = s;
          this._send();
        });
        wrap.appendChild(btn);
      });
      msgs.appendChild(wrap);
      msgs.scrollTop = msgs.scrollHeight;
    } catch (_) {}
  },

  async _send() {
    const inp = document.getElementById('cw-input');
    const msg = (inp?.value || '').trim();
    if (!msg) return;
    inp.value = '';

    this._bubble('user', msg);
    _chatHistory.push({ role: 'user', content: msg });

    const typing = this._bubble('assistant', '···');
    if (typing) typing.classList.add('typing');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: _chatHistory.slice(-10) }),
      });
      const d = await res.json();
      const reply = d.reply || d.message || 'No pude procesar tu consulta.';
      if (typing) { typing.classList.remove('typing'); typing.textContent = reply; }
      _chatHistory.push({ role: 'assistant', content: reply });
    } catch (_) {
      if (typing) { typing.classList.remove('typing'); typing.textContent = 'Error de conexión. Intentá de nuevo.'; }
    }
    const msgs = document.getElementById('cw-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  },

  _makeDraggable() {
    const wrap = document.getElementById('chat-widget');
    const btn = document.getElementById('cw-btn');
    let sx, sy, sl, sb, moved;

    const move = (cx, cy) => {
      const dx = cx - sx, dy = cy - sy;
      if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      moved = true;
      this._dragging = true;
      const r = Math.max(0, window.innerWidth - sl - dx - btn.offsetWidth);
      const b = Math.max(0, sb - dy);
      wrap.style.right = r + 'px';
      wrap.style.bottom = b + 'px';
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMouse);
      document.removeEventListener('mouseup', onUp);
      setTimeout(() => { this._dragging = false; }, 0);
    };
    const onMouse = e => move(e.clientX, e.clientY);

    btn.addEventListener('mousedown', e => {
      moved = false;
      sx = e.clientX; sy = e.clientY;
      const r = wrap.getBoundingClientRect();
      sl = r.left; sb = window.innerHeight - r.bottom;
      document.addEventListener('mousemove', onMouse);
      document.addEventListener('mouseup', onUp);
    });

    btn.addEventListener('touchstart', e => {
      moved = false;
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      const r = wrap.getBoundingClientRect();
      sl = r.left; sb = window.innerHeight - r.bottom;
    }, { passive: true });
    btn.addEventListener('touchmove', e => {
      const t = e.touches[0];
      move(t.clientX, t.clientY);
      if (moved) e.preventDefault();
    }, { passive: false });
    btn.addEventListener('touchend', () => {
      setTimeout(() => { this._dragging = false; }, 0);
    });
  },
};

// Shim: if someone navigates to #chat directly, open the widget and stay on dashboard
const Chat = {
  render() {
    ChatWidget.open();
    history.replaceState(null, '', '#dashboard');
    Dashboard.render();
  },
};
