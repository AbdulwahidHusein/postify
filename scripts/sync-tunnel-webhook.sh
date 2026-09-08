#!/usr/bin/env bash
# Sync NEXT_PUBLIC_APP_URL + Telegram webhook to the current public tunnel URL.
#
# Usage:
#   ./scripts/sync-tunnel-webhook.sh https://xxxx.trycloudflare.com
#
# Quick tunnels change every restart — run this after starting cloudflared.
# For a permanent hostname you need a named Cloudflare tunnel on a domain you own
# (or deploy the app somewhere with a stable URL).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: $0 https://your-tunnel-host.example"
  exit 1
fi

URL="${URL%/}"
if [[ ! "$URL" =~ ^https:// ]]; then
  echo "URL must start with https://"
  exit 1
fi

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local"
  exit 1
fi

# Update APP_URL in .env.local (portable sed)
if grep -q '^NEXT_PUBLIC_APP_URL=' .env.local; then
  sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${URL}|" .env.local
else
  printf '\nNEXT_PUBLIC_APP_URL=%s\n' "$URL" >> .env.local
fi

echo "Updated NEXT_PUBLIC_APP_URL → $URL"

set -a
# shellcheck disable=SC1091
source .env.local
set +a

npx tsx scripts/set-webhook.ts

echo
echo "Restart Next.js if it was already running so it picks up the new APP_URL."
echo "Note: trycloudflare.com quick tunnels are NOT permanent — URL changes each start."
