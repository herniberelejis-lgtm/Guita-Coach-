/* ============================================================================
   scroll-world — motor de vuelo scrubbeado por scroll
   Adaptado de la skill `scroll-world` (references/scrub-engine.js) para material
   vertical 9:16.
   ----------------------------------------------------------------------------
   QUÉ SE CONSERVA DEL MOTOR ORIGINAL (es la parte que cuesta y la que importa):
     - carga de cada clip como Blob → object URL, así el scrubbing no depende de
       que el host sirva byte-ranges (si no, `seekable` queda en [0,0] y el video
       se ve congelado en el frame 0)
     - scroll → currentTime con lerp en rAF
     - coalescing de seeks: nunca se encola un currentTime nuevo mientras el
       decoder sigue en `seeking`. Es lo que evita que un flick rápido en celular
       apile seeks y congele el clip
     - priming iOS: un video muted que nunca se reprodujo no pinta un frame
       seekeado. Se hace play→pause en el primer gesto y se mantiene el poster
       hasta que pinta el primer frame de verdad
     - prefetch de los clips vecinos, crossfade en las costuras, linger easing,
       riel de ruta, prefers-reduced-motion, safe-area y resize que ignora la
       barra de URL
   QUÉ CAMBIA:
     - presentación. El original hace `object-fit:cover` a pantalla completa,
       pensado para clips 16:9. Con material 9:16 eso recorta la escena a una
       banda central en desktop. Acá el film va en un marco vertical con un
       fondo ambiental desenfocado detrás, y el copy al lado. En celular el
       film es full-bleed, que es su formato nativo.
     - el mundo termina y la página sigue: al pasar el final se marca `is-done`
       en el contenedor para que la landing de venta quede limpia arriba.
   ========================================================================== */

function mountScrollWorld(container, config) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const smallMQ = window.matchMedia('(max-width: 860px)');
  const isMobile = () => coarse || smallMQ.matches;

  const SECTIONS = config.sections || [];
  const N = SECTIONS.length;
  if (!N) return;
  const DIVE_W = config.diveScroll || 1.3;
  const CROSSFADE = (config.crossfade != null) ? config.crossfade : 0.12;

  injectCSS();
  container.classList.add('sw-root');

  // Los beats salen de un mismo film cortado en los cortes reales del montaje,
  // así que encadenan directo: no hay conectores que generar.
  const SEGMENTS = SECTIONS.map((s, i) => {
    const seg = {
      si: i, clip: s.clip, clipM: s.clipMobile, still: s.still,
      accent: s.accent, w: s.scroll || DIVE_W, linger: s.linger || 0,
    };
    s._seg = seg;
    return seg;
  });
  const NSEG = SEGMENTS.length;

  // ---- DOM ----
  const sky = el('div', 'sw-sky');
  sky.appendChild(el('div', 'sw-sky__grad'));
  const stage = el('div', 'sw-stage');
  const copylayer = el('div', 'sw-copylayer');
  const route = el('div', 'sw-route');
  const hint = el('div', 'sw-hint');
  const hintText = el('span');
  hintText.textContent = config.hint || 'scrolleá';
  hint.appendChild(hintText);
  hint.appendChild(el('i'));
  const track = el('div', 'sw-track');
  [sky, stage, copylayer, route, hint, track].forEach(n => container.appendChild(n));

  SEGMENTS.forEach(s => {
    const scene = el('div', 'sw-scene');
    if (s.accent) scene.style.setProperty('--sw-accent', s.accent);

    // Fondo ambiental: el mismo poster, desenfocado y escalado. Llena el 16:9
    // del desktop sin pagar un segundo decode de video.
    const bg = el('div', 'sw-scene__bg');
    if (s.still) bg.style.backgroundImage = `url("${s.still}")`;
    scene.appendChild(bg);

    const frame = el('div', 'sw-scene__frame');
    const img = el('img', 'sw-scene__still');
    img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
    if (s.still) img.src = s.still;
    frame.appendChild(img);
    scene.appendChild(frame);
    stage.appendChild(scene);

    Object.assign(s, {
      el: scene, frame, img, video: null, hasClip: false,
      loading: false, ready: false, cur: 0, target: 0, visible: false,
    });
  });

  // ---- copy + riel ----
  const copies = [], dots = [];
  SECTIONS.forEach((s, i) => {
    const c = el('article', 'sw-copy');
    if (s.accent) c.style.setProperty('--sw-accent', s.accent);
    c.innerHTML =
      `<span class="sw-copy__num">${pad(i + 1)} / ${pad(N)}</span>` +
      (s.eyebrow ? `<span class="sw-copy__eyebrow">${esc(s.eyebrow)}</span>` : '') +
      (s.title ? `<h2 class="sw-copy__title">${esc(s.title)}</h2>` : '') +
      (s.body ? `<p class="sw-copy__body">${esc(s.body)}</p>` : '') +
      (s.tags && s.tags.length
        ? `<ul class="sw-copy__tags">${s.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
      (s.cta ? `<div class="sw-copy__cta">${ctaBtns(s.cta)}</div>` : '');
    copylayer.appendChild(c);
    copies.push(c);

    const dot = el('button', 'sw-route__dot');
    dot.type = 'button';
    dot.setAttribute('aria-label', s.label || `Escena ${i + 1}`);
    if (s.accent) dot.style.setProperty('--sw-accent', s.accent);
    dot.innerHTML = `<span class="sw-route__label">${esc(s.label || '')}</span><i></i>`;
    dot.addEventListener('click', () => jumpTo(i));
    route.appendChild(dot);
    dots.push(dot);
  });

  // ---- matemática del scrub ----
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  // Remapeo monótono scroll→tiempo: la cámara se asienta en el medio de la
  // escena (justo donde el copy pega) y acelera cerca de las costuras.
  // f(0)=0 y f(1)=1 siempre, así los frames de costura quedan intactos.
  const lingerEase = (x, L) => { L = clamp(L); const c = x - 0.5; return (1 - L) * x + L * (4 * c * c * c + 0.5); };

  let vh = window.innerHeight, totalW = 0, activeIndex = -1, ticking = false;
  let laidOutW = window.innerWidth;

  function layout() {
    vh = window.innerHeight;
    laidOutW = window.innerWidth;
    let off = 0;
    SEGMENTS.forEach(s => { s.start = off * vh; off += s.w; s.end = off * vh; });
    totalW = off;
    track.style.height = (totalW * vh + vh) + 'px';  // +1vh para que el último beat complete
    read();
  }

  function jumpTo(i) {
    const seg = SECTIONS[i]._seg;
    window.scrollTo({ top: seg.start + (seg.end - seg.start) * 0.5, behavior: reduce ? 'auto' : 'smooth' });
  }

  function loadClip(s) {
    // Con reduced-motion no se baja ningún clip: quedan los stills y disuelven.
    if (reduce || s.loading || !s.clip) return;
    s.loading = true;
    const url = (isMobile() && s.clipM) ? s.clipM : s.clip;
    // Un data: URI ya viene entero y es seekable: pasarlo por fetch solo
    // duplicaría el gasto de memoria. Se asigna directo.
    const source = url.startsWith('data:')
      ? Promise.resolve(url)
      : fetch(url)
          .then(r => r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))
          .then(blob => URL.createObjectURL(blob));
    source
      .then(src => {
        const v = document.createElement('video');
        v.className = 'sw-scene__video';
        v.muted = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        v.src = src;
        v.addEventListener('loadedmetadata', () => { s.ready = true; read(); });
        // Recién se oculta el poster cuando pintó un frame de verdad. En iOS un
        // video muted que nunca se reprodujo queda en blanco, y ocultar el still
        // en `loadedmetadata` mostraría una escena vacía.
        v.addEventListener('seeked', () => { s.el.classList.add('has-clip'); }, { once: true });
        v.addEventListener('loadeddata', () => { try { v.pause(); } catch (e) {} if (userReady) primeVideo(v); });
        s.frame.appendChild(v);
        s.video = v;
        s.hasClip = true;
      })
      .catch(() => { s.loading = false; });  // se queda el still: la escena igual lee
  }

  function read() {
    const y = window.scrollY || window.pageYOffset;
    const fade = CROSSFADE * vh;
    let ci = 0;
    for (let i = 0; i < NSEG; i++) if (y >= SEGMENTS[i].start) ci = i;

    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (y > s.start - 1.6 * vh && y < s.end + 1.6 * vh) loadClip(s);
      const local = clamp((y - s.start) / (s.end - s.start), 0, 1);
      s.target = s.linger ? lingerEase(local, s.linger) : local;

      let outside = 0;
      if (y < s.start) outside = s.start - y;
      else if (y > s.end) outside = y - s.end;
      const op = smooth(1 - outside / fade);
      s.el.style.opacity = op;
      s.visible = op > 0.001;
      s.el.style.zIndex = (i === ci) ? '120' : String(100 + Math.round(op * 10));
      if (!s.hasClip || !s.ready) {
        const sc = reduce ? 1 : 1.02 + local * 0.08;
        s.img.style.transform = `scale(${sc.toFixed(3)})`;
      }
    }

    for (let i = 0; i < N; i++) {
      const seg = SECTIONS[i]._seg;
      const pr = clamp((y - seg.start) / (seg.end - seg.start), 0, 1);
      const before = y < seg.start, after = y > seg.end;
      let cop;
      if (i === 0) cop = after ? 0 : smooth(1 - pr / 0.62);          // saluda al aterrizar
      else if (i === N - 1) cop = before ? 0 : smooth(pr / 0.4);     // sostiene el CTA al final
      else cop = (before || after) ? 0 : smooth(1 - Math.abs(pr - 0.5) / 0.5);
      const c = copies[i];
      c.style.opacity = cop;
      c.style.transform = reduce ? 'none' : `translateY(${(0.5 - pr) * 4}vh)`;
      c.style.pointerEvents = cop > 0.5 ? 'auto' : 'none';
    }

    if (ci !== activeIndex) {
      activeIndex = ci;
      dots.forEach((d, k) => d.classList.toggle('is-active', k === ci));
      container.style.setProperty('--sw-accent', SECTIONS[ci].accent || '');
    }
    hint.style.opacity = clamp(1 - y / (0.5 * vh));
    // El mundo terminó: se apaga el cielo y el riel para que la página de venta
    // quede limpia arriba.
    container.classList.toggle('is-done', y > totalW * vh + 0.15 * vh);
    ticking = false;
  }

  function raf() {
    const eps = isMobile() ? 0.02 : 0.008;   // paso de seek más grueso en celu = menos decodes
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (!s.hasClip || !s.ready || !s.video) continue;
      if (s.video.seeking) continue;
      if (!s.visible && Math.abs(s.cur - s.target) < 0.002) continue;
      s.cur += (s.target - s.cur) * (reduce ? 1 : 0.18);
      const dur = s.video.duration || 1;
      const t = clamp(s.cur, 0, 0.999) * dur;
      if (Math.abs(s.video.currentTime - t) > eps) { try { s.video.currentTime = t; } catch (e) {} }
    }
    requestAnimationFrame(raf);
  }

  let userReady = false;
  function primeVideo(v) {
    if (!isMobile() || !v) return;
    try {
      const p = v.play();
      if (p && p.then) p.then(() => { try { v.pause(); } catch (e) {} }).catch(() => {});
    } catch (e) {}
  }
  function onFirstGesture() {
    if (userReady) return;
    userReady = true;
    SEGMENTS.forEach(s => primeVideo(s.video));
  }
  window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
  window.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(read); }
  }, { passive: true });

  // Los navegadores de celular disparan `resize` cada vez que entra o sale la
  // barra de URL. Rehacer el layout ahí recalcula el alto del track y patea el
  // scroll, así que en touch se ignoran los cambios que son solo de alto.
  function onResize() {
    if (coarse && window.innerWidth === laidOutW) return;
    layout();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', layout);
  window.addEventListener('load', layout);
  layout();
  requestAnimationFrame(raf);

  // ---- helpers ----
  function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function ctaBtns(cta) {
    let h = '';
    if (cta.primary) h += `<a class="sw-btn sw-btn--primary" href="${esc(cta.primary.href || '#')}"${cta.primary.href && cta.primary.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(cta.primary.label)}</a>`;
    if (cta.secondary) h += `<a class="sw-btn sw-btn--ghost" href="${esc(cta.secondary.href || '#')}">${esc(cta.secondary.label)}</a>`;
    return h;
  }
}

function injectCSS() {
  if (document.getElementById('sw-css')) return;
  const css = `
  .sw-root{--sw-bg:#09090B;--sw-ink:#FFFFFF;--sw-ink-soft:#A1A1AA;--sw-accent:#10B981;
    position:relative;color:var(--sw-ink);}
  .sw-sky{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:var(--sw-bg);
    transition:opacity .4s;}
  .sw-sky__grad{position:absolute;inset:-10%;
    background:radial-gradient(70% 50% at 72% 30%,color-mix(in srgb,var(--sw-accent) 16%,transparent),transparent 72%),
               radial-gradient(60% 45% at 20% 75%,color-mix(in srgb,#2563EB 14%,transparent),transparent 70%);
    transition:background .6s;}

  .sw-stage{position:fixed;inset:0;z-index:10;pointer-events:none;}
  .sw-scene{position:absolute;inset:0;opacity:0;overflow:hidden;will-change:opacity;}
  .sw-scene__bg{position:absolute;inset:-8%;background-size:cover;background-position:center;
    filter:blur(52px) saturate(1.35);opacity:.42;transform:scale(1.08);}
  .sw-scene__frame{position:absolute;top:50%;right:clamp(24px,7vw,120px);transform:translateY(-50%);
    height:min(78vh,640px);aspect-ratio:9/16;border-radius:26px;overflow:hidden;
    background:#000;box-shadow:0 40px 90px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);}
  .sw-scene__video,.sw-scene__still{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  .sw-scene__still{will-change:transform;}
  .sw-scene.has-clip .sw-scene__still{opacity:0;}
  .sw-scene__video{z-index:1;}

  .sw-copylayer{position:fixed;inset:0;z-index:20;pointer-events:none;}
  .sw-copylayer::before{content:"";position:absolute;inset:0;width:min(62vw,860px);
    background:linear-gradient(90deg,var(--sw-bg) 0%,color-mix(in srgb,var(--sw-bg) 88%,transparent) 38%,color-mix(in srgb,var(--sw-bg) 45%,transparent) 68%,transparent 100%);}
  .sw-copy{position:absolute;left:clamp(20px,6vw,88px);top:50%;transform:translateY(-50%);
    width:min(44vw,480px);opacity:0;will-change:opacity,transform;}
  .sw-copy__num{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem;
    letter-spacing:.14em;color:var(--sw-ink-soft);}
  .sw-copy__eyebrow{display:block;margin-top:16px;font-weight:700;font-size:.74rem;
    letter-spacing:.16em;text-transform:uppercase;color:var(--sw-accent);}
  .sw-copy__title{font-weight:700;color:var(--sw-ink);font-size:clamp(2rem,4.2vw,3.4rem);
    line-height:1.04;margin:12px 0 0;letter-spacing:-.03em;text-wrap:balance;}
  .sw-copy__body{margin-top:18px;font-size:clamp(1rem,1.2vw,1.12rem);line-height:1.58;
    color:var(--sw-ink-soft);max-width:42ch;}
  .sw-copy__tags{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 0;padding:0;}
  .sw-copy__tags li{font-size:.78rem;font-weight:600;color:var(--sw-accent);padding:6px 13px;
    border-radius:999px;background:color-mix(in srgb,var(--sw-accent) 12%,transparent);
    border:1px solid color-mix(in srgb,var(--sw-accent) 28%,transparent);}
  .sw-copy__cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;pointer-events:auto;}
  .sw-btn{text-decoration:none;font-weight:600;font-size:.95rem;padding:14px 26px;border-radius:999px;
    transition:transform .2s,box-shadow .2s;display:inline-block;}
  .sw-btn--primary{color:#09090B;background:#FFFFFF;}
  .sw-btn--primary:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(255,255,255,.18);}
  .sw-btn--ghost{color:#FFFFFF;border:1.5px solid rgba(255,255,255,.25);}
  .sw-btn--ghost:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.5);}

  .sw-route{position:fixed;right:clamp(10px,1.8vw,22px);top:50%;z-index:40;transform:translateY(-50%);
    display:flex;flex-direction:column;gap:22px;padding:18px 10px;transition:opacity .4s;}
  .sw-route::before{content:"";position:absolute;left:50%;top:22px;bottom:22px;width:2px;
    transform:translateX(-50%);background:rgba(255,255,255,.25);}
  .sw-route__dot{position:relative;border:0;background:transparent;cursor:pointer;width:14px;height:14px;
    display:grid;place-items:center;padding:0;}
  .sw-route__dot i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.35);
    transition:transform .3s,background .3s,box-shadow .3s;}
  .sw-route__dot:hover i{transform:scale(1.25);background:#fff;}
  .sw-route__dot.is-active i{background:var(--sw-accent);transform:scale(1.4);
    box-shadow:0 0 0 5px color-mix(in srgb,var(--sw-accent) 24%,transparent);}
  .sw-route__dot:focus-visible{outline:2px solid var(--sw-accent);outline-offset:4px;border-radius:50%;}
  .sw-route__label{position:absolute;right:26px;top:50%;transform:translateY(-50%) translateX(6px);
    white-space:nowrap;font-size:.76rem;font-weight:600;color:#fff;background:rgba(0,0,0,.6);
    backdrop-filter:blur(6px);padding:5px 11px;border-radius:999px;opacity:0;pointer-events:none;
    transition:opacity .25s,transform .25s;border:1px solid rgba(255,255,255,.12);}
  .sw-route__dot:hover .sw-route__label,.sw-route__dot.is-active .sw-route__label{opacity:1;transform:translateY(-50%) translateX(0);}

  .sw-hint{position:fixed;left:50%;bottom:26px;z-index:30;transform:translateX(-50%);display:flex;
    flex-direction:column;align-items:center;gap:10px;font-size:.72rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--sw-ink-soft);transition:opacity .3s;}
  .sw-hint i{width:22px;height:34px;border-radius:12px;border:2px solid rgba(255,255,255,.3);position:relative;}
  .sw-hint i::after{content:"";position:absolute;left:50%;top:7px;width:4px;height:7px;border-radius:2px;
    background:var(--sw-accent);transform:translateX(-50%);animation:sw-wheel 1.7s ease-in-out infinite;}
  @keyframes sw-wheel{0%{opacity:0;top:6px}40%{opacity:1}100%{opacity:0;top:17px}}

  .sw-track{position:relative;z-index:1;width:100%;pointer-events:none;}

  /* El mundo terminó: se apaga todo lo fijo para que la landing quede limpia. */
  .sw-root.is-done .sw-sky,.sw-root.is-done .sw-route,.sw-root.is-done .sw-hint{opacity:0;visibility:hidden;}

  /* Franja intermedia: el marco vertical y el copy compiten por el ancho. */
  @media (max-width:1080px){
    .sw-scene__frame{height:min(66vh,520px);right:clamp(18px,4vw,48px);}
    .sw-copy{width:min(46vw,400px);}
    .sw-copy__title{font-size:clamp(1.7rem,3.8vw,2.5rem);}
  }

  @media (max-width:860px){
    /* En celular el film es full-bleed: 9:16 es su formato nativo, no hay recorte. */
    .sw-scene__bg{display:none;}
    .sw-scene__frame{position:absolute;inset:0;top:0;right:0;transform:none;height:100%;width:100%;
      aspect-ratio:auto;border-radius:0;box-shadow:none;}
    .sw-copylayer::before{width:100%;height:64%;top:auto;bottom:0;
      background:linear-gradient(0deg,var(--sw-bg) 6%,color-mix(in srgb,var(--sw-bg) 78%,transparent) 44%,transparent 100%);}
    .sw-copy{left:clamp(18px,5vw,64px);right:clamp(18px,5vw,64px);top:auto;
      bottom:clamp(64px,14vh,120px);transform:none;width:auto;max-width:560px;}
    .sw-copy{bottom:calc(clamp(56px,12dvh,110px) + env(safe-area-inset-bottom));}
    .sw-copy__title{font-size:clamp(1.9rem,7.5vw,2.6rem);}
    .sw-copy__body{max-width:none;font-size:clamp(.96rem,3.6vw,1.06rem);}
    .sw-hint{bottom:calc(18px + env(safe-area-inset-bottom));}
    .sw-route{gap:16px;right:4px;}
    .sw-route__label{display:none;}
  }

  @media (hover:none) and (pointer:coarse){
    .sw-route{padding:14px 6px;}
    .sw-route__dot{width:28px;height:28px;}
    .sw-btn{padding:15px 26px;}
  }
  @media (prefers-reduced-motion:reduce){
    .sw-hint i::after{animation:none;}
    .sw-scene,.sw-copy{transition:none!important;}
  }
  `;
  // En un cascade layer, así los tokens del tema de la página (sin layer) ganan
  // siempre sobre estos defaults, sin importar el orden de inyección.
  const style = document.createElement('style');
  style.id = 'sw-css';
  style.textContent = '@layer sw {\n' + css + '\n}';
  document.head.appendChild(style);
}

if (typeof window !== 'undefined') window.mountScrollWorld = mountScrollWorld;
