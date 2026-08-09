/* Portal de cliente, recreado y navegable dentro de la landing.
   ---------------------------------------------------------------------------
   No es un mockup inventado: reproduce app.metricsfield.com/portal con los
   datos de la cuenta demo (Cliente Prueba, Restaurante/Bar en Nueva Córdoba,
   3 locales, datos a junio 2026). La idea es que el visitante navegue el
   software en vez de leer una descripción del software.

   Cada sección del sidebar existe en el producto y hace lo que dice acá. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mount = document.getElementById('portal');
  if (!mount) return;

  var ar = function (n) { return Math.round(n).toLocaleString('es-AR'); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  // ---- los datos de la cuenta demo ----
  var LOCALES = [
    { name: 'Cliente Prueba', zone: 'Nueva Córdoba', rating: 4.8, reviews: 140, dStar: '+0.7', dRev: 106, active: true },
    { name: 'Cliente Prueba — Güemes', zone: 'Güemes', rating: 4.5, reviews: 59, dStar: '+0.6', dRev: 45 },
    { name: 'Cliente Prueba — Cerro de las Rosas', zone: 'Cerro de las Rosas', rating: 4.5, reviews: 33, dStar: '+0.7', dRev: 28 },
  ];

  var KPIS = [
    { v: 1576, l: 'Taps del cartel', i: 'wifi' },
    { v: 0, l: 'Reseñas hoy', i: 'star' },
    { v: 38, l: 'Reseñas este mes', i: 'star' },
    { v: 1180, l: 'Visitas al perfil', i: 'eye' },
    { v: 140, l: 'Reseñas totales', i: 'trend' },
  ];

  var NAV = [
    { id: 'resumen', label: 'Resumen', icon: 'grid' },
    { id: 'resenas', label: 'Reseñas', icon: 'star', badge: '1' },
    { id: 'negocio', label: 'Mi Negocio', icon: 'home', group: true },
    { id: 'sucursales', label: 'Sucursales', icon: 'home', sub: true, badge: '3' },
    { id: 'dispositivos', label: 'Dispositivos', icon: 'device', sub: true },
    { id: 'escaneos', label: 'Escaneos', icon: 'wifi', sub: true },
    { id: 'rating', label: 'Mi Rating en Google', icon: 'star', sub: true },
    { id: 'competidores', label: 'Competidores', icon: 'search', sub: true },
    { id: 'mes', label: 'Resumen del mes', icon: 'chart', sub: true },
  ];

  // Qué explica cada sección. Es la respuesta a "para qué me sirve esta pantalla".
  var EXPLAIN = {
    resumen:      'Lo que mirás cada mañana: cuánto se usó el hardware, cuántas reseñas entraron y cómo viene cada local.',
    resenas:      'Cada reseña de Google, con un borrador de respuesta ya escrito. Aprobás y se publica.',
    sucursales:   'Una ficha por local. Los números nunca se mezclan entre sucursales.',
    dispositivos: 'Cada pieza de hardware con su código único. Podés cambiarle el destino sin reimprimir nada.',
    escaneos:     'El registro crudo: qué pieza, qué día, qué hora. De acá salen todos los demás números.',
    rating:       'La evolución de tu calificación desde que instalaste, contra el punto de partida.',
    competidores: 'Tu ficha contra la de los locales que compiten con vos en la misma zona.',
    mes:          'El cierre del mes en una página, listo para mandar por PDF.',
  };

  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
    device: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><line x1="11" y1="18.5" x2="13" y2="18.5"/>',
    wifi: '<path d="M2 8.5C7 3.5 17 3.5 22 8.5"/><path d="M5.5 12.5C9 9 15 9 18.5 12.5"/><path d="M9 16.5c1.8-1.8 4.2-1.8 6 0"/><circle cx="12" cy="20" r="1"/>',
    eye: '<path d="M1.5 12S5.5 5.5 12 5.5 22.5 12 22.5 12 18.5 18.5 12 18.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>',
    trend: '<polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>',
    chart: '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="15"/>',
  };
  function icon(name, size) {
    return '<svg class="pi" viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || '') + '</svg>';
  }

  // ---- anillo de calificación ----
  function ring(rating, dark) {
    var R = 34, C = 2 * Math.PI * R, pct = rating / 5;
    return '<svg class="ring" viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">' +
      '<circle cx="40" cy="40" r="' + R + '" fill="none" stroke="' + (dark ? 'rgba(255,255,255,.18)' : 'rgba(9,9,11,.10)') + '" stroke-width="5"/>' +
      '<circle class="ring-v" cx="40" cy="40" r="' + R + '" fill="none" stroke="' + (dark ? '#FFFFFF' : '#09090B') +
        '" stroke-width="5" stroke-linecap="round" transform="rotate(-90 40 40)"' +
        ' stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) +
        '" data-off="' + (C * (1 - pct)).toFixed(1) + '"/>' +
      '<text x="40" y="40" text-anchor="middle" dominant-baseline="central" class="ring-t">' + rating.toFixed(1) + '</text>' +
      '</svg>';
  }

  function localCard(l) {
    return '<article class="loc' + (l.active ? ' is-active' : '') + '">' +
      '<p class="loc-h">' + icon('home', 13) + 'Calificación Google</p>' +
      '<div class="loc-body">' + ring(l.rating, l.active) +
        '<div class="loc-side">' +
          '<div class="loc-stars">★★★★★</div>' +
          '<p class="loc-rev">' + l.reviews + ' reseñas</p>' +
          '<p class="loc-since">Desde que usás MetricsField</p>' +
          '<p class="loc-delta">' + l.dStar + '★<span>+' + l.dRev + ' reseñas</span></p>' +
        '</div>' +
      '</div>' +
      '<p class="loc-name">' + esc(l.name) + '</p>' +
      '<p class="loc-zone">' + esc(l.zone) + (l.active ? ' · viendo ahora' : '') + '</p>' +
      '</article>';
  }

  // ---- el contenido de cada sección ----
  var VIEWS = {
    resumen: function () {
      return '<div class="attn">' + '<span class="dot"></span>Necesita tu atención' +
          '<span class="attn-n">2</span></div>' +
        '<div class="kpis">' + KPIS.map(function (k) {
          return '<div class="kpi">' + '<span class="kpi-i">' + icon(k.i, 15) + '</span>' +
            '<b data-to="' + k.v + '">0</b><span class="kpi-l">' + k.l + '</span></div>';
        }).join('') + '</div>' +
        '<p class="sec-l">Rendimiento · 3 locales</p>' +
        '<div class="locs">' + LOCALES.map(localCard).join('') + '</div>';
    },

    resenas: function () {
      var R = [
        { a: 'Facundo Ríos', s: 5, t: 'El mejor asado de la zona, sin dudas. Nicolás nos hizo sentir como en casa.', w: 'Hace 1 día', pending: true },
        { a: 'María Belén Torres', s: 5, t: 'Súper atenta con los chicos. Volvemos seguro.', w: 'Hace 2 días' },
        { a: 'Camila Ontiveros', s: 4, t: 'Muy buena atención, la comida un poco lenta en salir pero valió la pena.', w: 'Hace 3 días' },
      ];
      return '<p class="sec-l">Reseñas de Google · Nueva Córdoba</p>' + R.map(function (r) {
        return '<article class="rev">' +
          '<header><span class="av">' + r.a.charAt(0) + '</span><b>' + esc(r.a) + '</b>' +
            '<span class="st">' + '★'.repeat(r.s) + '</span><time>' + r.w + '</time></header>' +
          '<p>' + esc(r.t) + '</p>' +
          (r.pending
            ? '<div class="draft"><b>Respuesta sugerida</b><q>¡Gracias por la visita, Facundo! Le pasamos el saludo a Nicolás. Te esperamos pronto.</q>' +
              '<div class="draft-a"><button type="button" class="mini">Publicar</button><button type="button" class="mini ghost">Editar</button></div></div>'
            : '<span class="ok-t">✓ Respondida</span>') +
          '</article>';
      }).join('');
    },

    sucursales: function () {
      return '<p class="sec-l">3 locales · cada uno con su ficha y sus códigos</p>' +
        '<div class="locs">' + LOCALES.map(localCard).join('') + '</div>';
    },

    dispositivos: function () {
      var D = [
        { c: 'p-0001-a3f9c2', t: 'Standee', loc: 'Nueva Córdoba', where: 'Mostrador', taps: 526, on: true },
        { c: 'p-0002-77bd10', t: 'Tarjeta', loc: 'Nueva Córdoba', where: 'Nicolás Ferreyra', taps: 346, on: true },
        { c: 'p-0003-c1e845', t: 'Tarjeta', loc: 'Nueva Córdoba', where: 'Camila Suárez', taps: 281, on: true },
        { c: 'p-0004-9ab233', t: 'Standee', loc: 'Güemes', where: 'Barra', taps: 268, on: true },
        { c: 'p-0005-4f70de', t: 'Sticker', loc: 'Cerro de las Rosas', where: 'Mesa 4', taps: 155, on: false },
      ];
      return '<p class="sec-l">Cada pieza tiene su código. El destino se edita sin reimprimir.</p>' +
        '<div class="tbl-w"><table class="tbl"><thead><tr>' +
        '<th>Código</th><th>Tipo</th><th>Local</th><th>Dónde está</th><th class="r">Taps</th><th>Estado</th>' +
        '</tr></thead><tbody>' + D.map(function (d) {
          return '<tr><td><code>' + d.c + '</code></td><td>' + d.t + '</td><td>' + d.loc + '</td><td>' + d.where +
            '</td><td class="r num">' + ar(d.taps) + '</td><td>' +
            (d.on ? '<span class="pill on">activo</span>' : '<span class="pill off">pausado</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    },

    escaneos: function () {
      var E = [
        ['12:04', 'p-0002-77bd10', 'Tarjeta · Nicolás', 'iPhone', 'NFC'],
        ['12:01', 'p-0001-a3f9c2', 'Standee · Mostrador', 'Android', 'QR'],
        ['11:47', 'p-0001-a3f9c2', 'Standee · Mostrador', 'iPhone', 'NFC'],
        ['11:32', 'p-0003-c1e845', 'Tarjeta · Camila', 'iPhone', 'NFC'],
        ['11:20', 'p-0004-9ab233', 'Standee · Barra', 'Android', 'NFC'],
      ];
      return '<p class="sec-l">Hoy · 5 de los 47 escaneos registrados</p>' +
        '<div class="tbl-w"><table class="tbl"><thead><tr>' +
        '<th>Hora</th><th>Pieza</th><th>Dónde</th><th>Dispositivo</th><th>Vía</th>' +
        '</tr></thead><tbody>' + E.map(function (e) {
          return '<tr><td class="num">' + e[0] + '</td><td><code>' + e[1] + '</code></td><td>' + e[2] +
            '</td><td>' + e[3] + '</td><td><span class="pill">' + e[4] + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="foot-n">De esta tabla salen los taps por día, por hora, por pieza y por colaborador.</p>';
    },

    rating: function () {
      var pts = [4.1, 4.15, 4.2, 4.3, 4.45, 4.55, 4.7, 4.8];
      var meses = ['Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
      var min = 4.0, max = 5.0, W = 100, H = 44;
      var d = pts.map(function (p, i) {
        return (i ? 'L' : 'M') + (i / (pts.length - 1) * W).toFixed(1) + ',' +
          (H - (p - min) / (max - min) * H).toFixed(1);
      }).join(' ');
      return '<p class="sec-l">Calificación de Nueva Córdoba · últimos 8 meses</p>' +
        '<div class="spark"><svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="spark-l" d="' + d + '" fill="none" stroke="#09090B" stroke-width="1.4" ' +
          'vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg><div class="spark-x">' + meses.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div></div>' +
        '<div class="two"><div class="mini-c"><p>Al instalar</p><b>4.1★</b></div>' +
        '<div class="mini-c"><p>Hoy</p><b>4.8★</b></div>' +
        '<div class="mini-c"><p>Reseñas sumadas</p><b>+106</b></div></div>';
    },

    competidores: function () {
      var C = [
        { n: 'Tu local', r: 4.8, v: 140, you: true },
        { n: 'Competidor a 300 m', r: 4.4, v: 212 },
        { n: 'Competidor a 500 m', r: 4.3, v: 98 },
        { n: 'Competidor a 800 m', r: 4.6, v: 61 },
      ];
      return '<p class="sec-l">Tu zona · Nueva Córdoba</p>' +
        '<div class="tbl-w"><table class="tbl"><thead><tr><th>Ficha</th><th class="r">Rating</th><th class="r">Reseñas</th><th>Posición</th></tr></thead><tbody>' +
        C.map(function (c, i) {
          return '<tr' + (c.you ? ' class="you"' : '') + '><td>' + (c.you ? '<b>' + c.n + '</b>' : c.n) +
            '</td><td class="r num">' + c.r.toFixed(1) + '★</td><td class="r num">' + c.v +
            '</td><td>' + (i === 0 ? '<span class="pill on">1º en rating</span>' : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    },

    mes: function () {
      return '<p class="sec-l">Junio 2026 · los tres locales</p>' +
        '<div class="two"><div class="mini-c"><p>Taps</p><b>1.576</b></div>' +
        '<div class="mini-c"><p>Reseñas nuevas</p><b>38</b></div>' +
        '<div class="mini-c"><p>Visitas al perfil</p><b>1.180</b></div></div>' +
        '<p class="foot-n">Se manda solo por mail el primero de cada mes, en PDF.</p>';
    },
  };
  VIEWS.negocio = VIEWS.sucursales;

  // ---- armado ----
  var nav = NAV.map(function (n) {
    return '<button type="button" class="pnav-i' + (n.sub ? ' sub' : '') + (n.group ? ' group' : '') +
      (n.id === 'resumen' ? ' is-active' : '') + '" data-view="' + n.id + '">' +
      icon(n.icon, 15) + '<span>' + n.label + '</span>' +
      (n.badge ? '<i class="pnav-b">' + n.badge + '</i>' : '') + '</button>';
  }).join('');

  mount.innerHTML =
    '<div class="pshell">' +
      '<aside class="pnav">' +
        '<div class="pbrand"><span class="pmark">M</span><div><b>METRICSFIELD</b><i>Portal de cliente</i></div></div>' +
        '<nav aria-label="Secciones del portal">' + nav + '</nav>' +
        '<p class="pnote">Portal privado de Cliente Prueba. No compartas este link.</p>' +
      '</aside>' +
      '<div class="pmain">' +
        '<header class="ptop">' +
          '<h3 id="ptitle">Resumen</h3>' +
          '<span class="pchip"><i class="dot on"></i>Google conectado</span>' +
          '<span class="pchip green">Hablar con tu agencia</span>' +
          '<div class="pwho"><span class="av">C</span><div><b>Cliente Prueba <i class="pill on">Premium</i></b>' +
            '<span>Restaurante / Bar · Nueva Córdoba · datos a Jun 2026</span></div></div>' +
        '</header>' +
        '<p class="pexp" id="pexp">' + EXPLAIN.resumen + '</p>' +
        '<div class="pbody" id="pbody">' + VIEWS.resumen() + '</div>' +
      '</div>' +
    '</div>';

  var body = document.getElementById('pbody');
  var title = document.getElementById('ptitle');
  var expl = document.getElementById('pexp');

  function animate() {
    // Los anillos se dibujan y los números suben, una sola vez por render.
    body.querySelectorAll('.ring-v').forEach(function (c) {
      var off = c.getAttribute('data-off');
      if (reduce) { c.style.strokeDashoffset = off; return; }
      requestAnimationFrame(function () { c.style.strokeDashoffset = off; });
    });
    body.querySelectorAll('[data-to]').forEach(function (el) {
      var to = Number(el.getAttribute('data-to'));
      if (reduce || !to) { el.textContent = ar(to); return; }
      var t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / 1100);
        el.textContent = ar(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  mount.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.pnav-i');
    if (!btn) return;
    var id = btn.getAttribute('data-view');
    if (!VIEWS[id]) return;
    mount.querySelectorAll('.pnav-i').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
    title.textContent = btn.querySelector('span').textContent;
    expl.textContent = EXPLAIN[id] || '';
    body.innerHTML = VIEWS[id]();
    body.classList.remove('in');
    void body.offsetWidth;      // reinicia la animación de entrada
    body.classList.add('in');
    animate();
  });

  // Arranca cuando el portal entra en pantalla, no antes.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { animate(); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(mount);
  } else { animate(); }
})();
