# Developing TrueCut

## What you need

- **Node 22** (`node -v`)
- **Postgres 16**, either:
  - Homebrew: `brew install postgresql@16 && brew services start postgresql@16`, then
    `createuser -s truecut; createdb -O truecut truecut; createdb -O truecut truecut_test`
    (set a password with `psql -c "alter user truecut password 'truecut'"`), or
  - Docker: `docker compose up -d db` (creates `truecut` with password `truecut`; run
    `docker compose exec db createdb -U truecut truecut_test` once for the tests).
- The Anthropic and ElevenLabs keys if you want the AI and voice (everything has a fallback without them).

## First run

```bash
npm run setup     # installs deps + Chromium, creates .env.local, migrates the database, seeds the demo
npm run dev       # http://localhost:3100
```

`.env.local` sits at the repo root and is read by the web app, the worker and the CLI tools. The minimum is:

```bash
DATABASE_URL=postgresql://truecut:truecut@localhost:5432/truecut
```

Already had projects from before the database (folders under `data/projects/`)? Run `npm run db:import` once. It is safe to re-run.

## How it runs locally

By default (`TRUECUT_QUEUE=inline`) the web app runs jobs itself and files stay in `data/projects/<id>/`. That is the whole app in one process, which is all you need day to day.

To run it the way production does, with a separate worker:

```bash
# terminal 1
TRUECUT_QUEUE=pgboss npm run dev
# terminal 2
npm run dev:worker
```

To also use a bucket instead of the local folder, start MinIO (`docker compose --profile full up -d bucket bucket-init`)
and add the `S3_*` values from `docker-compose.yml` to `.env.local`. Give the web app and the worker different
`TRUECUT_DATA` folders if you want to prove nothing depends on a shared disk.

`docker compose --profile full up --build` runs the complete production stack (web, worker, migrations, Postgres, MinIO) from the real image.

### Sign-in locally

Sign-in is off unless `GOOGLE_CLIENT_ID` is set, and everyone is the "Local" user. To test it, create an OAuth client
(see [DEPLOYMENT.md](DEPLOYMENT.md#3-google-sign-in)) with the redirect URI `http://localhost:3100/api/auth/callback/google`
and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3100` and `ALLOWED_EMAIL_DOMAINS`.

## Checks before you push

```bash
npm run typecheck
npm test          # needs the truecut_test database; database and bucket tests skip if they can't connect
npm run build
```

CI runs the same three plus a Docker build on every push and pull request (`.github/workflows/ci.yml`).
Bucket tests run when `TRUECUT_TEST_S3_ENDPOINT` points at an S3-compatible server (CI uses MinIO).

## Where things go

| You are changing… | Put it in |
|---|---|
| A page, a card, a panel | `apps/web/components`, `apps/web/app` |
| An API endpoint | `apps/web/app/api/**/route.ts`. Use `route()` or `projectRoute()` from `lib/http` so sign-in and access checks apply |
| What Nick does in the chat | `packages/core/src/director/agent.ts` |
| A new background job | a `defineHandler('kind', …)` next to the code it runs (see `director/actions.ts`), and a `start*` that calls `enqueue` |
| A pipeline step (crawl, analyse, voice, mix, render) | `packages/core/src/<area>` |
| How a scene looks or moves | `packages/engine/src` (runtime.js, talk.js, styles.js) |
| Types shared by the browser and the server | `packages/shared/src/types.ts` |
| A database column or table | `packages/db/src/schema.ts`, then `npm run db:generate` and commit the new file in `packages/db/migrations` |
| An environment variable | read it with `env('NAME')` from `@truecut/config`, and add it to `.env.example` and DEPLOYMENT.md |

Rules of the road:

- **Project data goes through `@truecut/db`** (`getProject`, `updateProject`). `updateProject` takes a row lock; its callback must be synchronous, so do slow work before or after it.
- **Project files go through `@truecut/storage`** (`projectPath`, `writeAtomic`). Inside a job, write to the project folder normally; the job runner uploads what changed. Outside a job (an API route), use `saveFile` so the bucket gets it.
- **Long work never runs in an API route.** Enqueue a job and return its id; the UI polls `/api/jobs/:id`.
- **Nothing on screen without a source.** New AI features must pass through the fact guard (`packages/shared/src/facts.ts`).
- One commit per reviewable change, with a message that says what changed and why.

## Useful commands

```bash
npm run doctor                 # what's missing on this machine
npm run db:generate            # after editing schema.ts: write a new migration
npm run db:migrate             # apply migrations
npm run make -- --url …        # make a video from the terminal
psql "$DATABASE_URL" -c "select kind, status, count(*) from jobs group by 1, 2"
```
