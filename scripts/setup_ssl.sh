#!/bin/bash
# ==========================================
# EMISIÓN DEL CERTIFICADO SSL (Let's Encrypt) EN EL EC2
# Ejecútalo una vez, cuando el DNS de $DOMAIN ya apunte al EC2 y tras ./deploy.sh.
# Certbot añade el bloque HTTPS al site de nginx y deja programada la renovación
# automática (timer de systemd), así que no hace falta repetirlo salvo que
# reinstales el site con FORCE_NGINX=1.
# ==========================================
set -euo pipefail

source "$(dirname "$0")/ec2_config.sh"

echo "🔍 [1/2] Comprobando que $DOMAIN apunta al EC2 ($EC2_HOST)..."
RESOLVED_IP=$($SSH_CMD $EC2_USER@$EC2_HOST "getent ahostsv4 $DOMAIN | awk 'NR==1{print \$1}'")
if [ "$RESOLVED_IP" != "$EC2_HOST" ]; then
  echo "❌ $DOMAIN resuelve a '${RESOLVED_IP:-nada}', no a $EC2_HOST."
  echo "   Cambia el DNS y espera a que se propague antes de pedir el certificado."
  exit 1
fi

echo "🔒 [2/2] Solicitando e instalando certificado SSL con Certbot..."
$SSH_CMD $EC2_USER@$EC2_HOST \
  "sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email --redirect"

echo "✅ ¡Certificado SSL instalado! https://$DOMAIN"
