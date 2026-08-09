#!/usr/bin/env python3
"""Arma una vista previa autocontenida de la landing: un solo archivo con el
video, las imágenes y la tipografía embebidos como data URIs.

Existe porque el visor de artifacts bloquea cualquier host externo, así que la
página tiene que traer todo consigo. Usa encodes de video más livianos: es una
vista previa para probar el scrub en un celular, no el build de producción.
"""
import base64, pathlib, re, sys

ROOT = pathlib.Path('/home/user/Guita-Coach-/metricsfield-landing')
PREV = pathlib.Path('/tmp/prev')            # encodes livianos
OUT  = pathlib.Path('/tmp/claude-0/-home-user-Guita-Coach-/dbfebce5-6281-59c3-b1e5-7e0c752102f7/scratchpad/metricsfield-preview.html')

def data_uri(path: pathlib.Path, mime: str) -> str:
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()

def js_ascii(s: str) -> str:
    """Escapa todo lo que no sea ASCII como \\uXXXX.

    El visor envuelve el contenido en su propio <head>, así que el
    <meta charset> del archivo original se pierde y no hay forma de garantizar
    con qué encoding se va a leer. Un archivo ASCII puro no depende de eso:
    las eñes y los acentos llegan bien se decodifique como se decodifique.
    """
    out = []
    for ch in s:
        if ord(ch) < 128:
            out.append(ch)
        else:
            enc = ch.encode('utf-16-be')          # los astrales salen como par suplente
            for i in range(0, len(enc), 2):
                out.append('\\u%04x' % ((enc[i] << 8) | enc[i + 1]))
    return ''.join(out)

html = (ROOT / 'index.html').read_text()
css  = (ROOT / 'assets/styles.css').read_text()
eng  = (ROOT / 'assets/scroll-world.js').read_text()
app  = (ROOT / 'assets/app.js').read_text()
panel = (ROOT / 'assets/panel.js').read_text()

# ---- tipografía embebida ----
for f in sorted((ROOT / 'assets/fonts').glob('*.woff2')):
    css = css.replace(f'url(fonts/{f.name})', f'url({data_uri(f, "font/woff2")})')
assert 'url(fonts/' not in css, 'quedó una fuente sin embeber'

# ---- video e imágenes en el JS de la app ----
# Una sola copia por clip: en la vista previa clip y clipMobile serían el mismo
# archivo y duplicar el base64 no aporta nada.
app = re.sub(r",\s*clipMobile: '[^']+'", '', app)
for beat in ('local', 'gesto', 'dato', 'panel'):
    app = app.replace(f"'assets/vid/{beat}.mp4'", f"'{data_uri(PREV / f'{beat}.mp4', 'video/mp4')}'")
    app = app.replace(f"'assets/img/beat-{beat}.webp'",
                      f"'{data_uri(ROOT / f'assets/img/beat-{beat}.webp', 'image/webp')}'")

# ---- lo que vive en Vercel Blob y el visor no puede pedir ----
# Va primero: estas etiquetas apuntan a un archivo local por data-fallback, y
# hay que resolverlo mientras todavía es una ruta y no un data URI.
# Standee y tarjeta tienen un frame del video de demo; el logo cae al wordmark
# de texto que ya está en el markup. Para el sticker no hay foto: se saca la
# etiqueta y queda el degradé del contenedor, que es una superficie intencional
# y no una imagen rota.
html = re.sub(
    r'<img src="https://hebbkx1anhila5yf[^"]*"[^>]*data-fallback="([^"]+)"[^>]*>',
    lambda m: f'<img src="{data_uri(ROOT / m.group(1), "image/webp")}" alt="" loading="lazy">',
    html)
html = re.sub(r'<img src="https://hebbkx1anhila5yf[^"]*"[^>]*>', '', html)
assert 'hebbkx1anhila5yf' not in html, 'quedó una URL de Blob en el HTML'

# ---- imágenes en el HTML ----
for img in sorted((ROOT / 'assets/img').glob('*.webp')):
    html = html.replace(f'"assets/img/{img.name}"', f'"{data_uri(img, "image/webp")}"')

# ---- videos de demo ----
html = re.sub(r'\s*data-src-mobile="[^"]+"', '', html)
for d in ('standee', 'tarjeta'):
    html = html.replace(f'data-src="assets/vid/demo-{d}.mp4"',
                        f'data-src="{data_uri(PREV / f"demo-{d}.mp4", "video/mp4")}"')

# ---- cascarón: el visor envuelve el contenido en su propio doctype/head/body ----
html = html.split('<body>', 1)[1].rsplit('</body>', 1)[0]
html = re.sub(r'<script src="[^"]+"></script>', '', html)

# Los comentarios del CSS están en castellano y CSS no tiene escapes cómodos
# para eso. En la vista previa no aportan nada, así que se van.
# (El base64 de las fuentes no puede contener "*", así que la regex es segura.)
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
assert not [c for c in css if ord(c) > 127], 'quedaron caracteres no ASCII en el CSS'

out = (
    '<title>MetricsField &#8212; vista previa</title>\n'
    f'<style>{css}</style>\n'
    f'{html.encode("ascii", "xmlcharrefreplace").decode()}\n'
    f'<script>{js_ascii(eng)}</script>\n'
    f'<script>{js_ascii(app)}</script>\n'
    f'<script>{js_ascii(panel)}</script>\n'
)
assert not [c for c in out if ord(c) > 127], 'quedó algo fuera de ASCII'
OUT.write_text(out, encoding='ascii')
mb = len(out.encode()) / 1024 / 1024
print(f'{OUT}  ->  {mb:.2f} MB, ASCII puro')
if mb > 15:
    sys.exit(f'demasiado grande: {mb:.2f} MB (el tope del visor son 16)')
