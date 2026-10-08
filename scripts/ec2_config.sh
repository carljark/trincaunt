#!/bin/bash
# Configuración común de conexión al EC2. Se carga con `source` desde deploy.sh
# y scripts/migrate_db_to_ec2.sh.

# Cada valor se puede sobrescribir por entorno, p. ej. en el Mac:
#   SSH_KEY=~/.ssh/id_ed25519 ./deploy.sh
EC2_USER="${EC2_USER:-ubuntu}"
EC2_HOST="${EC2_HOST:-51.92.83.113}"
SSH_KEY="${SSH_KEY:-$HOME/job/profesion/UJI/co2univ/co2unuv-key.pem}"
TARGET_DIR="/home/$EC2_USER/trincaunt"

# Opciones SSH genéricas para reutilizar
SSH_CMD="ssh -i $SSH_KEY"
