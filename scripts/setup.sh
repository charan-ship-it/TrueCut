#!/usr/bin/env bash
# One-time setup for TrueCut.
set -e
cd "$(dirname "$0")/.."
echo "→ Installing dependencies (includes a bundled ffmpeg)…"
NODE_ENV=development npm install --include=dev --no-audit --no-fund
echo "→ Installing headless Chromium for capture and rendering…"
npx playwright install chromium
if [ ! -f .env.local ]; then cp .env.example .env.local; echo "→ Created .env.local — add ANTHROPIC_API_KEY and ELEVENLABS_API_KEY (or point NICK_MOTION_ENV_FILES at existing env files)."; fi
echo "→ Loading the Agent Nick demo project…"
npx tsx scripts/seed-demo.ts || true
echo "→ Checking everything…"
npx tsx scripts/doctor.ts || true
echo ""
echo "Done. Start the app with:  npm run dev   →  http://localhost:3100"
