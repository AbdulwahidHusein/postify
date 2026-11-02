#!/usr/bin/env bash
# Build → migrate → deploy. Used by CI and by hand.
#
#   PROJECT_ID=my-project REGION=europe-west1 ./infra/deploy.sh [image-tag]
#
# Deploys one image as:
#   goods       public web: storefront, dashboard, API, Telegram webhook
#   goods-jobs  private (IAM-only): Cloud Tasks + Scheduler targets
#   goods-migrate  Cloud Run Job, executed before the services roll out
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-europe-west1}"
REPO="${REPO:-goods}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"
ENV_FILE="${ENV_FILE:-infra/env.prod.yaml}"
RUNTIME_SA="goods-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
INVOKER_SA="goods-invoker@${PROJECT_ID}.iam.gserviceaccount.com"
REPO_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app"
IMAGE="${REPO_IMAGE}:${TAG}"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE (copy infra/env.prod.example.yaml)"; exit 1; }

APP_URL="$(sed -nE 's/^NEXT_PUBLIC_APP_URL: *"?([^"]+)"?.*/\1/p' "$ENV_FILE")"
SECRETS="DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,TELEGRAM_BOT_TOKEN=TELEGRAM_BOT_TOKEN:latest,TELEGRAM_WEBHOOK_SECRET=TELEGRAM_WEBHOOK_SECRET:latest,S3_ACCESS_KEY_ID=S3_ACCESS_KEY_ID:latest,S3_SECRET_ACCESS_KEY=S3_SECRET_ACCESS_KEY:latest,CLOUDFLARE_API_TOKEN=CLOUDFLARE_API_TOKEN:latest"

echo "▸ Building $IMAGE"
if [[ -z "${SKIP_BUILD:-}" ]]; then
  gcloud builds submit --project "$PROJECT_ID" --region "$REGION" \
    --config infra/cloudbuild.yaml --substitutions "_REPO_IMAGE=${REPO_IMAGE},_TAG=${TAG},_APP_URL=${APP_URL}" .
fi

echo "▸ Migrating"
gcloud run jobs deploy goods-migrate --project "$PROJECT_ID" --region "$REGION" \
  --image "$IMAGE" --service-account "$RUNTIME_SA" \
  --command node --args migrate.mjs \
  --set-secrets "DATABASE_URL_DIRECT=DATABASE_URL_DIRECT:latest" \
  --max-retries 0 --task-timeout 300s --quiet
gcloud run jobs execute goods-migrate --project "$PROJECT_ID" --region "$REGION" --wait

# Cloud Run's deterministic URL lets both services know the jobs target up front.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
JOBS_URL="https://goods-jobs-${PROJECT_NUMBER}.${REGION}.run.app"
MERGED_ENV="$(mktemp)"
trap 'rm -f "$MERGED_ENV"' EXIT
grep -vE '^(TASKS_TARGET_URL|TASKS_AUDIENCE):' "$ENV_FILE" > "$MERGED_ENV"
printf 'TASKS_TARGET_URL: "%s"\nTASKS_AUDIENCE: "%s"\n' "$JOBS_URL" "$JOBS_URL" >> "$MERGED_ENV"

common=(--project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" --service-account "$RUNTIME_SA"
        --env-vars-file "$MERGED_ENV" --set-secrets "$SECRETS" --execution-environment gen2 --quiet)

echo "▸ Deploying goods-jobs"
gcloud run deploy goods-jobs "${common[@]}" \
  --no-allow-unauthenticated --cpu 1 --memory 1Gi --concurrency 8 \
  --min-instances 0 --max-instances 5 --timeout 300s
gcloud run services add-iam-policy-binding goods-jobs --project "$PROJECT_ID" --region "$REGION" \
  --member "serviceAccount:$INVOKER_SA" --role roles/run.invoker >/dev/null

echo "▸ Deploying goods (web)"
gcloud run deploy goods "${common[@]}" \
  --allow-unauthenticated --cpu 1 --memory 1Gi --concurrency 80 --cpu-boost \
  --min-instances "${WEB_MIN_INSTANCES:-0}" --max-instances 20 --timeout 60s

WEB_URL="$(gcloud run services describe goods --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"
echo
echo "✓ web:  $WEB_URL  (serve it at $APP_URL through the router Worker)"
echo "✓ jobs: $JOBS_URL"
curl -fsS "$WEB_URL/api/health" && echo
