#!/bin/bash
# ==========================================
# SINCRONIZAR EL COMMIT ACTUAL CON EL EC2 Y LEVANTAR LA APP
# Pieza interna de ./deploy.sh (que antes hace PR, CI y merge). Úsalo a mano solo
# para casos especiales, como reinstalar nginx. NO toca la base de datos:
# para copiar tu BD local al EC2 (una sola vez) usa scripts/migrate_db_to_ec2.sh
# El certificado SSL se emite aparte, una vez: scripts/setup_ssl.sh
#
# El site de nginx solo se instala si aún no existe, para no borrar el bloque
# HTTPS que añade certbot. Si cambias nginx/trincaunt.conf:
#   FORCE_NGINX=1 ./scripts/sync_to_ec2.sh && ./scripts/setup_ssl.sh
#
# Despliega exactamente el commit actual (HEAD), no la carpeta local: los cambios
# sin commitear y los archivos sin seguimiento no se suben. El servidor queda
# igual que el commit: rsync --delete borra allí lo que ya no está en el repo.
#
# Los secretos (.env) viven solo en el EC2 y no se tocan. Para cambiarlos, edita
# ~/trincaunt/.env en el EC2 y vuelve a desplegar.
# ==========================================
set -e

cd "$(dirname "$0")/.."
source scripts/ec2_config.sh

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Hay cambios sin commitear o archivos sin seguimiento: NO se despliegan."
  echo "   Se despliega solo el commit $(git log -1 --format='%h %s')."
fi

EXPORT_DIR=$(mktemp -d)
trap 'rm -rf "${EXPORT_DIR:?}"' EXIT
git archive HEAD | tar -x -C "$EXPORT_DIR"

echo "📦 [1/2] Sincronizando el commit $(git rev-parse --short HEAD) con el EC2..."
$SSH_CMD $EC2_USER@$EC2_HOST "mkdir -p $TARGET_DIR"

# --delete deja el servidor igual que el commit. Los --exclude protegen lo que
# solo existe en el EC2 (secretos, dependencias, builds y copias de seguridad):
# rsync no borra en destino lo que coincide con un exclude.
rsync -avz --delete -e "$SSH_CMD" \
  --exclude '.env' --exclude '.env.local' --exclude '.env.*.local' \
  --exclude 'node_modules' --exclude 'client/dist' --exclude 'api/dist' --exclude '.git' \
  --exclude '/temp' --exclude '/mongodb_backups' --exclude '/backups' \
  "$EXPORT_DIR/" $EC2_USER@$EC2_HOST:$TARGET_DIR/

echo "☁️  [2/2] Conectando al EC2 para levantar la app..."
$SSH_CMD $EC2_USER@$EC2_HOST "FORCE_NGINX=${FORCE_NGINX:-0} bash -s" << 'SSH_EOF'
  set -e
  cd trincaunt

  if [ ! -f .env ]; then
    echo "❌ Falta ~/trincaunt/.env en el EC2. Créalo allí a partir de .env.example. Abortando."
    exit 1
  fi

  echo "=> Levantando aplicación con Docker Compose..."
  docker compose up -d --build

  if [ ! -f /etc/nginx/sites-available/trincaunt ] || [ "$FORCE_NGINX" = "1" ]; then
    echo "=> Instalando site de NGINX de Trincaunt (sin tocar las otras apps)..."
    sudo cp nginx/trincaunt.conf /etc/nginx/sites-available/trincaunt
    sudo ln -sf /etc/nginx/sites-available/trincaunt /etc/nginx/sites-enabled/trincaunt
    sudo nginx -t && sudo systemctl reload nginx
    echo "   (Si ya tenías HTTPS, vuelve a ejecutar ./scripts/setup_ssl.sh)"
  else
    echo "=> Site de NGINX ya instalado; no se toca (FORCE_NGINX=1 para reinstalarlo)."
  fi

  echo "✅ ¡Todo listo! La aplicación Trincaunt está corriendo en la nube."
SSH_EOF
