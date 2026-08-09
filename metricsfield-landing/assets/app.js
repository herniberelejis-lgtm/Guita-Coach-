/* MetricsField — landing
   Acto 1: el mundo scrolleado (motor scroll-world).
   Acto 2: la página de venta y sus interacciones. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var WA = 'https://wa.me/5493513480773';

  /* ══════════ ACTO 1 · el mundo ══════════
     Los cuatro beats salen de un mismo film cortado en los cortes reales de su
     montaje (3.54s y 5.08s) y en el arranque de la disolvencia al panel (frame
     168). Por eso encadenan sin conector: la costura es continua por
     construcción, no una aproximación. */
  mountScrollWorld($('#world'), {
    hint: 'scrolleá',
    crossfade: 0.08,
    sections: [
      {
        id: 'local', label: 'El local', accent: '#10B981',
        still: 'assets/img/beat-local.webp',
        clip: 'assets/vid/local.mp4', clipMobile: 'assets/vid/local-m.mp4',
        scroll: 1.7, linger: 0.35,
        eyebrow: 'Un martes cualquiera',
        title: 'Tu mejor mesa no deja rastro.',
        body: 'La atendieron bien, comieron bien, se van contentos. Y mañana nadie en Google va a enterarse. Tus clientes felices casi nunca dejan reseña: no porque no quieran, sino porque nadie se las pidió en el momento justo.',
        tags: ['Sin fricción', 'Sin apps'],
      },
      {
        id: 'gesto', label: 'El gesto', accent: '#10B981',
        still: 'assets/img/beat-gesto.webp',
        clip: 'assets/vid/gesto.mp4', clipMobile: 'assets/vid/gesto-m.mp4',
        scroll: 1.15, linger: 0.2,
        eyebrow: 'El momento exacto',
        title: 'Un tap. Un segundo.',
        body: 'La tarjeta sale del bolsillo del mozo al cerrar la mesa. El cliente acerca el celular y ya está en tu ficha de Google. Sin descargar nada, sin buscar tu local, sin escribir una URL.',
        tags: ['NFC NTAG215', 'QR de respaldo', 'iPhone y Android'],
      },
      {
        id: 'dato', label: 'El dato', accent: '#38BDF8',
        still: 'assets/img/beat-dato.webp',
        clip: 'assets/vid/dato.mp4', clipMobile: 'assets/vid/dato-m.mp4',
        scroll: 1.2,
        eyebrow: 'Lo que no se ve',
        title: 'Cada tap deja un rastro.',
        body: 'El link no va derecho a Google: pasa por nuestros servidores. Ahí queda registrado qué pieza se tocó, en qué sucursal, a qué hora y de qué colaborador era la tarjeta. Después sí, redirige.',
        tags: ['Link editable', 'Atribución por pieza'],
      },
      {
        id: 'panel', label: 'El panel', accent: '#2563EB',
        still: 'assets/img/beat-panel.webp',
        clip: 'assets/vid/panel.mp4', clipMobile: 'assets/vid/panel-m.mp4',
        scroll: 2.0, linger: 0.45,
        eyebrow: 'El final del viaje',
        title: 'Y aterriza acá.',
        body: 'Taps por día y por hora, reseñas nuevas, rating contra el mes anterior, ranking por colaborador y respuestas sugeridas listas para publicar. Todo lo que pasó en el mostrador, medido.',
        cta: {
          primary: { label: 'Pedir demo presencial gratis', href: WA + '?text=Hola!%20Quiero%20una%20demo%20presencial%20gratis%20de%20MetricsField' },
          secondary: { label: 'Ver el panel por dentro', href: '#panel' },
        },
      },
    ],
  });

  /* ══════════ navbar ══════════ */
  var nav = $('#nav');
  var burger = $('#burger');
  var drawer = $('#drawer');
  var progressFill = $('#progress-fill');
  var navLinks = $$('#nav-links a');
  var sectionIds = navLinks.map(function (a) { return a.getAttribute('href'); })
    .filter(function (h) { return h && h.charAt(0) === '#'; });

  burger.addEventListener('click', function () {
    var open = drawer.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    burger.innerHTML = '<svg width="22" height="22"><use href="#' + (open ? 'i-x' : 'i-menu') + '"/></svg>';
  });
  $$('#drawer a').forEach(function (a) {
    a.addEventListener('click', function () {
      drawer.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.innerHTML = '<svg width="22" height="22"><use href="#i-menu"/></svg>';
    });
  });

  // La navbar arranca sobre el mundo (oscuro) y se vuelve sólida recién al
  // entrar en la página de venta, que es blanca.
  var sales = $('#sales');
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    nav.classList.toggle('is-solid', y > sales.offsetTop - 80);

    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    progressFill.style.transform = 'scaleX(' + clamp(max > 0 ? y / max : 0, 0, 1) + ')';

    // scrollspy
    var active = null;
    for (var i = 0; i < sectionIds.length; i++) {
      var el = document.querySelector(sectionIds[i]);
      if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.4) active = sectionIds[i];
    }
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === active);
    });
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { onScroll(); ticking = false; }); }
  }, { passive: true });
  onScroll();

  /* ══════════ reveals + contadores ══════════ */
  var counted = new WeakSet();
  function countUp(el) {
    if (counted.has(el)) return;
    counted.add(el);
    var target = Number(el.getAttribute('data-count'));
    var prefix = el.getAttribute('data-prefix') || '';
    if (reduce) { el.textContent = prefix + target.toLocaleString('es-AR'); return; }
    var t0 = performance.now(), dur = 1400;
    (function step(now) {
      var p = clamp((now - t0) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString('es-AR');
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        $$('[data-count]', e.target).forEach(countUp);
        if (e.target.hasAttribute('data-count')) countUp(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
    $$('[data-count]').forEach(countUp);
  }

  /* ══════════ tabs de hardware ══════════ */
  var hwTabs = $$('.tab');
  hwTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var panelId = tab.getAttribute('aria-controls');
      hwTabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      $$('.hw-panel').forEach(function (p) {
        var on = p.id === panelId;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
    });
  });

  /* ══════════ demos scrubbeados ══════════
     Mismo criterio que el motor del hero: el clip se baja como Blob (siempre
     seekable, no depende de que el host sirva byte-ranges), el poster se
     mantiene hasta que pinta un frame de verdad, y nunca se encola un seek
     mientras el decoder sigue ocupado. */
  var isMobile = function () {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches
        || window.matchMedia('(max-width: 860px)').matches;
  };

  var demos = $$('[data-demo-media]').map(function (media) {
    return {
      media: media,
      video: $('video', media),
      bar: $('.demo-scrub span', media),
      loading: false, ready: false, cur: 0, target: 0,
    };
  });

  function loadDemo(d) {
    if (reduce || d.loading) return;
    d.loading = true;
    var url = (isMobile() && d.video.getAttribute('data-src-mobile')) || d.video.getAttribute('data-src');
    fetch(url)
      .then(function (r) { return r.ok ? r.blob() : Promise.reject(new Error(String(r.status))); })
      .then(function (blob) {
        d.video.src = URL.createObjectURL(blob);
        d.video.addEventListener('loadedmetadata', function () { d.ready = true; });
        d.video.addEventListener('seeked', function () { d.media.classList.add('has-clip'); }, { once: true });
      })
      .catch(function () { d.loading = false; });  // se queda el poster
  }

  function readDemos() {
    demos.forEach(function (d) {
      var r = d.media.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      if (r.top < vh * 2 && r.bottom > -vh) loadDemo(d);
      // La fracción va de "el bloque entra por abajo" a "sale por arriba".
      d.target = clamp((vh - r.top) / (r.height + vh), 0, 1);
      if (d.bar) d.bar.style.transform = 'scaleX(' + d.target.toFixed(3) + ')';
    });
  }

  function rafDemos() {
    var eps = isMobile() ? 0.02 : 0.008;
    demos.forEach(function (d) {
      if (!d.ready || d.video.seeking) return;
      d.cur += (d.target - d.cur) * (reduce ? 1 : 0.2);
      var t = clamp(d.cur, 0, 0.999) * (d.video.duration || 1);
      if (Math.abs(d.video.currentTime - t) > eps) {
        try { d.video.currentTime = t; } catch (e) {}
      }
    });
    requestAnimationFrame(rafDemos);
  }

  if (demos.length) {
    window.addEventListener('scroll', readDemos, { passive: true });
    window.addEventListener('resize', readDemos);
    readDemos();
    requestAnimationFrame(rafDemos);
    // iOS no pinta un frame seekeado de un video muted que nunca se reprodujo.
    window.addEventListener('touchstart', function prime() {
      demos.forEach(function (d) {
        if (!d.video.src) return;
        try {
          var p = d.video.play();
          if (p && p.then) p.then(function () { try { d.video.pause(); } catch (e) {} }).catch(function () {});
        } catch (e) {}
      });
    }, { once: true, passive: true });
  }

  /* ══════════ capturas del panel ══════════ */
  var shotsNav = $('#shots-nav');
  if (shotsNav) {
    shotsNav.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      var shot = btn.getAttribute('data-shot');
      $$('button', shotsNav).forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      $$('#shots-stage img').forEach(function (img) {
        img.classList.toggle('is-active', img.getAttribute('data-shot') === shot);
      });
    });
  }

  /* ══════════ ranking de personal ══════════ */
  var STAFF = [
    { name: 'Mostrador', taps: 526 }, { name: 'Nicolás Ferreyra', taps: 346 },
    { name: 'Camila Suárez', taps: 281 }, { name: 'Bruno Aguirre', taps: 196 },
    { name: 'Valentina Rossi', taps: 136 }, { name: 'Tomás Ledesma', taps: 81 },
  ];
  var rank = $('#rank');
  if (rank) {
    var max = Math.max.apply(null, STAFF.map(function (s) { return s.taps; }));
    rank.innerHTML = STAFF.map(function (s) {
      return '<div class="rank">' +
        '<span class="avatar">' + s.name.charAt(0) + '</span>' +
        '<div class="rank-body">' +
          '<div class="rank-top"><span>' + s.name + '</span><b>' + s.taps.toLocaleString('es-AR') + '</b></div>' +
          '<div class="meter"><i data-w="' + Math.round((s.taps / max) * 100) + '"></i></div>' +
        '</div></div>';
    }).join('');
    // Las barras crecen recién cuando la tarjeta entra en pantalla.
    var fill = function () { $$('#rank .meter i').forEach(function (i) { i.style.width = i.getAttribute('data-w') + '%'; }); };
    if ('IntersectionObserver' in window) {
      var ro = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { fill(); ro.disconnect(); }
      }, { threshold: 0.3 });
      ro.observe(rank);
    } else { fill(); }
  }

  /* ══════════ simulador ROI ══════════
     Misma fórmula que el prototipo de diseño: taps y reseñas salen de las tasas
     del rubro, y los clientes nuevos son un 15–35% de la base mensual. */
  var elClients = $('#roi-clients');
  var elTicket = $('#roi-ticket');
  if (elClients && elTicket) {
    var outClients = $('#out-clients'), outTicket = $('#out-ticket');
    var rReviews = $('#r-reviews'), rTaps = $('#r-taps'), rNew = $('#r-new'), rRev = $('#r-rev');
    var industry = { tap: 0.07, conv: 0.06 };
    var ar = function (n) { return Math.round(n).toLocaleString('es-AR'); };

    function computeRoi() {
      var clients = Number(elClients.value);
      var ticket = Number(elTicket.value);
      outClients.textContent = ar(clients);
      outTicket.textContent = '$' + ar(ticket);
      rTaps.textContent = '~' + ar(clients * industry.tap);
      rReviews.textContent = '~' + ar(clients * industry.conv);
      var min = Math.round(clients * 0.15), max2 = Math.round(clients * 0.35);
      rNew.textContent = '+' + ar(min) + ' – ' + ar(max2);
      rRev.textContent = '$' + ar(min * ticket) + ' – $' + ar(max2 * ticket);
    }

    elClients.addEventListener('input', computeRoi);
    elTicket.addEventListener('input', computeRoi);
    $$('#roi-industries .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        $$('#roi-industries .chip').forEach(function (c) { c.classList.toggle('is-active', c === chip); });
        industry = { tap: Number(chip.getAttribute('data-tap')), conv: Number(chip.getAttribute('data-conv')) };
        computeRoi();
      });
    });
    computeRoi();
  }

  /* ══════════ varios ══════════ */
  $('#year').textContent = String(new Date().getFullYear());

  // El scroll suave nativo pasa por debajo de la navbar fija: se compensa.
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      var y = target.getBoundingClientRect().top + window.pageYOffset - 72;
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    });
  });
})();
