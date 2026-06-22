/* Guita Coach Academy — contenido educativo, priorizado por perfil */
const Academy = {
  async render() {
    const main = document.getElementById('main');
    main.textContent = '';

    const header = document.createElement('div');
    header.className = 'page-header';
    const title = document.createElement('h2');
    title.textContent = 'Academia';
    header.appendChild(title);
    main.appendChild(header);

    const sp = document.createElement('div');
    sp.className = 'spinner';
    sp.style.cssText = 'display:block;margin:80px auto;';
    main.appendChild(sp);

    const data = await API.getAcademy().catch(() => null);
    main.removeChild(sp);

    if (!data) {
      const msg = document.createElement('div');
      msg.className = 'card';
      msg.style.color = 'var(--muted)';
      msg.textContent = 'No se pudo cargar el contenido. Probá de nuevo más tarde.';
      main.appendChild(msg);
      return;
    }

    if (data.recommended && data.recommended.length > 0) {
      const t = document.createElement('p');
      t.className = 'section-title';
      t.textContent = 'Para vos';
      main.appendChild(t);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:28px;';
      data.recommended.forEach(function(topic) {
        grid.appendChild(Academy._topicCard(topic, true));
      });
      main.appendChild(grid);
    }

    (data.categories || []).forEach(function(cat) {
      const t = document.createElement('p');
      t.className = 'section-title';
      t.textContent = cat.label;
      main.appendChild(t);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:28px;';
      (cat.topics || []).forEach(function(topic) {
        grid.appendChild(Academy._topicCard(topic, false));
      });
      main.appendChild(grid);
    });
  },

  _topicCard(topic, highlighted) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'cursor:pointer;' + (highlighted ? 'border-left:4px solid var(--gold);' : '');

    const name = document.createElement('div');
    name.style.cssText = 'font-weight:600;margin-bottom:4px;';
    name.textContent = topic.title;
    card.appendChild(name);

    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:.85rem;color:var(--muted);';
    summary.textContent = topic.summary;
    card.appendChild(summary);

    const body = document.createElement('div');
    body.style.cssText = 'display:none;font-size:.88rem;line-height:1.6;color:var(--white);margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);';
    body.textContent = topic.body;
    card.appendChild(body);

    card.addEventListener('click', function() {
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });

    return card;
  },
};
