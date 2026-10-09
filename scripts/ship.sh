#!/bin/bash
# ==========================================
# PUBLICAR UNA RAMA: PR -> CI -> MERGE -> DEPLOY
# Desde una rama feature/* con los cambios ya commiteados:
#   ./scripts/ship.sh                      # PR, espera el CI, fusiona y despliega
#   ./scripts/ship.sh --no-deploy          # igual, pero sin desplegar
#   ./scripts/ship.sh --title "feat: ..."  # título de la PR (si no, el del commit)
#
# Si ya hay una PR abierta para la rama, la reutiliza. Si el CI falla, se para
# sin fusionar ni desplegar. Fusiona siempre con merge commit (sin squash).
# ==========================================
set -euo pipefail

DEPLOY=1
TITLE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-deploy) DEPLOY=0 ;;
    --title) TITLE="${2:?--title necesita un valor}"; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "❌ Opción desconocida: $1 (usa --help)" >&2; exit 1 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)"

fail() { echo "❌ $*" >&2; exit 1; }

# --- Comprobaciones previas ---
gh auth status >/dev/null 2>&1 || fail "gh no tiene sesión iniciada. Ejecuta: gh auth login"

BRANCH=$(git branch --show-current)
[ -n "$BRANCH" ] || fail "No estás en ninguna rama (HEAD separado)."
[ "$BRANCH" != "main" ] || fail "Estás en main. Crea una rama feature/<nombre> con tus commits."

# deploy.sh sube la carpeta tal cual: sin cambios sueltos, lo desplegado es exactamente main
[ -z "$(git status --porcelain)" ] || { git status --short >&2; fail "Hay cambios sin commitear o archivos sin seguimiento (arriba). Haz commit, bórralos o añádelos a .gitignore."; }

git fetch -q origin
AHEAD=$(git rev-list --count origin/main..HEAD)
[ "$AHEAD" -gt 0 ] || fail "La rama $BRANCH no tiene commits nuevos respecto a origin/main."

# --- 1. Push y PR ---
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

# --- 2. Esperar al CI ---
echo "⏳ [2/4] Esperando al CI de la PR #$PR..."
# Las comprobaciones tardan unos segundos en aparecer tras crear la PR
for _ in $(seq 1 24); do
  COUNT=$(gh pr checks "$PR" --json name --jq 'length' 2>/dev/null || echo 0)
  [ "$COUNT" -gt 0 ] && break
  sleep 5
done
[ "${COUNT:-0}" -gt 0 ] || fail "La PR #$PR no tiene comprobaciones de CI tras 2 minutos. Revisa la pestaña Actions."

if ! gh pr checks "$PR" --watch --fail-fast --interval 10; then
  fail "El CI ha fallado. No fusiono ni despliego. Detalles: gh pr checks $PR --web"
fi
gh pr checks "$PR" --json bucket --jq 'all(.[]; .bucket == "pass" or .bucket == "skipping")' | grep -qx true \
  || fail "Hay comprobaciones que no están en verde. No fusiono ni despliego."

# --- 3. Fusionar ---
echo "🔀 [3/4] Fusionando la PR #$PR en main..."
gh pr merge "$PR" --merge --delete-branch
git checkout -q main
git pull -q --ff-only origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "main local no coincide con origin/main; no despliego."
echo "   main en $(git log -1 --format='%h %s')"

# --- 4. Desplegar ---
if [ "$DEPLOY" -eq 0 ]; then
  echo "✅ Fusionada. Despliegue omitido (--no-deploy)."
  exit 0
fi

echo "🚀 [4/4] Desplegando main..."
./deploy.sh

source scripts/ec2_config.sh
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || true)
if [ "$CODE" = "200" ]; then
  echo "✅ Desplegado. https://$DOMAIN responde 200."
else
  fail "Desplegado, pero https://$DOMAIN responde '$CODE'. Revisa: ssh al EC2 y docker logs trincaunt-app"
fi
