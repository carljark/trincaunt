#!/bin/bash
# ==========================================
# LEVANTAR LA APP EN EL EC2. Se ejecuta EN EL SERVIDOR, después de copiar el commit a ~/trincaunt.
# Lo usan el workflow de GitHub Actions (.github/workflows/deploy.yml) y el despliegue manual
# (scripts/sync_to_ec2.sh, vía ./deploy.sh --local).
#
#   PULL_REF=ghcr.io/carljark/trincaunt:sha-<commit> bash scripts/remote_up.sh
#       descarga esa imagen de GHCR (solo las capas nuevas) y la usa
#   bash scripts/remote_up.sh
#       usa la imagen que ya hay en el EC2 (la que acaba de cargar `docker load`)
#   FORCE_NGINX=1 ...   reinstala el site de nginx (luego hay que repetir scripts/setup_ssl.sh)
# ==========================================
set -euo pipefail
cd "$(dirname "$0")/.."

# El mismo nombre que `image:` en docker-compose.yml
APP_IMAGE=ghcr.io/carljark/trincaunt

if [ ! -f .env ]; then
  echo "❌ Falta ~/trincaunt/.env en el EC2. Créalo allí a partir de .env.example. Abortando."
  exit 1
fi

if [ -n "${PULL_REF:-}" ]; then
  echo "=> Descargando $PULL_REF..."
  docker pull "$PULL_REF"
  docker tag "$PULL_REF" "$APP_IMAGE:latest"
fi

echo "=> Levantando aplicación con Docker Compose..."
docker compose up -d --no-build

# Limpieza: las etiquetas sha-* de versiones anteriores, el nombre antiguo de la imagen
# (antes de GHCR) y las imágenes sin etiqueta de esta app (LABEL del Dockerfile).
# Volver atrás no las necesita: GHCR guarda todas las versiones.
KEEP="${PULL_REF##*:}"
docker image ls "$APP_IMAGE" --format '{{.Tag}}' \
  | { grep -v -x -e latest -e "${KEEP:-latest}" || true; } \
  | sed "s#^#$APP_IMAGE:#" | xargs -r docker rmi >/dev/null || true
docker image rm trincaunt-app:latest >/dev/null 2>&1 || true
docker image prune -f --filter label=app=trincaunt >/dev/null

if [ ! -f /etc/nginx/sites-available/trincaunt ] || [ "${FORCE_NGINX:-0}" = "1" ]; then
  echo "=> Instalando site de NGINX de Trincaunt (sin tocar las otras apps)..."
  sudo cp nginx/trincaunt.conf /etc/nginx/sites-available/trincaunt
  sudo ln -sf /etc/nginx/sites-available/trincaunt /etc/nginx/sites-enabled/trincaunt
  sudo nginx -t && sudo systemctl reload nginx
  echo "   (Si ya tenías HTTPS, vuelve a ejecutar ./scripts/setup_ssl.sh)"
else
  echo "=> Site de NGINX ya instalado; no se toca (FORCE_NGINX=1 para reinstalarlo)."
fi

echo "✅ ¡Todo listo! La aplicación Trincaunt está corriendo en la nube."
