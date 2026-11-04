#!/bin/bash
# ==========================================
# DESPLEGAR A PRODUCCIÓN (EC2)
# Despliega GitHub Actions (.github/workflows/deploy.yml): cada commit de main que pasa el CI
# se publica solo. Este script lleva una rama hasta ahí y espera a ver el resultado.
#   ./deploy.sh                      # desde una rama: PR -> CI -> merge -> espera al despliegue
#   ./deploy.sh                      # desde main: vuelve a desplegar main (lanza el workflow)
#   ./deploy.sh --local              # desde main: plan B sin GitHub Actions; construye la imagen
#                                    # en esta máquina (necesita Docker) y la envía por SSH
#   ./deploy.sh --title "feat: ..."  # título de la PR (si no, el del commit)
#
# Si ya hay una PR abierta para la rama, la reutiliza. Si el CI falla, se para
# sin fusionar. Fusiona siempre con merge commit (sin squash). Fusionar = desplegar.
# ==========================================
set -euo pipefail

LOCAL=0
TITLE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --local) LOCAL=1 ;;
    --merge-only)
      echo "❌ --merge-only ya no existe: al fusionar en main, GitHub Actions despliega solo." >&2
      echo "   Para fusionar sin desplegar todavía, no fusiones: deja la PR abierta." >&2
      exit 1 ;;
    --title) TITLE="${2:?--title necesita un valor}"; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
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

gh auth status >/dev/null 2>&1 || fail "gh no tiene sesión iniciada. Ejecuta: gh auth login"

# Espera a la ejecución del workflow Deploy para el commit $1 (creada después de $2, epoch)
# y la sigue hasta el final. Falla si el job de despliegue no termina en verde.
watch_deploy() {
  # Margen de 2 min por si el reloj de esta máquina no coincide con el de GitHub
  local sha=$1 since=$(($2 - 120)) run_id="" job
  echo "⏳ Esperando a que GitHub Actions empiece a desplegar $(git rev-parse --short "$sha")..."
  # Tras un merge, primero corre el CI de main (1-3 min) y después arranca Deploy
  for _ in $(seq 1 90); do
    run_id=$(gh run list --workflow deploy.yml --commit "$sha" --limit 5 --json databaseId,createdAt \
      --jq "[.[] | select((.createdAt | fromdateiso8601) >= $since)][0].databaseId // empty" 2>/dev/null || true)
    [ -n "$run_id" ] && break
    sleep 10
  done
  [ -n "$run_id" ] || fail "No aparece ninguna ejecución de Deploy para $sha tras 15 minutos. Mira la pestaña Actions."
  echo "   Ejecución: $(gh run view "$run_id" --json url --jq .url)"
  gh run watch "$run_id" --interval 10 --exit-status >/dev/null \
    || fail "El despliegue ha fallado. Detalles: gh run view $run_id --log-failed"
  job=$(gh run view "$run_id" --json jobs --jq '.jobs[] | select(.name == "Desplegar en el EC2") | .conclusion')
  [ "$job" = "success" ] || fail "El despliegue no se ha ejecutado (estado: ${job:-sin job}). ¿Falló el CI de main? Mira: gh run view $run_id"
}

if [ "$BRANCH" = "main" ]; then
  # --- Desde main: sin PR, se vuelve a desplegar main tal cual está en GitHub ---
  [ "$(git rev-list --count origin/main..HEAD)" -eq 0 ] \
    || fail "Tu main local tiene commits que no están en GitHub. Pásalos a una rama feature/<nombre> y despliega desde ella."
  git pull -q --ff-only origin main
  echo "ℹ️  Estás en main: se despliega $(git log -1 --format='%h %s') sin PR."
else
  # --- Desde una rama: PR, CI y merge (y el merge despliega) ---
  [ "$LOCAL" -eq 0 ] || fail "--local solo se usa desde main (al fusionar ya despliega GitHub Actions)."

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
  MERGED_AT=$(date +%s)
  gh pr merge "$PR" --merge --delete-branch
  git checkout -q main
  git pull -q --ff-only origin main
fi

[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "main local no coincide con origin/main; no despliego."
echo "   main en $(git log -1 --format='%h %s')"

SHA=$(git rev-parse HEAD)

# --- 4. Desplegar ---
if [ "$LOCAL" -eq 1 ]; then
  echo "🚀 [4/4] Desplegando main en el EC2 desde esta máquina (--local)..."
  ./scripts/sync_to_ec2.sh
elif [ "$BRANCH" = "main" ]; then
  echo "🚀 [4/4] Lanzando el workflow Deploy para main..."
  STARTED_AT=$(date +%s)
  gh workflow run deploy.yml --ref main -f ref="$SHA"
  watch_deploy "$SHA" "$STARTED_AT"
else
  echo "🚀 [4/4] GitHub Actions despliega main en el EC2..."
  watch_deploy "$SHA" "$MERGED_AT"
fi

# El dominio sin cargar scripts/ec2_config.sh: desplegando con GitHub no hace falta la clave SSH aquí
DOMAIN="${DOMAIN:-trincaunt.ddns.net}"
# Tras recrear el contenedor, la app tarda unos segundos en arrancar (migraciones) y nginx da 502
CODE=""
for _ in $(seq 1 12); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || true)
  [ "$CODE" = "200" ] && break
  sleep 5
done
if [ "$CODE" = "200" ]; then
  echo "✅ Desplegado. https://$DOMAIN responde 200."
else
  fail "Desplegado, pero https://$DOMAIN responde '$CODE'. Revisa en el EC2: docker logs trincaunt-app"
fi
