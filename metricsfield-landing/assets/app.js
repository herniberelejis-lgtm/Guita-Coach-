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
        eyebrow: 'El problema',
        title: 'Tu mejor mesa no deja rastro.',
        body: 'Comieron bien, los atendieron bien, se van. Mañana en Google no va a figurar nada. No es que no quieran dejar reseña: es que hay que acordarse, buscar el local y escribir, y eso pasa en el estacionamiento o nunca.',
        tags: ['El pedido llega tarde o no llega'],
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

  var demos = $$('[data-demo]').map(function (block) {
    var media = $('[data-demo-media]', block);
    return {
      block: block,
      media: media,
      video: $('video', media),
      bar: $('.demo-scrub span', media),
      points: $$('.demo-copy li', block),
      loading: false, ready: false, cur: 0, target: 0,
    };
  });

  function loadDemo(d) {
    if (reduce || d.loading) return;
    d.loading = true;
    var url = (isMobile() && d.video.getAttribute('data-src-mobile')) || d.video.getAttribute('data-src');
    var source = url.indexOf('data:') === 0
      ? Promise.resolve(url)
      : fetch(url)
          .then(function (r) { return r.ok ? r.blob() : Promise.reject(new Error(String(r.status))); })
          .then(function (blob) { return URL.createObjectURL(blob); });
    source
      .then(function (src) {
        d.video.src = src;
        d.video.addEventListener('loadedmetadata', function () { d.ready = true; });
        d.video.addEventListener('seeked', function () { d.media.classList.add('has-clip'); }, { once: true });
      })
      .catch(function () { d.loading = false; });  // se queda el poster
  }

  function readDemos() {
    var vh = window.innerHeight || 1;
    demos.forEach(function (d) {
      var r = d.block.getBoundingClientRect();
      if (r.top < vh * 2 && r.bottom > -vh) loadDemo(d);
      // Con el video pinneado, el progreso es cuánto del bloque ya pasó por
      // arriba: 0 cuando el bloque toca el borde superior, 1 cuando termina.
      var span = Math.max(1, r.height - vh);
      d.target = clamp(-r.top / span, 0, 1);
      if (d.bar) d.bar.style.transform = 'scaleX(' + d.target.toFixed(3) + ')';
      // Repartidos parejo en el primer 72% del recorrido: el primero ya está
      // encendido cuando el bloque se fija, el último bastante antes del final.
      var n = Math.max(1, d.points.length - 1);
      d.points.forEach(function (li, i) {
        li.classList.toggle('on', d.target >= (i / n) * 0.72);
      });
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

  /* ══════════ la cadena del tap ══════════
     La línea se dibuja según cuánto de la lista pasó por el centro de la
     pantalla, y cada paso se enciende cuando le toca. El progreso es continuo
     (la línea) y discreto (los pasos) a la vez, así el recorrido se lee
     mientras se scrollea y no solo al final. */
  var chain = $('#chain');
  if (chain) {
    var steps = $$('.step-c', chain);
    var readChain = function () {
      var r = chain.getBoundingClientRect();
      var mark = window.innerHeight * 0.62;          // la línea sigue este punto
      var p = clamp((mark - r.top) / r.height, 0, 1);
      chain.style.setProperty('--chain-p', p.toFixed(4));
      steps.forEach(function (st) {
        st.classList.toggle('on', st.getBoundingClientRect().top < mark);
      });
    };
    var chainTick = false;
    window.addEventListener('scroll', function () {
      if (!chainTick) { chainTick = true; requestAnimationFrame(function () { readChain(); chainTick = false; }); }
    }, { passive: true });
    window.addEventListener('resize', readChain);
    readChain();
  }

  /* ══════════ simulador ROI ══════════
     La cadena tiene tres eslabones y cada uno se calcula sobre el anterior:

       taps    = clientes × tasa de tap del rubro
       reseñas = taps × tasa de publicación   (no todo el que toca termina escribiendo)
       nuevos  = clientes × LIFT

     El prototipo original calculaba las reseñas sobre los clientes en vez de
     sobre los taps, así que daba ~48 reseñas para 56 taps: un 86% de los que
     tocan el cartel dejarían reseña. Acá las reseñas cuelgan de los taps, que
     es el orden real de los hechos.

     LIFT (3–7%) es el único número que no se mide con el producto, así que se
     ancla a algo verificable: la ficha del cliente de referencia muestra +0,7★
     desde la instalación, y la literatura sobre reseñas y facturación ubica el
     impacto en torno al 5–9% por estrella. 0,7★ sobre ese rango da 3,5–6,3%;
     el 3–7% es esa banda, redondeada y algo conservadora del lado de abajo. */
  var LIFT_MIN = 0.03, LIFT_MAX = 0.07;
  var elClients = $('#roi-clients');
  var elTicket = $('#roi-ticket');
  if (elClients && elTicket) {
    var outClients = $('#out-clients'), outTicket = $('#out-ticket');
    var rReviews = $('#r-reviews'), rTaps = $('#r-taps'), rNew = $('#r-new'), rRev = $('#r-rev');
    var industry = { tap: 0.07, pub: 0.28 };
    var ar = function (n) { return Math.round(n).toLocaleString('es-AR'); };

    function computeRoi() {
      var clients = Number(elClients.value);
      var ticket = Number(elTicket.value);
      outClients.textContent = ar(clients);
      outTicket.textContent = '$' + ar(ticket);

      var taps = clients * industry.tap;
      rTaps.textContent = '~' + ar(taps);
      rReviews.textContent = '~' + ar(taps * industry.pub);

      var min = Math.round(clients * LIFT_MIN), max2 = Math.round(clients * LIFT_MAX);
      rNew.textContent = '+' + ar(min) + ' – ' + ar(max2);
      rRev.textContent = '$' + ar(min * ticket) + ' – $' + ar(max2 * ticket);
    }

    elClients.addEventListener('input', computeRoi);
    elTicket.addEventListener('input', computeRoi);
    $$('#roi-industries .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        $$('#roi-industries .chip').forEach(function (c) { c.classList.toggle('is-active', c === chip); });
        industry = { tap: Number(chip.getAttribute('data-tap')), pub: Number(chip.getAttribute('data-pub')) };
        computeRoi();
      });
    });
    computeRoi();
  }

  /* ══════════ varios ══════════ */
  $('#year').textContent = String(new Date().getFullYear());

  // Las fotos de producto se sirven desde Vercel Blob. Si el host no responde,
  // se cae a un frame del video de demo que está en el repo.
  $$('img[data-fallback]').forEach(function (img) {
    img.addEventListener('error', function once() {
      img.removeEventListener('error', once);
      img.src = img.getAttribute('data-fallback');
    });
  });

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
