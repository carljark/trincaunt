#!/bin/bash
# ==========================================
# DESPLEGAR A PRODUCCIÓN (EC2), desde Castellón o el Mac
#   ./deploy.sh                      # desde una rama: PR -> CI -> merge -> despliegue de main
#   ./deploy.sh                      # desde main: vuelve a desplegar main tal cual
#   ./deploy.sh --merge-only         # desde una rama: PR -> CI -> merge, sin desplegar
#   ./deploy.sh --title "feat: ..."  # título de la PR (si no, el del commit)
#
# Si ya hay una PR abierta para la rama, la reutiliza. Si el CI falla, se para
# sin fusionar ni desplegar. Fusiona siempre con merge commit (sin squash).
# La subida al EC2 la hace scripts/sync_to_ec2.sh con el commit de main.
# ==========================================
set -euo pipefail

DEPLOY=1
TITLE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --merge-only) DEPLOY=0 ;;
    --title) TITLE="${2:?--title necesita un valor}"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "❌ Opción desconocida: $1 (usa --help)" >&2; exit 1 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)"

fail() { echo "❌ $*" >&2; exit 1; }

# --- Comprobaciones previas ---
BRANCH=$(git branch --show-current)
[ -n "$BRANCH" ] || fail "No estás en ninguna rama (HEAD separado)."

# Solo se despliega lo commiteado: con cambios sueltos, lo desplegado no sería lo que ves
[ -z "$(git status --porcelain)" ] || { git status --short >&2; fail "Hay cambios sin commitear o archivos sin seguimiento (arriba). Haz commit, bórralos o añádelos a .gitignore."; }

git fetch -q origin

if [ "$BRANCH" = "main" ]; then
  # --- Desde main: sin PR, se despliega main tal cual está en GitHub ---
  [ "$DEPLOY" -eq 1 ] || fail "--merge-only no tiene sentido en main: no hay nada que fusionar."
  [ "$(git rev-list --count origin/main..HEAD)" -eq 0 ] \
    || fail "Tu main local tiene commits que no están en GitHub. Pásalos a una rama feature/<nombre> y despliega desde ella."
  git pull -q --ff-only origin main
  echo "ℹ️  Estás en main: se despliega $(git log -1 --format='%h %s') sin PR."
else
  # --- Desde una rama: PR, CI y merge ---
  gh auth status >/dev/null 2>&1 || fail "gh no tiene sesión iniciada. Ejecuta: gh auth login"

  AHEAD=$(git rev-list --count origin/main..HEAD)
  [ "$AHEAD" -gt 0 ] || fail "La rama $BRANCH no tiene commits nuevos respecto a origin/main."

  echo "📤 [1/4] Subiendo $BRANCH ($AHEAD commit(s))..."
  git push -q -u origin "$BRANCH"

  PR=$(gh pr list --head "$BRANCH" --base main --state open --json number --jq '.[0].number // empty')
  if [ -n "$PR" ]; then
    echo "   PR #$PR ya abierta; la reutilizo."
  else
    if [ -z "$TITLE" ]; then
      if [ "$AHEAD" -eq 1 ]; then TITLE=$(git log -1 --format=%s); else TITLE="$BRANCH"; fi
    fi
    BODY="Commits:"$'\n'"$(git log --reverse --format='- %s' origin/main..HEAD)"
    PR_URL=$(gh pr create --base main --head "$BRANCH" --title "$TITLE" --body "$BODY")
    PR=${PR_URL##*/}
    echo "   Creada $PR_URL"
  fi

  echo "⏳ [2/4] Esperando al CI de la PR #$PR..."
  # Las comprobaciones tardan unos segundos en aparecer tras crear la PR
  COUNT=0
  for _ in $(seq 1 24); do
    COUNT=$(gh pr checks "$PR" --json name --jq 'length' 2>/dev/null || echo 0)
    [ "$COUNT" -gt 0 ] && break
    sleep 5
  done
  [ "$COUNT" -gt 0 ] || fail "La PR #$PR no tiene comprobaciones de CI tras 2 minutos. Revisa la pestaña Actions."

  if ! gh pr checks "$PR" --watch --fail-fast --interval 10; then
    fail "El CI ha fallado. No fusiono ni despliego. Detalles: gh pr checks $PR --web"
  fi
  gh pr checks "$PR" --json bucket --jq 'all(.[]; .bucket == "pass" or .bucket == "skipping")' | grep -qx true \
    || fail "Hay comprobaciones que no están en verde. No fusiono ni despliego."

  echo "🔀 [3/4] Fusionando la PR #$PR en main..."
  gh pr merge "$PR" --merge --delete-branch
  git checkout -q main
  git pull -q --ff-only origin main
fi

[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "main local no coincide con origin/main; no despliego."
echo "   main en $(git log -1 --format='%h %s')"

if [ "$DEPLOY" -eq 0 ]; then
  echo "✅ Fusionada. Despliegue omitido (--merge-only)."
  exit 0
fi

# --- 4. Desplegar ---
echo "🚀 [4/4] Desplegando main en el EC2..."
./scripts/sync_to_ec2.sh

source scripts/ec2_config.sh
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || true)
if [ "$CODE" = "200" ]; then
  echo "✅ Desplegado. https://$DOMAIN responde 200."
else
  fail "Desplegado, pero https://$DOMAIN responde '$CODE'. Revisa: ssh al EC2 y docker logs trincaunt-app"
fi
