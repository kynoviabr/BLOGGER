#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${TMPDIR:-/tmp}/autodeploy/ci.yml"
if [ ! -f "$SRC" ] && [ -f "/tmp/claude-501/autodeploy/ci.yml" ]; then
  SRC="/tmp/claude-501/autodeploy/ci.yml"
fi
if [ ! -f "$SRC" ]; then
  echo "❌ CI source não encontrado em $SRC nem em /tmp/claude-501/autodeploy/ci.yml"
  echo "   Recrie manualmente .github/workflows/ci.yml com o conteúdo padrão."
  exit 1
fi

mkdir -p .github/workflows
cp "$SRC" .github/workflows/ci.yml
echo "✅ CI restaurado em .github/workflows/ci.yml"

git add .github/workflows/ci.yml
if git diff --cached --quiet; then
  echo "ℹ️ Nada para commitar (ci.yml já no HEAD)"
else
  git commit -m "ci: require typecheck+test+build

Co-Authored-By: Claude <noreply@anthropic.com>"
fi

echo "→ Tentando git push origin HEAD..."
if git push origin HEAD 2>&1; then
  echo "✅ CI enviado!"
  exit 0
fi

echo "⚠️ push falhou (provavelmente falta scope 'workflow')"
echo "→ Tentando fallback via gh api (precisa de gh auth com workflow)..."
if command -v gh >/dev/null 2>&1; then
  B64=$(base64 -i .github/workflows/ci.yml | tr -d '\n')
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  # tenta criar via Contents API
  gh api "repos/kynoviabr/BLOGGER/contents/.github/workflows/ci.yml" \
    --method PUT \
    --field message="ci: require typecheck+test+build" \
    --field content="$B64" \
    --field branch="$BRANCH" 2>&1 && echo "✅ CI enviado via gh api!" && exit 0
fi

echo "❌ Não consegui enviar CI automaticamente."
echo "   Rode no seu Terminal (1x):"
echo "     gh auth refresh --scopes workflow"
echo "     git push origin HEAD"
exit 1
