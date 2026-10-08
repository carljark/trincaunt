#!/bin/bash

# ==============================================================================
# Script de Backup Local para MongoDB (Trincaunt)
# ==============================================================================
# Este script crea un volcado comprimido de la base de datos "trincaunt"
# alojada en el contenedor "mongo44" usando mongodump con salida directa.
# No ensucia el contenedor con archivos temporales.

CONTAINER_NAME="mongo44"
DB_NAME="trincaunt"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="trincaunt_backup_${TIMESTAMP}.archive.gz"
BACKUP_DIR="${HOME}/trincaunt_backups"

# Crear el directorio de backups local en el servidor si no existe
mkdir -p "$BACKUP_DIR"

echo "==================================================================="
echo "Iniciando backup de la base de datos: $DB_NAME"
echo "Contenedor: $CONTAINER_NAME"
echo "Destino: $BACKUP_DIR/$BACKUP_FILE"
echo "==================================================================="

# Ejecutamos mongodump indicando que escupa el archivo comprimido por stdout,
# y lo redirigimos directamente a un archivo en nuestro disco duro local.
docker exec "$CONTAINER_NAME" mongodump --db "$DB_NAME" --archive --gzip > "$BACKUP_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup completado con éxito."
    echo "📁 Archivo guardado en: $BACKUP_DIR/$BACKUP_FILE"
    echo "⚖️  Tamaño: $(du -sh "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)"
    echo "==================================================================="
    echo "Para descargar este archivo a tu Mac, usa este comando desde tu Mac:"
    echo "scp tu_usuario@IP_DE_CASTELLON:$BACKUP_DIR/$BACKUP_FILE ."
    echo "==================================================================="
else
    echo "❌ Error: El proceso de backup ha fallado."
    # Borrar el archivo parcial si falló
    rm -f "$BACKUP_DIR/$BACKUP_FILE"
    exit 1
fi
