#!/bin/bash

# ==============================================================================
# Script para Restaurar Backup de MongoDB en Contenedor Local
# ==============================================================================
# Este script toma un archivo comprimido generado por mongodump (--archive --gzip)
# y lo restaura en el contenedor local de Docker (por defecto "mongodev").

CONTAINER_NAME="mongodev"

# Verificar que se ha pasado el archivo como argumento
if [ -z "$1" ]; then
  echo "❌ Error: Debes proporcionar la ruta al archivo de backup."
  echo "Uso: $0 ruta/al/archivo.archive.gz"
  exit 1
fi

BACKUP_FILE="$1"

# Verificar que el archivo existe
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: El archivo '$BACKUP_FILE' no existe."
  exit 1
fi

echo "==================================================================="
echo "Iniciando restauración de base de datos..."
echo "Contenedor de destino: $CONTAINER_NAME"
echo "Archivo de origen: $BACKUP_FILE"
echo "⚠️  Atención: Las colecciones existentes se sobreescribirán (--drop)."
echo "==================================================================="

# Restaurar inyectando el archivo local directamente al stdin del contenedor
docker exec -i "$CONTAINER_NAME" mongorestore --drop --archive --gzip < "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "==================================================================="
    echo "✅ Restauración completada con éxito."
else
    echo "==================================================================="
    echo "❌ Error: Hubo un problema durante la restauración."
    exit 1
fi
