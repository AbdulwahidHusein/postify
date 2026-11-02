#!/usr/bin/env bash
# Push production environment variables to Vercel and deploy.
#
#   npm i -g vercel && vercel login && vercel link   # once
#   ./scripts/vercel-setup.sh .env.production
#
# Reads KEY=VALUE lines (comments and blanks ignored) and sets each one for
# the Production environment, replacing existing values. Then deploys and
# registers the Telegram webhook against the production URL.
set -euo pipefail
FILE="${1:-.env.production}"
[[ -f "$FILE" ]] || { echo "missing $FILE (start from .env.example)"; exit 1; }
command -v vercel >/dev/null || { echo "install the Vercel CLI: npm i -g vercel"; exit 1; }

required=(DATABASE_URL DATABASE_URL_DIRECT SESSION_SECRET NEXT_PUBLIC_APP_URL TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_WEBHOOK_SECRET CRON_SECRET S3_ENDPOINT S3_BUCKET S3_PRIVATE_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY MEDIA_PUBLIC_URL)
for k in "${required[@]}"; do
  grep -qE "^${k}=.+" "$FILE" || { echo "✗ $k is empty or missing in $FILE"; missing=1; }
done
grep -qE '^TASKS_MODE=db$' "$FILE" || { echo "✗ set TASKS_MODE=db for Vercel"; missing=1; }
[[ -z "${missing:-}" ]] || exit 1

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"; value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  [[ -z "$value" ]] && continue
  vercel env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" production >/dev/null
  echo "✓ $key"
done < "$FILE"

echo "▸ Deploying (runs database migrations during the build)"
vercel deploy --prod

set -a; . "$FILE"; set +a
echo "▸ Registering the Telegram webhook at $NEXT_PUBLIC_APP_URL"
npx tsx scripts/set-webhook.ts
