#!/bin/bash
# Configuración común de conexión al EC2. Se carga con `source` desde deploy.sh
# y los scripts de scripts/ (migrate_db_to_ec2.sh, setup_ssl.sh).

# Cada valor se puede sobrescribir por entorno, p. ej.:
#   SSH_KEY=~/.ssh/id_ed25519 ./deploy.sh
EC2_USER="${EC2_USER:-ubuntu}"
EC2_HOST="${EC2_HOST:-51.92.83.118}"
TARGET_DIR="/home/$EC2_USER/trincaunt"

# Clave PEM: si no se pasa SSH_KEY, se usa la primera ruta que exista.
# Para otra máquina, añade aquí su ruta.
SSH_KEY_CANDIDATES=(
  "$HOME/job/profesion/UJI/co2univ/co2univ-key.pem"  # Castellón
  "$HOME/UJI/co2univ/co2univ-key.pem"                # Mac
)
if [ -z "$SSH_KEY" ]; then
  for candidate in "${SSH_KEY_CANDIDATES[@]}"; do
    if [ -f "$candidate" ]; then
      SSH_KEY="$candidate"
      break
    fi
  done
fi
if [ -z "$SSH_KEY" ] || [ ! -f "$SSH_KEY" ]; then
  echo "❌ No encuentro la clave SSH del EC2. Probadas: ${SSH_KEY:-${SSH_KEY_CANDIDATES[*]}}" >&2
  echo "   Pásala con SSH_KEY=/ruta/a/co2univ-key.pem o añade su ruta en scripts/ec2_config.sh." >&2
  exit 1
fi
DOMAIN="${DOMAIN:-trincaunt.ddns.net}"

# Opciones SSH genéricas para reutilizar
SSH_CMD="ssh -i $SSH_KEY"
