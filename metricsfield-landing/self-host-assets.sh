#!/bin/bash
# Baja los logos y las fotos de producto que hoy se sirven desde Vercel Blob y
# reescribe el HTML para que apunten a assets/img/.
#
# Correlo desde tu máquina: el entorno donde se armó la landing tiene bloqueado
# el host de Blob por política de red, así que las URLs quedaron externas.
#
#   bash self-host-assets.sh
set -euo pipefail

cd "$(dirname "$0")"
IMG=assets/img
B=https://hebbkx1anhila5yf.public.blob.vercel-storage.com
mkdir -p "$IMG"

# nombre_local|url
# Prefijo blob- a propósito: hw-standee.webp y hw-tarjeta.webp ya existen y son
# los frames de los videos de demo que actúan como fallback. No se pisan.
FILES="
blob-logo-dark.png|$B/MetFi-Logo-FondoNegro-VXninT2kgNlqkeXES1iroVUxvUhSVp.png
blob-logo-light.png|$B/MetFi-Logo-FondoBlanco-XWd9MHo0CD83dVEdIyPqq02CVIwqLd.png
blob-hw-standee.png|$B/Gemini_Generated_Image_d65d70d65d70d65d-Zp3KAm3pKXnfc1r1vchpCNeb8En0Qz.png
blob-hw-tarjeta.png|$B/Gemini_Generated_Image_c44kvoc44kvoc44k-jXqjmTG3Gy6FnLoZLs2tP2yj88yOO5.png
blob-hw-sticker.png|$B/Sticker%20NFC-ukzsfesKOp3vKLxWDaUK4cmVYbkGbt.png
"

for row in $FILES; do
  name="${row%%|*}"; url="${row#*|}"
  echo "bajando $name"
  curl -fsSL --retry 3 -o "$IMG/$name" "$url"
  # Si hay cwebp a mano, se sirve webp (bastante más liviano).
  if command -v cwebp >/dev/null 2>&1; then
    cwebp -quiet -q 86 "$IMG/$name" -o "$IMG/${name%.png}.webp" && name="${name%.png}.webp"
  fi
  # Reescribe la URL absoluta por la ruta local.
  sed -i.bak "s#$url#$IMG/$name#g" index.html && rm -f index.html.bak
done

echo
echo "Listo. Verificá que no queden URLs de Blob:"
grep -c "blob.vercel-storage.com" index.html || echo "  0 — todas locales"
