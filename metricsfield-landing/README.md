# Landing MetricsField

Landing de una sola página con dos actos:

1. **El mundo scrolleado** — un vuelo cinematográfico donde el scroll maneja el
   tiempo del video (no dispara animaciones: scrubbea el film cuadro por cuadro).
   Cuatro beats cortados de un mismo film en los cortes reales de su montaje, así
   las costuras son frame-idénticas por construcción.
2. **El mecanismo** — los seis pasos reales de un tap, con la línea dibujándose
   con el scroll.
3. **El portal navegable** — el portal de cliente reconstruido y funcionando
   dentro de la página: se hace clic en el menú y se recorren las ocho secciones.
4. **La página de venta** — hardware, demos pinneados, simulador ROI,
   comparativa, planes, FAQ y CTA.

Construida aplicando la skill [`scroll-world`](https://github.com/) sobre material
propio, sin generación por IA. Ver `ENTREGA.html` para el detalle completo.

## Correr local

```bash
python3 -m http.server 8000
```

Y abrir <http://localhost:8000>. Es estático: no necesita build ni dependencias.

## Antes de publicar

Los logos y las fotos de producto todavía apuntan a Vercel Blob. Para bajarlos
y servirlos desde el mismo dominio:

```bash
bash self-host-assets.sh
```

## Estructura

| Archivo | Qué tiene |
|---|---|
| `index.html` | Estructura y todo el contenido estático (precios, planes, FAQ, comparativa) |
| `assets/app.js` | Copy y ritmo de los beats + interacciones de la página |
| `assets/panel.js` | El portal de cliente recreado: datos, vistas y navegación |
| `assets/scroll-world.js` | El motor de scrub (blob-seek, coalescing, priming iOS, reduced-motion) |
| `assets/styles.css` | Tokens de color arriba, resto por sección |
| `assets/vid/` | Beats del film y demos — `.mp4` desktop y `-m.mp4` mobile (GOP más corto) |
| `assets/img/` | Posters de cada beat, fotos de producto de respaldo y capturas viejas del panel |
| `assets/fonts/` | Montserrat self-hosteada (subset latin) |
| `build-preview.py` | Arma la vista previa autocontenida de un solo archivo |

## Deploy

Carpeta estática independiente. El `vercel.json` de la raíz del repo es de Guita
Coach y rutea todo a `api/index.py`; desplegá esta landing como proyecto aparte
apuntando el root a `metricsfield-landing/`.
