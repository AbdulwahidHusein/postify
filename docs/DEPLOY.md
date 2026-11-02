# Deploying Goods

There are two supported setups. Both run the same code:

- **Vercel (recommended for the beta):** one Next.js app. Background jobs use a Postgres queue (`TASKS_MODE=db`) that runs right after each request, plus a sweep every 5 minutes.
- **Google Cloud Run:** Docker image, Cloud Tasks and Cloud Scheduler (`TASKS_MODE=cloud`). See the second half of this guide.

Neon (database) and Cloudflare R2 (images) are used in both.

# A. Vercel

## What you need
- A Neon database: the pooled connection string and the direct one.
- A Cloudflare R2 bucket pair with an API token (see *2. Cloudflare* below, steps 2–3).
- The Telegram bot token and a webhook secret (`openssl rand -hex 32`).
- A cron secret (`openssl rand -hex 32`).

## Steps
1. Create `.env.production` from `.env.example`. Set:
   - `TASKS_MODE=db` and `CRON_SECRET`;
   - `NEXT_PUBLIC_APP_URL`: your Vercel URL, e.g. `https://goods-et.vercel.app`, or your own domain;
   - `SHOP_SUBDOMAINS=false` until you add a wildcard domain. Shops then live at `<app>/s/<handle>`.
2. Install the Vercel CLI and link the project (once):
   ```bash
   npm i -g vercel && vercel login && vercel link
   ```
3. Push the env vars, deploy, and register the bot webhook:
   ```bash
   ./scripts/vercel-setup.sh .env.production
   ```
   The build runs `npm run vercel-build`, which applies database migrations before `next build`. Functions run in Frankfurt (`fra1`), close to Neon's `eu-central-1`.
4. Make the background sweep run every 5 minutes. Vercel's free cron only runs daily, so in GitHub, under the repository's Settings → Secrets and variables → Actions:
   - add the variable `APP_URL` (the production URL);
   - add the secret `CRON_SECRET` (the same value as in Vercel).

   `.github/workflows/cron.yml` then calls `/internal/cron/sweep` every 5 minutes. `vercel.json` adds a daily nightly job and a daily sweep as a backup.
5. Open the bot in Telegram, tap **Connect channel**, and post a photo with a price.

## How background work runs on Vercel
- Telegram's webhook answers in milliseconds. The update is stored and an `ingest` job is inserted into the `jobs` table.
- Next.js `after()` keeps the function alive after the response and drains due jobs:
  - it waits a few seconds for album parts to arrive;
  - jobs are claimed with `FOR UPDATE SKIP LOCKED`, so concurrent instances never run the same job twice.
- Failures retry with exponential backoff; Telegram rate limits use Telegram's `retry_after`. After too many attempts a job is marked failed and you get an ops message in Telegram.
- Anything delayed longer, or left behind by a crashed instance (its lock expires after 2 minutes), is picked up by the 5-minute sweep.
- Channel photos are copied in the sizes Telegram already produced, so no image processing runs on Vercel. Only photos uploaded from the dashboard are resized.

## Preview deployments
Scope the database variables to **Production** only, or give previews their own Neon branch. Otherwise a preview build would run migrations against the production database.

## Later: shop subdomains
Add `goods.et` and `*.goods.et` to the Vercel project; the wildcard needs Vercel's nameservers. Then set `ROOT_DOMAIN=goods.et`, `SHOP_SUBDOMAINS=true` and `COOKIE_DOMAIN=.goods.et`, and redeploy.

# B. Google Cloud Run

## 1. Neon

Create a project in the region nearest your Cloud Run region (e.g. `aws-eu-central-1` for `europe-west1`) and a database named `goods`. Copy two connection strings:

- the **pooled** one (`…-pooler…`) → `DATABASE_URL`
- the **direct** one → `DATABASE_URL_DIRECT` (migrations need a session connection)

## 2. Cloudflare

1. Put the domain (e.g. `goods.et`) on Cloudflare.
2. In R2, create two buckets:
   - `goods-public`: give it the custom domain `img.goods.et`.
   - `goods-private`: no public access. It holds originals and chat attachments.

   Create an R2 API token with read and write access to both buckets. That gives you `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and the endpoint `https://<account>.r2.cloudflarestorage.com`.
3. Add CORS on `goods-private` so browsers can upload directly. Allow `PUT` from `https://goods.et` and `https://*.goods.et`, with header `content-type`.
4. DNS: add proxied `A` records for `goods.et` and `*.goods.et` pointing at `192.0.2.1`. The address is a placeholder; the Worker answers these hosts.

## 3. Telegram

1. In @BotFather, run `/newbot` to get `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`.
2. Run `/newapp` for the bot and set the URL to `https://goods.et`. Its short name is `TELEGRAM_MINI_APP_SHORT_NAME`, so the links look like `t.me/<bot>/<short>`.
3. Run `/setdomain` and set `goods.et`, for the Login Widget on the website.
4. Leave privacy mode **on**. In groups the bot is an admin, so it receives messages anyway.

## 4. Google Cloud

```bash
gcloud auth login
export PROJECT_ID=my-goods-project REGION=europe-west1
./infra/setup.sh                       # APIs, service accounts, queues, secrets
```

Add the secret values; `setup.sh` prints the commands. Then:

```bash
cp infra/env.prod.example.yaml infra/env.prod.yaml   # edit: domain, bot, project, R2
./infra/deploy.sh                      # build → migrate (Cloud Run Job) → goods-jobs → goods
./infra/scheduler.sh                   # sweep every 5 min, nightly at 03:10 Addis time
```

`deploy.sh` prints the web URL (`https://goods-<number>.<region>.run.app`).

## 5. Edge Worker

```bash
cd infra/router-worker
npm install
# set ORIGIN in wrangler.toml to the web URL from deploy.sh
npx wrangler deploy
```

Check that `https://goods.et/api/health` returns `{"ok":true}`.

## 6. Bot webhook

```bash
TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… NEXT_PUBLIC_APP_URL=https://goods.et \
  npm run telegram:webhook
```

This registers `/api/telegram/webhook` with the secret header and the update types the bot needs. It also sets the commands (English and Amharic) and the menu button. Re-run it whenever the domain changes.

## 7. CI/CD (optional)

`.github/workflows/ci.yml` runs typecheck, lint, tests, a migration-drift check and the build on every PR.

`.github/workflows/deploy.yml` deploys on push to `main` with keyless auth:

1. Create a Workload Identity pool and provider for GitHub.
2. Create a `goods-deployer` service account with these roles: `roles/run.admin`, `roles/cloudbuild.builds.editor`, `roles/artifactregistry.writer` and `roles/iam.serviceAccountUser` (on goods-runtime). Also give it `roles/storage.admin`, or a narrower role on the Cloud Build source bucket.
3. Set the repository variables and the secrets listed at the top of the workflow.

## Operations

- **Logs:** Cloud Logging, as structured JSON. Filter by `jsonPayload.job` or by `severity>=WARNING`.
- **Ops alerts** go to `OPS_TELEGRAM_CHAT_ID`: the AI budget breaker tripping, and an unhealthy webhook (backlog or recent delivery errors, checked every 5 minutes).
- **Retries:** Cloud Tasks retries jobs with backoff. The sweep re-drives anything stuck, and every handler is idempotent.
- **Rollback:** run `gcloud run services update-traffic goods --to-revisions <rev>=100`, and the same for goods-jobs. Migrations are additive by convention, so the previous revision keeps working.
- **Migrations:** after changing `src/server/db/schema.ts`, run `npm run db:generate` and commit the SQL. The deploy applies it before rolling out.
- **Webhook health:** `getWebhookInfo` (printed by `npm run telegram:webhook`) shows `pending_update_count` and the last error.
