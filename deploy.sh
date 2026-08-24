#!/bin/bash
# ==========================================
# SCRIPT DE DESPLIEGUE A EC2 (Desde Castellón)
# ==========================================

EC2_USER="ubuntu"
EC2_HOST="51.92.83.113"
SSH_KEY="$HOME/job/profesion/UJI/co2univ/co2unuv-key.pem"
TARGET_DIR="/home/$EC2_USER/trincaunt"

# Opciones SSH genéricas para reutilizar
SSH_CMD="ssh -i $SSH_KEY"

echo "🚀 [1/4] Realizando copia de seguridad local de MongoDB..."
mongodump --uri="mongodb://localhost:27017/trincaunt" --archive=trincaunt_backup.gz --gzip

echo "📦 [2/4] Sincronizando código fuente y backup con el EC2..."
$SSH_CMD $EC2_USER@$EC2_HOST "mkdir -p $TARGET_DIR"

# Rsync usando la misma clave PEM
rsync -avz -e "$SSH_CMD" --exclude 'node_modules' --exclude 'client/dist' --exclude 'api/dist' --exclude '.git' --exclude '.env' ./ $EC2_USER@$EC2_HOST:$TARGET_DIR/

echo "☁️  [3/4] Conectando al EC2 para levantar la app y restaurar datos..."
$SSH_CMD $EC2_USER@$EC2_HOST << 'SSH_EOF'
  cd trincaunt
  
  echo "=> Levantando aplicación con Docker Compose..."
  docker compose up -d --build

  echo "=> Esperando 10 segundos a que MongoDB arranque..."
  sleep 10

  echo "=> Restaurando backup de la BD dentro del contenedor..."
  docker exec -i trincaunt-mongo mongorestore --archive --gzip --drop < trincaunt_backup.gz

  echo "=> Copiando configuración de NGINX..."
  sudo cp nginx_default.conf /etc/nginx/sites-available/default
  sudo nginx -t && sudo systemctl reload nginx
  
  echo "✅ ¡Todo listo! La aplicación Trincaunt está corriendo en la nube."
SSH_EOF

echo "🔒 Solicitando e instalando certificado SSL con Certbot..."
$SSH_CMD $EC2_USER@$EC2_HOST << 'SSH_EOF2'
  sudo certbot --nginx -d trincaunt.ddns.net --non-interactive --agree-tos --register-unsafely-without-email --redirect
SSH_EOF2
echo "✅ ¡Certificado SSL instalado!"
