#!/bin/bash

# ==============================================================================
# Script de Backup Local para MongoDB (Trincaunt) con Envío por Email
# ==============================================================================
# Este script crea un volcado comprimido de la base de datos "trincaunt"
# alojada en el contenedor "mongo44" usando mongodump con salida directa.
# Al finalizar con éxito, envía el archivo adjunto por correo electrónico.

CONTAINER_NAME="mongo44"
DB_NAME="trincaunt"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="trincaunt_backup_${TIMESTAMP}.archive.gz"
BACKUP_DIR="${HOME}/trincaunt_backups"

# Configuración de email
EMAIL_DESTINO="elcal.lico@gmail.com"
SCRIPT_EMAIL="/home/godoy/bin/enviar_email.sh"

# Crear el directorio de backups local en el servidor si no existe
mkdir -p "$BACKUP_DIR"

echo "==================================================================="
echo "Iniciando backup de la base de datos: $DB_NAME"
echo "Contenedor: $CONTAINER_NAME"
echo "Destino local: $BACKUP_DIR/$BACKUP_FILE"
echo "==================================================================="

# Ejecutamos mongodump indicando que escupa el archivo comprimido por stdout,
# y lo redirigimos directamente a un archivo en nuestro disco duro local.
docker exec "$CONTAINER_NAME" mongodump --db "$DB_NAME" --archive --gzip > "$BACKUP_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup completado con éxito."
    echo "📁 Archivo guardado localmente en: $BACKUP_DIR/$BACKUP_FILE"
    
    TAMANO=$(du -sh "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo "⚖️  Tamaño: $TAMANO"
    
    # Enviar el email
    if [ -f "$SCRIPT_EMAIL" ]; then
        echo "📧 Enviando copia de seguridad por email a $EMAIL_DESTINO..."
        ASUNTO="[Trincaunt] Backup Automático $TIMESTAMP"
        CUERPO="Adjunto copia de seguridad de la base de datos Trincaunt.\n\nTamaño del archivo: $TAMANO"
        
        "$SCRIPT_EMAIL" "$ASUNTO" "$CUERPO" "$EMAIL_DESTINO" "$BACKUP_DIR/$BACKUP_FILE"
        
        if [ $? -eq 0 ]; then
            echo "✅ Email enviado correctamente."
        else
            echo "❌ Error al enviar el email."
        fi
    else
        echo "⚠️  Aviso: No se encontró el script $SCRIPT_EMAIL para enviar el correo."
    fi
    echo "==================================================================="
else
    echo "❌ Error: El proceso de backup ha fallado."
    # Borrar el archivo parcial si falló
    rm -f "$BACKUP_DIR/$BACKUP_FILE"
    exit 1
fi
