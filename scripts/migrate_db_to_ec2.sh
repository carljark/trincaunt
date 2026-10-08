#!/bin/bash
# ==========================================
# MIGRACIÓN ÚNICA DE LA BD LOCAL AL EC2
# Hace mongodump de tu Mongo local y REEMPLAZA (mongorestore --drop) la BD
# `trincaunt` del contenedor trincaunt-mongo en el EC2.
# Ejecútalo UNA sola vez, tras el primer ./deploy.sh y EN LA MÁQUINA QUE TIENE LOS
# DATOS (Castellón), no en el Mac de desarrollo. Si lo repites, perderás todo lo
# creado en producción desde entonces. Otra BD de origen: SOURCE_MONGO_URI=...
# ==========================================
set -euo pipefail

source "$(dirname "$0")/ec2_config.sh"

DUMP_FILE="$(mktemp -t trincaunt_dump.XXXXXX)"
REMOTE_DUMP="/tmp/trincaunt_dump.gz"
trap 'rm -f "$DUMP_FILE"' EXIT

echo "⚠️  Esto REEMPLAZARÁ la base de datos 'trincaunt' del EC2 ($EC2_HOST) con tu BD local."
read -r -p "Escribe 'si' para continuar: " CONFIRM
[ "$CONFIRM" = "si" ] || { echo "Cancelado."; exit 1; }

echo "🔍 [1/4] Comprobando que trincaunt-mongo está en marcha en el EC2..."
$SSH_CMD $EC2_USER@$EC2_HOST "docker ps --format '{{.Names}}' | grep -qx trincaunt-mongo" \
  || { echo "❌ trincaunt-mongo no está corriendo. Ejecuta primero ./deploy.sh"; exit 1; }

echo "💾 [2/4] Copia de seguridad local de MongoDB..."
mongodump --uri="${SOURCE_MONGO_URI:-mongodb://localhost:27017/trincaunt}" --archive="$DUMP_FILE" --gzip

echo "📤 [3/4] Subiendo el dump al EC2..."
scp -i "$SSH_KEY" "$DUMP_FILE" "$EC2_USER@$EC2_HOST:$REMOTE_DUMP"

echo "♻️  [4/4] Restaurando dentro del contenedor (--drop)..."
$SSH_CMD $EC2_USER@$EC2_HOST \
  "docker exec -i trincaunt-mongo mongorestore --archive --gzip --drop < $REMOTE_DUMP; rm -f $REMOTE_DUMP"

echo "✅ Migración completada."
