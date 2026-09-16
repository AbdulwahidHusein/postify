#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export JIJI_COOKIE="${JIJI_COOKIE:-first_visit=1772709446; uid=69a966467a31a0c1f2d5d5d18eb18f48bd10335e; app=f0216439a59e4f8ca4cfeadff7f11106; lang=en; rid=jiji.com.et}"
export MINE_CONCURRENCY="${MINE_CONCURRENCY:-10}"
export MINE_SAVE_EVERY="${MINE_SAVE_EVERY:-40}"
export MINE_DELAY="${MINE_DELAY:-20}"
echo "starting FAST mine at $(date) concurrency=$MINE_CONCURRENCY saveEvery=$MINE_SAVE_EVERY delay=$MINE_DELAY"
exec npx tsx scripts/mine-form-fields.ts --models-only
