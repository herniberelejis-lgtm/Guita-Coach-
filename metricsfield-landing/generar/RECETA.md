# Generar el beat de apertura del hero (Higgsfield)

Este entorno no puede subir ni bajar archivos de Higgsfield (la política de red
bloquea `upload.higgsfield.ai` y el CDN de resultados). Corré esto vos desde la
web de Higgsfield y mandame el `.mp4`; lo encadeno sin gastar créditos.

## Los dos frames

| Archivo | Qué es | Va en |
|---|---|---|
| `A-start.png` | Entrada al local, plano de la vereda | **start image** |
| `B-end.png` | Primer frame exacto de `assets/vid/local.mp4` | **end image** |

`B-end.png` es lo que hace que la costura sea invisible: el clip generado
termina en el mismo píxel donde arranca el hero actual. **No lo cambies por otra
imagen parecida** — ahí es donde se rompe el efecto.

## Parámetros

```
modelo     seedance_2_0        (o seedance_2_0_mini si querés gastar ~1/4)
mode       std
resolution 1080p
aspect     9:16                ← vertical, igual que el resto del material
duration   5
start      A-start.png
end        B-end.png
sonido     off
```

## Prompt

```
Single continuous cinematic camera move, no cuts. Glide slowly forward through
the entrance of a warm modern restaurant at dusk, past the host stand, and
continue drifting forward toward a set table by the window where a woman is
seated. Handheld documentary feel, shallow depth of field, warm practical
lighting, no text, no logos. The shot ends settling into a slow steady forward
drift, matching the final framing exactly.
```

La última frase es la que importa: obliga a que el movimiento llegue en la misma
dirección y velocidad que trae el hero. Sin eso la costura se lee como un tirón
aunque los frames coincidan.

## Cuándo re-rollear

Mirá el último frame del clip generado. Si no se parece a `B-end.png` o si la
cámara está retrocediendo, re-rolleá antes de darlo por bueno. Suele salir en el
2º o 3er intento.

## Después

Mandame el `.mp4` como archivo adjunto. Yo hago el encode (crf 20, GOP 8,
variante mobile), extraigo el poster y lo enchufo como beat 0 en `app.js`.
Costo en créditos de mi lado: cero.
