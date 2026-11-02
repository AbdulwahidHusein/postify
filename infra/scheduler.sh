#!/usr/bin/env bash
# Cloud Scheduler jobs that call the private jobs service with OIDC.
#   PROJECT_ID=my-project REGION=europe-west1 ./infra/scheduler.sh
set -euo pipefail
: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-europe-west1}"
INVOKER_SA="goods-invoker@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
JOBS_URL="https://goods-jobs-${PROJECT_NUMBER}.${REGION}.run.app"

job() {
  local name=$1 schedule=$2 path=$3
  local args=(--project "$PROJECT_ID" --location "$REGION" --schedule "$schedule" --time-zone "Africa/Addis_Ababa"
              --uri "${JOBS_URL}${path}" --http-method POST --oidc-service-account-email "$INVOKER_SA"
              --oidc-token-audience "$JOBS_URL" --attempt-deadline 300s --max-retry-attempts 2)
  if gcloud scheduler jobs describe "$name" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" "${args[@]}" >/dev/null
  else
    gcloud scheduler jobs create http "$name" "${args[@]}" >/dev/null
  fi
  echo "✓ $name  $schedule  → $path"
}

# Re-drive stuck button syncs / media, order reminders and auto-cancel, cart purge.
job goods-sweep   "*/5 * * * *" /internal/cron/sweep
# Analytics rollup, auto-archive, AI cache/usage pruning.
job goods-nightly "10 3 * * *"  /internal/cron/nightly
