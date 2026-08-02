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

    if (data.glossary && data.glossary.length > 0) {
      const t = document.createElement('p');
      t.className = 'section-title';
      t.textContent = 'Glosario financiero';
      main.appendChild(t);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-bottom:28px;';
      data.glossary.forEach(function(term) {
        list.appendChild(Academy._glossaryCard(term));
      });
      main.appendChild(list);
    }

    // Investments gate — locked behind financial literacy test
    Academy._renderInvestGate(main);
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

  _renderInvestGate(main) {
    const budget = App.state.budget;
    const KEY = 'gc-invest-profile';
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'border-top:1px solid var(--navy3);margin:36px 0 24px;';
    main.appendChild(divider);

    const sTitle = document.createElement('p');
    sTitle.className = 'section-title';
    sTitle.textContent = 'Inversiones';
    main.appendChild(sTitle);

    if (saved && saved.profile) {
      // Already unlocked — show status + CTA
      const box = document.createElement('div');
      box.className = 'invest-unlocked';
      const left = document.createElement('div');
      left.className = 'invest-unlocked-info';
      const icon = document.createElement('span');
      icon.style.cssText = 'color:var(--color-accent);display:inline-flex;';
      icon.innerHTML = Icon('lock-open', 26);
      const info = document.createElement('div');
      const name = document.createElement('div');
      name.style.fontWeight = '600';
      name.textContent = 'Inversiones desbloqueadas';
      const badge = document.createElement('div');
      badge.className = 'invest-profile-badge';
      badge.textContent = 'Perfil: ' + saved.profile;
      info.appendChild(name);
      info.appendChild(badge);
      left.appendChild(icon);
      left.appendChild(info);
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Ver mis Inversiones →';
      btn.addEventListener('click', () => App.navigate('investments'));
      box.appendChild(left);
      box.appendChild(btn);
      main.appendChild(box);
      return;
    }

    // Locked gate
    const gate = document.createElement('div');
    gate.className = 'invest-gate';
    const gateIcon = document.createElement('div');
    gateIcon.className = 'gate-icon';
    gateIcon.innerHTML = Icon('lock-closed', 32);
    const gateTitle = document.createElement('h3');
    gateTitle.textContent = 'Desbloqueá las Inversiones';
    const gateDesc = document.createElement('p');
    gateDesc.textContent = 'Completá este test de finanzas personales para acceder al módulo de inversiones. Son 6 preguntas y te lleva menos de 2 minutos.';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-primary';
    startBtn.textContent = 'Empezar test →';
    gate.appendChild(gateIcon);
    gate.appendChild(gateTitle);
    gate.appendChild(gateDesc);
    gate.appendChild(startBtn);
    main.appendChild(gate);

    const quizWrap = document.createElement('div');
    quizWrap.className = 'invest-quiz';
    quizWrap.style.display = 'none';
    main.appendChild(quizWrap);

    startBtn.addEventListener('click', () => {
      gate.style.display = 'none';
      quizWrap.style.display = 'block';
      quizWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      Academy._runQuiz(quizWrap, budget, KEY);
    });
  },

  _runQuiz(container, budget, KEY) {
    const isVariable = !!(budget && budget.income_is_variable);
    const income = (budget && budget.monthly_income) || 0;

    const QUESTIONS = [
      {
        q: '¿Tenés un fondo de emergencia?',
        sub: isVariable
          ? 'Con ingresos variables, un colchón de liquidez es especialmente crítico.'
          : 'Cubre 3 meses de gastos fijos antes de invertir.',
        opts: [
          { text: 'Sí, cubro más de 3 meses de gastos fijos', pts: 3 },
          { text: 'Algo tengo, para 1 o 2 meses', pts: 2 },
          { text: 'Muy poco o nada todavía', pts: 0 },
        ],
      },
      {
        q: '¿Cómo están tus deudas de consumo?',
        sub: 'Tarjetas con saldo, préstamos personales, cuotas pendientes.',
        opts: [
          { text: 'No tengo deudas significativas', pts: 3 },
          { text: 'Tengo algo pero lo controlo bien', pts: 2 },
          { text: 'Las deudas me pesan bastante', pts: 0 },
        ],
      },
      {
        q: '¿Cuándo podrías necesitar el dinero que invertieras?',
        sub: 'El horizonte temporal define qué instrumentos son adecuados para vos.',
        opts: [
          { text: 'En más de 5 años, puedo dejarlo crecer', pts: 3 },
          { text: 'En 1 a 5 años', pts: 2 },
          { text: 'En menos de 1 año', pts: 0 },
        ],
      },
      {
        q: '¿Qué harías si tu cartera cae un 25% en un mes?',
        sub: 'Las caídas son parte normal del mercado. Lo que importa es cómo reaccionás.',
        opts: [
          { text: 'Compraría más, aprovecho el precio bajo', pts: 3 },
          { text: 'Esperaría tranquilo a que se recupere', pts: 2 },
          { text: 'Vendería para no perder más', pts: 0 },
        ],
      },
      {
        q: '¿Qué nivel de riesgo estás dispuesto a asumir?',
        sub: 'Mayor riesgo potencialmente = mayor retorno, pero también más volatilidad.',
        opts: [
          { text: 'Alto — acepto grandes variaciones a cambio de más retorno', pts: 3 },
          { text: 'Medio — busco crecimiento con cierta estabilidad', pts: 2 },
          { text: 'Bajo — prefiero conservar aunque gane menos', pts: 1 },
        ],
      },
      {
        q: '¿Cuánto sabés de inversiones financieras?',
        sub: 'Esto nos ayuda a personalizar los instrumentos que te recomendamos.',
        opts: [
          { text: 'Tengo experiencia, manejé carteras antes', pts: 3 },
          { text: 'Entiendo los básicos: acciones, bonos, FCI', pts: 2 },
          { text: 'Poco o nada, estoy empezando de cero', pts: 1 },
        ],
      },
    ];

    const answers = new Array(QUESTIONS.length).fill(null);
    let current = 0;
    const LETTERS = ['A', 'B', 'C'];

    function renderQ() {
      container.innerHTML = '';

      // Progress dots
      const progress = document.createElement('div');
      progress.className = 'quiz-progress';
      QUESTIONS.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'quiz-progress-dot' + (answers[i] !== null ? ' done' : '');
        progress.appendChild(dot);
      });
      container.appendChild(progress);

      const counter = document.createElement('div');
      counter.style.cssText = 'font-size:.76rem;color:var(--muted);margin-bottom:10px;';
      counter.textContent = 'Pregunta ' + (current + 1) + ' de ' + QUESTIONS.length;
      container.appendChild(counter);

      const q = QUESTIONS[current];
      const qDiv = document.createElement('div');
      qDiv.className = 'quiz-q';
      qDiv.textContent = q.q;
      container.appendChild(qDiv);

      if (q.sub) {
        const sub = document.createElement('div');
        sub.className = 'quiz-q-sub';
        sub.textContent = q.sub;
        container.appendChild(sub);
      }

      const opts = document.createElement('div');
      opts.className = 'quiz-options';
      q.opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option' + (answers[current] === i ? ' selected' : '');
        const letter = document.createElement('div');
        letter.className = 'quiz-option-letter';
        letter.textContent = LETTERS[i];
        const text = document.createElement('span');
        text.textContent = opt.text;
        btn.appendChild(letter);
        btn.appendChild(text);
        btn.addEventListener('click', () => {
          answers[current] = i;
          if (current < QUESTIONS.length - 1) {
            current++;
            renderQ();
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            showResult();
          }
        });
        opts.appendChild(btn);
      });
      container.appendChild(opts);

      if (current > 0) {
        const nav = document.createElement('div');
        nav.className = 'quiz-nav';
        const back = document.createElement('button');
        back.className = 'btn btn-ghost btn-sm';
        back.textContent = '← Anterior';
        back.addEventListener('click', () => { current--; renderQ(); });
        nav.appendChild(back);
        container.appendChild(nav);
      }
    }

    function showResult() {
      const score = answers.reduce((s, a, i) => s + (a !== null ? QUESTIONS[i].opts[a].pts : 0), 0);
      let profile, desc;
      if (score >= 13) {
        profile = 'Agresivo';
        desc = 'Tolerás bien el riesgo y buscás maximizar retornos a largo plazo. Podés considerar mayor exposición a renta variable, acciones y activos de crecimiento.';
      } else if (score >= 9) {
        profile = 'Moderado-Agresivo';
        desc = 'Buscás crecimiento con gestión del riesgo. Una cartera diversificada con mayoría en renta variable y algo de renta fija puede ser tu camino.';
      } else if (score >= 5) {
        profile = 'Moderado';
        desc = 'Preferís balance entre crecimiento y estabilidad. Fondos mixtos, CEDEARs defensivos y renta fija ajustada por inflación se ajustan a tu perfil.';
      } else {
        profile = 'Conservador';
        desc = 'Priorizás preservar tu capital. Plazos fijos, FCI de money market, Lecaps y bonos cortos son tu punto de partida ideal.';
      }

      try {
        localStorage.setItem(KEY, JSON.stringify({ profile, score, date: new Date().toISOString() }));
      } catch (_) {}

      container.innerHTML = '';
      const result = document.createElement('div');
      result.className = 'quiz-result';
      const emoji = document.createElement('div');
      emoji.className = 'result-emoji';
      emoji.style.color = 'var(--color-accent)';
      emoji.innerHTML = Icon('check-circle', 40);
      const title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = '¡Test completado!';
      const badge = document.createElement('div');
      badge.className = 'invest-profile-badge';
      badge.style.cssText = 'display:inline-flex;margin-bottom:10px;';
      badge.textContent = 'Perfil: ' + profile;
      const descEl = document.createElement('p');
      descEl.className = 'result-desc';
      descEl.textContent = desc;
      const goBtn = document.createElement('button');
      goBtn.className = 'btn btn-primary';
      goBtn.textContent = 'Ver mis Inversiones →';
      goBtn.addEventListener('click', () => App.navigate('investments'));
      result.appendChild(emoji);
      result.appendChild(title);
      result.appendChild(badge);
      result.appendChild(descEl);
      result.appendChild(goBtn);
      container.appendChild(result);
    }

    renderQ();
  },

  _glossaryCard(term) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'cursor:pointer;';

    const name = document.createElement('div');
    name.style.cssText = 'font-weight:600;display:flex;justify-content:space-between;align-items:center;';
    const nameText = document.createElement('span');
    nameText.textContent = term.term;
    const chevron = document.createElement('span');
    chevron.style.cssText = 'color:var(--muted);font-size:.8rem;transition:transform .15s;';
    chevron.textContent = '▾';
    name.appendChild(nameText);
    name.appendChild(chevron);
    card.appendChild(name);

    const body = document.createElement('div');
    body.style.cssText = 'display:none;font-size:.88rem;line-height:1.6;color:var(--white);margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);';

    const fields = [
      ['Definición formal', term.definition_formal],
      ['En criollo', term.definition_simple],
      ['Ejemplo práctico', term.example],
    ];
    fields.forEach(function(pair) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:10px;';
      const label = document.createElement('div');
      label.style.cssText = 'font-weight:600;color:var(--gold);font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px;';
      label.textContent = pair[0];
      const value = document.createElement('div');
      value.textContent = pair[1];
      row.appendChild(label);
      row.appendChild(value);
      body.appendChild(row);
    });
    card.appendChild(body);

    card.addEventListener('click', function() {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      chevron.style.transform = open ? 'none' : 'rotate(180deg)';
    });

    return card;
  },
};
