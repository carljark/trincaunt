#!/bin/bash
# ==========================================
# SCRIPT DE DESPLIEGUE A EC2 (Desde Castellón)
# Sincroniza el código y levanta la app. NO toca la base de datos:
# para copiar tu BD local al EC2 (una sola vez) usa scripts/migrate_db_to_ec2.sh
# El certificado SSL se emite aparte, una vez: scripts/setup_ssl.sh
#
# El site de nginx solo se instala si aún no existe, para no borrar el bloque
# HTTPS que añade certbot. Si cambias nginx/trincaunt.conf:
#   FORCE_NGINX=1 ./deploy.sh && ./scripts/setup_ssl.sh
# ==========================================
set -e

source "$(dirname "$0")/scripts/ec2_config.sh"

if [ ! -f .env ]; then
  echo "❌ Falta .env en la raíz del repo (copia .env.example y rellénalo). Abortando."
  exit 1
fi

echo "📦 [1/2] Sincronizando código fuente con el EC2..."
$SSH_CMD $EC2_USER@$EC2_HOST "mkdir -p $TARGET_DIR"

# Rsync usando la misma clave PEM. Sí sincroniza los .env (no están en git):
# el .env de la raíz es el que lee docker compose en el EC2.
rsync -avz -e "$SSH_CMD" --exclude 'node_modules' --exclude 'client/dist' --exclude 'api/dist' --exclude '.git' --exclude '/temp' --exclude '/mongodb_backups' --exclude '/.playwright-mcp' ./ $EC2_USER@$EC2_HOST:$TARGET_DIR/

echo "☁️  [2/2] Conectando al EC2 para levantar la app..."
$SSH_CMD $EC2_USER@$EC2_HOST "FORCE_NGINX=${FORCE_NGINX:-0} bash -s" << 'SSH_EOF'
  set -e
  cd trincaunt

  if [ ! -f .env ]; then
    echo "❌ Falta .env en la raíz del repo local (ver .env.example); rsync no lo ha subido. Abortando."
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
