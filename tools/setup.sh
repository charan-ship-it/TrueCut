#!/usr/bin/env bash
# One-time setup for TrueCut.
set -e
cd "$(dirname "$0")/.."
echo "→ Installing dependencies (includes a bundled ffmpeg)…"
NODE_ENV=development npm install --include=dev --no-audit --no-fund
echo "→ Installing headless Chromium for capture and rendering…"
npx playwright install chromium
if [ ! -f .env.local ]; then cp .env.example .env.local; echo "→ Created .env.local — add ANTHROPIC_API_KEY and ELEVENLABS_API_KEY (or point TRUECUT_ENV_FILES at existing env files)."; fi
set -a; [ -f .env.local ] && . ./.env.local; set +a
if [ -z "$DATABASE_URL" ]; then
  echo "→ DATABASE_URL isn't set. Start Postgres (see docs/DEVELOPMENT.md), put DATABASE_URL in .env.local and run npm run setup again."
  exit 1
fi
echo "→ Setting up the database…"
npm run db:migrate
if [ -d data/projects ]; then echo "→ Importing existing projects from data/…"; npm run db:import || true; fi
echo "→ Loading the Agent Nick demo project…"
npx tsx tools/seed-demo.ts || true
echo "→ Checking everything…"
npx tsx tools/doctor.ts || true
echo ""
echo "Done. Start the app with:  npm run dev   →  http://localhost:3100"
