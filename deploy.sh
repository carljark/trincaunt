#!/bin/bash
# ==========================================
# SCRIPT DE DESPLIEGUE A EC2 (Desde Castellón)
# Sincroniza el código y levanta la app. NO toca la base de datos:
# para copiar tu BD local al EC2 (una sola vez) usa scripts/migrate_db_to_ec2.sh
# ==========================================
set -e

source "$(dirname "$0")/scripts/ec2_config.sh"

echo "📦 [1/3] Sincronizando código fuente con el EC2..."
$SSH_CMD $EC2_USER@$EC2_HOST "mkdir -p $TARGET_DIR"

# Rsync usando la misma clave PEM
rsync -avz -e "$SSH_CMD" --exclude 'node_modules' --exclude 'client/dist' --exclude 'api/dist' --exclude '.git' --exclude '.env' ./ $EC2_USER@$EC2_HOST:$TARGET_DIR/

echo "☁️  [2/3] Conectando al EC2 para levantar la app..."
$SSH_CMD $EC2_USER@$EC2_HOST << 'SSH_EOF'
  set -e
  cd trincaunt

  if [ ! -f .env ]; then
    echo "❌ Falta ~/trincaunt/.env en el EC2 (ver .env.example). Abortando."
    exit 1
  fi

  echo "=> Levantando aplicación con Docker Compose..."
  docker compose up -d --build

  echo "=> Instalando site de NGINX de Trincaunt (sin tocar las otras apps)..."
  sudo cp nginx/trincaunt.conf /etc/nginx/sites-available/trincaunt
  sudo ln -sf /etc/nginx/sites-available/trincaunt /etc/nginx/sites-enabled/trincaunt
  sudo nginx -t && sudo systemctl reload nginx

  echo "✅ ¡Todo listo! La aplicación Trincaunt está corriendo en la nube."
SSH_EOF

echo "🔒 [3/3] Solicitando e instalando certificado SSL con Certbot..."
$SSH_CMD $EC2_USER@$EC2_HOST << 'SSH_EOF2'
  sudo certbot --nginx -d trincaunt.ddns.net --non-interactive --agree-tos --register-unsafely-without-email --redirect
SSH_EOF2
echo "✅ ¡Certificado SSL instalado!"
