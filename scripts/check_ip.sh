#!/bin/bash

# ==============================================================================
# Script para comprobar cambio de IP pública
# ==============================================================================

# Archivo donde guardaremos la última IP conocida
IP_FILE="$HOME/.ultima_ip_conocida"

# Obtener la IP pública actual usando ipify (es muy rápido y estable)
CURRENT_IP=$(curl -s https://api.ipify.org)

# Validar que hemos obtenido una IP (para evitar falsos positivos si no hay internet)
if [[ ! $CURRENT_IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # No se pudo obtener una IP válida (quizás el router está reiniciando y no hay red)
    exit 1
fi

# Si el archivo no existe, lo creamos con la IP actual
if [ ! -f "$IP_FILE" ]; then
    echo "$CURRENT_IP" > "$IP_FILE"
    exit 0
fi

# Leer la última IP registrada
LAST_IP=$(cat "$IP_FILE")

# Comparar las IPs
if [ "$CURRENT_IP" != "$LAST_IP" ]; then
    # La IP ha cambiado
    ASUNTO="[Trincaunt-Server] Cambio de IP detectado"
    MENSAJE="El router de O2 ha cambiado de IP.\n\nAntigua IP: $LAST_IP\nNueva IP: $CURRENT_IP\n\nUsa esta nueva IP para conectarte por SSH."

    # ==========================================================================
    # AQUI DEBES INYECTAR TU SCRIPT DE GMAIL
    # Reemplaza la siguiente línea con la forma en la que llamas a tu script
    # Ejemplo: /home/tuusuario/scripts/enviar_gmail.sh "$ASUNTO" "$MENSAJE"
    # ==========================================================================
    
    echo -e "$MENSAJE" | mail -s "$ASUNTO" tu_correo@gmail.com # Reemplaza por tu comando real
    
    # Actualizar el archivo con la nueva IP para que no envíe correos repetidos
    echo "$CURRENT_IP" > "$IP_FILE"
fi
