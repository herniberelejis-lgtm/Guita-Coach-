/* Chat Asesor — pantalla de chat con asesor financiero */
var _chatHistory = [];

const Chat = {
  async render() {
    const main = document.getElementById('main');
    main.textContent = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;height:calc(100vh - 120px);';

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';
    const hLeft = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = 'Asesor Financiero';
    const sub = document.createElement('p');
    sub.style.cssText = 'color:var(--muted);font-size:.82rem;margin-top:2px;';
    sub.textContent = 'Prioridades: deudas → fondo emergencia → inversion diversificada';
    hLeft.appendChild(h2);
    hLeft.appendChild(sub);
    header.appendChild(hLeft);
    wrap.appendChild(header);

    // Messages area
    const messages = document.createElement('div');
    messages.id = 'chat-messages';
    messages.style.cssText = 'flex:1;overflow-y:auto;padding:16px 0;display:flex;flex-direction:column;gap:12px;';
    wrap.appendChild(messages);

    // Input area
    const inputArea = document.createElement('div');
    inputArea.style.cssText = 'display:flex;gap:8px;padding:16px 0 8px;border-top:1px solid rgba(255,255,255,.08);margin-top:8px;';

    const input = document.createElement('input');
    input.id = 'chat-input';
    input.type = 'text';
    input.placeholder = 'Escribi tu consulta...';
    input.style.cssText = 'flex:1;background:var(--navy2);border:1px solid rgba(255,255,255,.1);color:var(--white);padding:12px 16px;border-radius:10px;font-size:.9rem;outline:none;';
    input.setAttribute('autocomplete', 'off');

    const sendBtn = document.createElement('button');
    sendBtn.id = 'chat-send-btn';
    sendBtn.className = 'btn btn-primary';
    sendBtn.textContent = 'Enviar';

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);
    wrap.appendChild(inputArea);
    main.appendChild(wrap);

    // Reset history on fresh render
    _chatHistory = [];

    // Load starters
    this._loadStarters(messages);

    // Wire up input
    sendBtn.addEventListener('click', function() {
      const val = input.value.trim();
      if (val) { input.value = ''; Chat._send(val); }
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const val = input.value.trim();
        if (val) { input.value = ''; Chat._send(val); }
      }
    });
  },

  async _loadStarters(container) {
    try {
      const data = await API.get('/chat/starters');
      const intro = document.createElement('div');
      intro.style.cssText = 'text-align:center;color:var(--muted);font-size:.85rem;padding:12px 0 8px;';
      intro.textContent = 'Hola! Soy tu asesor financiero. En que te ayudo hoy?';
      container.appendChild(intro);

      const startersWrap = document.createElement('div');
      startersWrap.id = 'chat-starters';
      startersWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      (data.starters || []).forEach(function(s) {
        const btn = document.createElement('button');
        btn.style.cssText = 'background:var(--navy2);border:1px solid rgba(255,255,255,.1);color:var(--muted);padding:12px 16px;border-radius:10px;cursor:pointer;text-align:left;font-size:.88rem;';
        btn.textContent = s;
        btn.addEventListener('mouseover', function() { btn.style.borderColor = 'var(--gold)'; btn.style.color = 'var(--white)'; });
        btn.addEventListener('mouseout', function() { btn.style.borderColor = 'rgba(255,255,255,.1)'; btn.style.color = 'var(--muted)'; });
        btn.addEventListener('click', function() {
          const starters = document.getElementById('chat-starters');
          if (starters) starters.remove();
          Chat._send(s);
        });
        startersWrap.appendChild(btn);
      });

      container.appendChild(startersWrap);
    } catch (_) {}
  },

  _appendBubble(role, text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const bubble = document.createElement('div');
    const isUser = role === 'user';
    bubble.style.cssText = [
      'max-width:80%;padding:12px 16px;border-radius:14px;font-size:.88rem;line-height:1.55;',
      isUser
        ? 'align-self:flex-end;background:var(--gold);color:var(--bg);border-bottom-right-radius:4px;margin-left:auto;'
        : 'align-self:flex-start;background:var(--navy2);color:var(--white);border-bottom-left-radius:4px;border:1px solid rgba(255,255,255,.06);',
    ].join('');
    bubble.textContent = text;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  },

  async _send(text) {
    this._appendBubble('user', text);
    _chatHistory.push({ role: 'user', content: text });

    // Typing indicator
    const container = document.getElementById('chat-messages');
    const typing = document.createElement('div');
    typing.id = 'chat-typing';
    typing.style.cssText = 'align-self:flex-start;background:var(--navy2);border:1px solid rgba(255,255,255,.06);border-radius:14px;border-bottom-left-radius:4px;padding:12px 16px;color:var(--muted);font-size:.88rem;';
    typing.textContent = '...';
    if (container) { container.appendChild(typing); container.scrollTop = container.scrollHeight; }

    // Disable input while waiting
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('chat-send-btn');
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: _chatHistory.slice(0, -1) }),
      });
      const data = await resp.json();
      const reply = data.reply || 'No pude procesar tu consulta.';

      const t = document.getElementById('chat-typing');
      if (t) t.remove();

      this._appendBubble('assistant', reply);
      _chatHistory.push({ role: 'assistant', content: reply });
    } catch (_) {
      const t = document.getElementById('chat-typing');
      if (t) t.remove();
      this._appendBubble('assistant', 'Hubo un error de conexion. Intenta de nuevo.');
    } finally {
      if (input) { input.disabled = false; input.focus(); }
      if (btn) btn.disabled = false;
    }
  },
};
