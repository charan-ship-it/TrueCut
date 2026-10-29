# Deploying TrueCut on Railway

This sets up TrueCut as an AIX agent: people sign in once on **AIX Core**, Core decides who may use TrueCut, and each Core organisation is a TrueCut workspace.

**Environments.** The Railway project `TrueCut` has two environments. `staging` (`truecut-staging.aiworkforce.md`, Core staging) is where changes go first. `production` (`truecut.aiworkforce.md`, Core production) only gets what staging proved. Their Clerk and Core values differ, and a staging value must never reach production. Both are listed in [Connect to AIX Core](#3-connect-to-aix-core).

## Have these ready first

Collect these before you open Railway; the rest of this guide is copying them into the right boxes.

| # | Thing | Where to get it | Notes |
|---|---|---|---|
| 1 | **Railway account** on a paid plan (Pro recommended) | railway.com | The worker needs 4+ vCPU / 8 GB for renders, more than the free tier allows |
| 2 | **GitHub access** to `charan-ship-it/TrueCut` | your GitHub | Railway deploys from it |
| 3 | **AIX Core access** | Deepak (`deepak@aixccelerate.com`) | He adds TrueCut to Core's catalog and turns it on for your test organisation (step 3) |
| 4 | **Core's Clerk keys** | `ai-workforce-docs` → `core-platform/handoff/agent-integration/aix-clerk-core-env-values.md` (private repo) | Staging and production keys differ. Never paste them into chat or commit them |
| 5 | **Anthropic API key** for the workspace | console.anthropic.com → API keys | Optional at deploy time: owners can add it later in Settings → API keys. Make sure the account has credits and access to Claude Opus 5.5 |
| 6 | **ElevenLabs API key** | elevenlabs.io → Developers → API keys | Allow Text to Speech, Speech to Text and Voices. A plan with enough characters for your voice-overs |
| 7 | **A random secret** | run `openssl rand -base64 32` | Only `TRUECUT_ENCRYPTION_KEY` is needed now (saved API keys; the second one was for the old sign-in). **Store the encryption key in your password manager**: if it is lost, saved keys can't be opened and must be re-entered |
| 8 | **A staging domain** | your DNS (Cloudflare) | `truecut-staging.aiworkforce.md`. It must be under `aiworkforce.md` so the Core session is shared |
| 9 | **A monthly AI budget** | your call | Owners set it in Settings → Models & budget; calls stop cleanly when it's reached |
| 10 | **Core's catalog entry** | Core dashboard → internal Agent Management (support account) | Slug `truecut`, launch URL = this environment's domain |

## What you'll create

| Railway item | What it is | Why |
|---|---|---|
| **web** service | the app people open (UI + API) | small: 1 vCPU / 1 GB is plenty |
| **worker** service | runs Nick's turns, transcription, voice and renders | the heavy one: start at 4 vCPU / 8 GB |
| **Postgres** | projects, chat, users, and the job queue | one database does both jobs ([why no Redis](adr/0002-postgres-job-queue.md)) |
| **Bucket** | sources, screenshots, voice-overs, renders | both services read and write it ([why](adr/0003-bucket-with-local-working-folder.md)) |

Both services build from the root `Dockerfile` (Railway detects it). Their deploy settings are listed below and live in
Railway itself: Railway has retired `railway.json` config files (they stop being read on 2026-12-01), so the repo no longer ships them.
No Redis, no volume and no separate frontend service are needed.

| Setting (service → Settings) | web | worker |
|---|---|---|
| Custom start command | `truecut web` | `truecut worker` |
| Pre-deploy command | `truecut migrate` | (none) |
| Healthcheck path / timeout | `/api/health`, 120 s | `/health`, 120 s |
| Restart policy | On failure, 5 retries | Always |
| Draining seconds | (default) | `300` (lets running renders finish on deploy) |
| Watch paths | `apps/web/**`, `packages/**`, `package-lock.json`, `Dockerfile`, `docker/**` | `apps/worker/**`, `packages/**`, `package-lock.json`, `Dockerfile`, `docker/**` |
| Public domain | yes, port `3000` (set `PORT=3000`) | no |

## 1. Create the project

1. In Railway: **New Project → Deploy from GitHub repo →** `charan-ship-it/TrueCut`. Railway creates one service; this will be **web**.
2. **+ New → Database → PostgreSQL.**
3. **+ New → Bucket.** Pick the region closest to the services.

## 2. Configure the web service

**Settings:**

- **Service name:** `web`
- The web column of the settings table above.
- **Networking → Generate Domain.** Note the URL, e.g. `https://truecut-web.up.railway.app`.

**Variables** (Variables tab). Values in `${{…}}` are Railway references: type them as shown, or use *Add Reference*. Replace `Postgres` and `Bucket` with your services' names if you renamed them.

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `TRUECUT_QUEUE` | `pgboss` |
| `BUCKET` | `${{Bucket.BUCKET}}` |
| `ENDPOINT` | `${{Bucket.ENDPOINT}}` |
| `ACCESS_KEY_ID` | `${{Bucket.ACCESS_KEY_ID}}` |
| `SECRET_ACCESS_KEY` | `${{Bucket.SECRET_ACCESS_KEY}}` |
| `REGION` | `${{Bucket.REGION}}` |
| `ANTHROPIC_API_KEY` | your key |
| `ELEVENLABS_API_KEY` | your key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Core's Clerk key for this environment (step 3). Also a build arg, see below |
| `CLERK_SECRET_KEY` | Core's Clerk secret for this environment (step 3) |
| `CLERK_SIGN_IN_URL` | Core's login page (step 3) |
| `CLERK_SIGN_UP_URL` | Core's sign-up page (step 3) |
| `AIX_CORE_API_URL` | Core's API (step 3) |
| `NEXT_PUBLIC_CORE_APP_URL` | Core's app URL (step 3). Also a build arg |
| `CLERK_ENCRYPTION_KEY` | a random value for this environment: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Required: without it the first sign-in from Core bounced back to Core's dashboard. It is per environment and does not need to match Core's or Nick's |
| `TRUECUT_ENCRYPTION_KEY` | the second random secret (encrypts API keys people save in Settings) |

`ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` are the server's fallback keys. You can leave them out and have an owner add a workspace key in **Settings → API keys** instead (people can also add personal keys); jobs use personal, then workspace, then server keys.

**Build args:** Next.js bakes `NEXT_PUBLIC_*` into the browser code when the image is built. Railway passes a service variable to a Docker build only if the Dockerfile declares it, and this one does for `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NEXT_PUBLIC_CORE_APP_URL`. Changing either needs a redeploy, not just a restart.

Tip: put everything except the Clerk, Core and `NEXT_PUBLIC_*` values in **Project Settings → Shared Variables** and share them with both services, so you only type them once.

If your bucket's *Credentials* tab says it needs path-style URLs, also set `S3_FORCE_PATH_STYLE=true`.

## 3. Connect to AIX Core

TrueCut follows the same contract as every AIX agent ([the integration guide](https://github.com/Ai-Xccelerate/ai-workforce-docs/blob/main/core-platform/handoff/agent-integration/agent-aix-core-auth-integration.md)). People sign in on Core, and the Clerk session is shared across `*.aiworkforce.md`. On every request TrueCut verifies that session, then asks Core `GET /api/v1/agents/truecut/access` with the person's token and refuses unless `has_access` is true. A Core outage or a missing catalog entry is a 503, never a grant. Answers are cached for up to 60 seconds, so revoking someone in Core takes effect within a minute.

TrueCut keeps no passwords, sessions or access list. The Clerk **organisation** in the token is the workspace (workspace id = Clerk org id, created on its first visit). Core's `owner` and `admin` become workspace owners, `member` stays a member. People and roles are managed in Core; Settings → Team only lists them and lets an owner switch someone off for TrueCut.

**Variables on the web service**, from the private env-values file (a human copies the secret key; don't print it):

| Variable | Staging | Production |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Core staging publishable key (`pk_test_…`) | Core production key (`pk_live_…`) |
| `CLERK_SECRET_KEY` | staging secret (`sk_test_…`) | production secret (`sk_live_…`) |
| `CLERK_SIGN_IN_URL` | `https://app-staging.aiworkforce.md/login` | `https://app.aiworkforce.md/login` |
| `CLERK_SIGN_UP_URL` | `https://app-staging.aiworkforce.md/signup` | `https://app.aiworkforce.md/signup` |
| `AIX_CORE_API_URL` | `https://api-staging.aiworkforce.md` | `https://api.aiworkforce.md` |
| `NEXT_PUBLIC_CORE_APP_URL` | `https://app-staging.aiworkforce.md` | `https://app.aiworkforce.md` |

Do not add Clerk webhooks or Clerk dashboard origins, and do not create access tables of your own: Core owns all of that.

### Steps that need a person (not code)

1. **Domain.** Add `truecut-staging.aiworkforce.md` on the web service (Settings → Networking → Custom Domain) and the CNAME in Cloudflare. Production later uses `truecut.aiworkforce.md`. It must be under `aiworkforce.md`.
2. **Core catalog.** In Core's internal Agent Management panel, create `truecut` on the matching Core: name *TrueCut*, role title *Video Studio*, a one-line description, launch URL = the domain above. The slug must be exactly `truecut`.
3. **Enable it for your test organisation** from the same panel. Until then every access check answers `agent_not_enabled_for_org`, however correct the code is.
4. **CORS.** Ask Deepak to add TrueCut's URLs to Core's `CORS_ALLOWED_ORIGINS`.
5. **Smoke test with two users:** an organisation owner or admin (passes as `owner_admin`) and a plain member who is not assigned (sees "You don’t have access to TrueCut", then works once assigned). Wait up to 60 seconds after toggling.

### Checking it from the command line

```bash
curl -i https://<web-url>/api/health                 # 200, public
curl -i https://<web-url>/api/projects               # 401 {"error":"Please sign in."}
```

Until step 2 is done, a signed-in person sees *“TrueCut is not registered in the AIX Core catalog yet.”* That is the gate failing closed, not a bug.

### Chrome extension tokens

The extension uses personal tokens made in Settings, which have no Core session to forward. Switching someone off in Settings → Team stops their token. Removing someone from their organisation in Core does not, so revoke their token there too.

## 4. Add the worker service

1. **+ New → GitHub Repo →** the same repo.
2. **Settings:** name it `worker`, the worker column of the settings table above, and under **Resources** give it more CPU and memory than web (4 vCPU / 8 GB to start). Don't generate a domain: it doesn't serve the public.
3. **Variables:** the same shared ones as web (`DATABASE_URL`, the bucket values, `TRUECUT_ENCRYPTION_KEY`, and `ANTHROPIC_API_KEY` / `ELEVENLABS_API_KEY` if you use server keys). It doesn't need the Clerk or Core values. **The encryption key must be identical on both services**, or the worker can't open saved keys.

Optional worker settings:

| Variable | Default | What it does |
|---|---|---|
| `TRUECUT_RENDER_SLOTS` | `1` | renders at once per worker |
| `TRUECUT_WORKER_CONCURRENCY` | `3` | jobs at once per job kind (Nick turns, ingest, voice…) |
| `TRUECUT_WORKERS` | half the CPUs, max 6 | Chromium pages per render |
| `TRUECUT_SHUTDOWN_GRACE_SECONDS` | `300` | how long a deploy waits for running jobs to finish |

## 5. Deploy and check

Deploy both services. On each web deploy Railway first runs the database migrations (`truecut migrate`), then starts the app once `/api/health` answers.

- Open the web URL signed out: you are sent to Core's login and returned here.
- Sign in, paste a website, and watch Nick work. The worker's **Deploy Logs** show `[worker] listening for …` and each job.
- `https://<web-url>/api/health` shows which pieces are ready (database, ffmpeg, keys present or not). It never shows key values.

## After the first deploy

1. **Sign in through Core.** Each organisation gets its own workspace the first time one of its members arrives, and Core's owners and admins are its owners.
2. **Settings → API keys:** add the workspace Anthropic and ElevenLabs keys (unless you set server keys). Each key is checked with the provider before it's saved.
3. **Settings → Models & budget:** Claude Opus 5.5 is the default for all three job types. Set a monthly budget.
4. **Settings → Capture extension:** download the extension, load it in Chrome (Developer mode → Load unpacked), create a token and connect. Share the zip and these steps with the team; everyone makes their own token.
5. Make a test video, then check **Settings → Usage** shows its tokens and cost.

## Moving existing projects from a laptop

On the Mac that has the projects (`data/projects/`), with the hosted database and bucket details in the environment for that one command:

```bash
DATABASE_URL="<Postgres public URL from Railway>" \
BUCKET=… ENDPOINT=… ACCESS_KEY_ID=… SECRET_ACCESS_KEY=… REGION=… \
npm run db:import
```

That copies every project into Postgres and uploads its files to the bucket. Use the Postgres service's **public** connection URL (*Connect → Public network*), since the internal one only works inside Railway. It is safe to run more than once.

## Scaling and cost

- **More people rendering at once:** raise the worker's replicas (*Settings → Deploy → Replicas*). Each replica takes jobs from the same queue, and nothing else needs to change.
- **A worker never needs a volume.** It keeps a working copy of each project it touches and syncs with the bucket around every job. A volume only saves re-downloading large recordings after a restart.
- **Bucket traffic is free on Railway; service traffic isn't.** Videos and images are therefore served by short-lived signed links straight from the bucket, not through the web service.

## What doesn't work when hosted

- **Folder-path sources** (`../agent-nick`) only work on your own machine. Hosted, Nick asks for an upload or a link instead (`TRUECUT_ALLOW_PATHS=true` overrides this, for a self-hosted box that has the folders).
- **Uploads** go through the web service in a single stream, up to 4 GB per file.

## Troubleshooting

| Symptom | Look at |
|---|---|
| Opening TrueCut from Core lands back on Core's dashboard | `CLERK_ENCRYPTION_KEY` on web; TrueCut's origin in Core's allowed-origins and redirect-origins lists |
| Signed-out visitors aren't sent to Core | `CLERK_SIGN_IN_URL` and the Clerk keys on web; the publishable key must be a Docker build arg too |
| "TrueCut is not registered in the AIX Core catalog yet" | Core catalog step 2 above (slug exactly `truecut`) |
| "You don’t have access to TrueCut" | the organisation isn't enabled (step 3), or a member isn't assigned in Core |
| "Open TrueCut from your AIX Core dashboard" | the session has no active organisation; open TrueCut from Core's card so Core picks one |
| "AIX Core could not be reached" | `AIX_CORE_API_URL`; Core's status; CORS (step 4) |
| Nick never starts working | worker logs; `TRUECUT_QUEUE=pgboss` on web; the worker has the same `DATABASE_URL` |
| Images or videos don't load | bucket variables on **both** services; try `S3_FORCE_PATH_STYLE=true` |
| "Saving API keys is turned off" | `TRUECUT_ENCRYPTION_KEY` missing on web |
| Saved key shows **Rejected**, or jobs say the key was rejected | the provider refused it (revoked, out of credit, no model access). Replace it in Settings |
| "Couldn't decrypt a stored API key" | `TRUECUT_ENCRYPTION_KEY` differs between web and worker, or was changed. Make them identical; to change it on purpose see *Rotating the encryption key* |
| "monthly AI budget" message | the workspace hit its cap; an owner raises it in Settings → Models & budget |
| Extension: "token is not valid any more" | the token was revoked or expired; make a new one in Settings → Capture extension |
| A job says "The worker stopped before this finished" | the worker restarted mid-job (deploy or out of memory). Retry; if it repeats, give the worker more memory |

## Rotating the encryption key

1. Set the new value in `TRUECUT_ENCRYPTION_KEY` and the old one in `TRUECUT_ENCRYPTION_KEY_PREVIOUS`, on **both** services, and redeploy.
2. Run `npm run keys:rotate` once (Railway: the web service's shell, or locally with the production `DATABASE_URL`).
3. When it reports nothing left to re-encrypt, remove `TRUECUT_ENCRYPTION_KEY_PREVIOUS`.

## All settings

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | both | required | Postgres |
| `TRUECUT_QUEUE` | web | `pgboss` in the image | `inline` runs jobs inside web (single-service setups only) |
| `BUCKET`, `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION` (or `S3_*`) | both | unset = local disk | project files and the screenshot library |
| `TRUECUT_ENCRYPTION_KEY` / `_PREVIOUS` | both | unset = can't save keys | encrypts API keys saved in Settings |
| `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` | both | unset | server fallback keys |
| `TRUECUT_MODEL`, `TRUECUT_CREATIVE_MODEL`, `TRUECUT_VISION_MODEL` | both | `claude-opus-5-5` | defaults before an owner picks models in Settings |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (also a build arg), `CLERK_SECRET_KEY`, `CLERK_ENCRYPTION_KEY`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL` | web | required hosted | Core's Clerk session |
| `AIX_CORE_API_URL`, `NEXT_PUBLIC_CORE_APP_URL` (also a build arg) | web | required hosted | Core's access check and the "Open AIX Core" link |
| `TRUECUT_WORKSPACE_NAME` | web | `AI Xccelerate` | the laptop workspace's name (hosted workspaces are Core organisations) |
| `TRUECUT_RENDER_SLOTS`, `TRUECUT_WORKER_CONCURRENCY`, `TRUECUT_WORKERS` | worker | 1, 3, auto | throughput per worker |
| `TRUECUT_SHUTDOWN_GRACE_SECONDS` | worker | 300 | finish running jobs on deploy |
| `TRUECUT_ELEVEN_USD_PER_1K_CHARS`, `TRUECUT_ELEVEN_USD_PER_MINUTE` | both | 0 | optional ElevenLabs cost estimates on the Usage page (plans differ) |
| `TRUECUT_ALLOW_PATHS` | both | off with a bucket | folder-path sources on a self-hosted box |
