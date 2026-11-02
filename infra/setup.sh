#!/usr/bin/env bash
# One-time Google Cloud setup for Goods. Safe to re-run: every step skips
# what already exists.
#
#   PROJECT_ID=my-project REGION=europe-west1 ./infra/setup.sh
#
# What it creates
#   - Artifact Registry repo "goods"
#   - Service accounts: goods-runtime (runs the services) and goods-invoker
#     (identity Cloud Tasks / Scheduler sign OIDC tokens as)
#   - Secret Manager secrets (empty; you add values, see the end)
#   - Cloud Tasks queues: ingest, media, buttons, notify
#   - Cloud Scheduler jobs: sweep (every 5 min) and nightly (03:10 Addis)
#
# The Cloud Run services themselves are created by the first deploy
# (./infra/deploy.sh or .github/workflows/deploy.yml).
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-europe-west1}"
REPO="${REPO:-goods}"
RUNTIME_SA="goods-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
INVOKER_SA="goods-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "▸ Enabling APIs"
gcloud services enable \
  run.googleapis.com cloudtasks.googleapis.com cloudscheduler.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com aiplatform.googleapis.com iamcredentials.googleapis.com

echo "▸ Artifact Registry"
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --location "$REGION" --repository-format docker \
    --description "Goods images"
# Keep the 10 most recent images; older untagged ones are deleted.
cat > /tmp/goods-ar-policy.json <<'JSON'
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":10}},
 {"name":"delete-old","action":{"type":"Delete"},"condition":{"tagState":"ANY","olderThan":"2592000s"}}]
JSON
gcloud artifacts repositories set-cleanup-policies "$REPO" --location "$REGION" \
  --policy /tmp/goods-ar-policy.json --no-dry-run >/dev/null

echo "▸ Service accounts"
for sa in goods-runtime goods-invoker; do
  gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "$sa" --display-name "$sa"
done

bind() { gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$1" --role "$2" --condition None >/dev/null; }
bind "$RUNTIME_SA" roles/cloudtasks.enqueuer
bind "$RUNTIME_SA" roles/secretmanager.secretAccessor
bind "$RUNTIME_SA" roles/aiplatform.user
bind "$RUNTIME_SA" roles/logging.logWriter
# The runtime creates tasks that carry the invoker's OIDC token: it must be
# allowed to act as the invoker.
gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --member "serviceAccount:$RUNTIME_SA" --role roles/iam.serviceAccountUser >/dev/null
# Cloud Tasks / Scheduler service agents mint tokens for the invoker.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
for agent in "service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com" \
             "service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"; do
  gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
    --member "serviceAccount:$agent" --role roles/iam.serviceAccountTokenCreator >/dev/null 2>&1 || true
done

echo "▸ Secrets"
for s in DATABASE_URL DATABASE_URL_DIRECT SESSION_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET \
         S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY CLOUDFLARE_API_TOKEN; do
  gcloud secrets describe "$s" >/dev/null 2>&1 ||
    gcloud secrets create "$s" --replication-policy automatic >/dev/null
done

echo "▸ Cloud Tasks queues"
# name  max-dispatches/s  max-concurrent  max-attempts
queue() {
  local name=$1 rate=$2 conc=$3 attempts=$4
  local args=(--location "$REGION" --max-dispatches-per-second "$rate" --max-concurrent-dispatches "$conc"
              --max-attempts "$attempts" --min-backoff 5s --max-backoff 600s --max-doublings 5)
  if gcloud tasks queues describe "$name" --location "$REGION" >/dev/null 2>&1; then
    gcloud tasks queues update "$name" "${args[@]}" >/dev/null
  else
    gcloud tasks queues create "$name" "${args[@]}" >/dev/null
  fi
}
queue ingest  10 20 20   # listing extraction (AI) — bounded so a flood can't run up the bill
queue media   10 10 15   # image download + WebP renditions
queue buttons  8  4 25   # Telegram edits: stay well under Telegram's per-bot limits
queue notify  20 10 10   # seller/buyer messages

cat <<EOF

✓ Base resources ready.

Next:
  1. Add secret values, e.g.
       printf '%s' 'postgres://...-pooler.../goods?sslmode=require' | gcloud secrets versions add DATABASE_URL --data-file=-
       printf '%s' 'postgres://.../goods?sslmode=require'          | gcloud secrets versions add DATABASE_URL_DIRECT --data-file=-
       openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add SESSION_SECRET --data-file=-
       openssl rand -hex 32 | tr -d '\n'    | gcloud secrets versions add TELEGRAM_WEBHOOK_SECRET --data-file=-
     (plus TELEGRAM_BOT_TOKEN, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, CLOUDFLARE_API_TOKEN)
  2. Fill infra/env.prod.yaml (copy infra/env.prod.example.yaml).
  3. Deploy:  PROJECT_ID=$PROJECT_ID REGION=$REGION ./infra/deploy.sh
  4. Schedule: PROJECT_ID=$PROJECT_ID REGION=$REGION ./infra/scheduler.sh
  5. Register the bot: see docs/DEPLOY.md (scripts/set-webhook.ts)
EOF
