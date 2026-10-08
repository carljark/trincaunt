#!/bin/bash
# ==========================================
# SCRIPT DE DESPLIEGUE A EC2 (desde Castellón o el Mac)
# Sincroniza el código y levanta la app. NO toca la base de datos:
# para copiar tu BD local al EC2 (una sola vez) usa scripts/migrate_db_to_ec2.sh
# El certificado SSL se emite aparte, una vez: scripts/setup_ssl.sh
#
# El site de nginx solo se instala si aún no existe, para no borrar el bloque
# HTTPS que añade certbot. Si cambias nginx/trincaunt.conf:
#   FORCE_NGINX=1 ./deploy.sh && ./scripts/setup_ssl.sh
#
# Los secretos (.env) viven solo en el EC2: rsync no sube ningún .env local.
# Para cambiarlos, edita ~/trincaunt/.env en el EC2 y vuelve a desplegar.
# ==========================================
set -e

source "$(dirname "$0")/scripts/ec2_config.sh"

echo "📦 [1/2] Sincronizando código fuente con el EC2..."
$SSH_CMD $EC2_USER@$EC2_HOST "mkdir -p $TARGET_DIR"

# Rsync usando la misma clave PEM. Excluye los .env con secretos (no están en git)
# para no pisar los del EC2; los .env.* versionados (client/.env.production) sí se suben.
rsync -avz -e "$SSH_CMD" --exclude '.env' --exclude '.env.local' --exclude '.env.*.local' --exclude 'node_modules' --exclude 'client/dist' --exclude 'api/dist' --exclude '.git' --exclude '/temp' --exclude '/mongodb_backups' --exclude '/.playwright-mcp' ./ $EC2_USER@$EC2_HOST:$TARGET_DIR/

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
