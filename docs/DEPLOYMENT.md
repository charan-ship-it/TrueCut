# Deploying TrueCut on Railway

This sets up TrueCut for the team: everyone signs in with their Google work account and sees the same projects.

## What you'll create

| Railway item | What it is | Why |
|---|---|---|
| **web** service | the app people open (UI + API) | small: 1 vCPU / 1 GB is plenty |
| **worker** service | runs Nick's turns, transcription, voice and renders | the heavy one: start at 4 vCPU / 8 GB |
| **Postgres** | projects, chat, users, and the job queue | one database does both jobs ([why no Redis](adr/0002-postgres-job-queue.md)) |
| **Bucket** | sources, screenshots, voice-overs, renders | both services read and write it ([why](adr/0003-bucket-with-local-working-folder.md)) |

Both services build from the same `Dockerfile`; their settings come from `apps/web/railway.json` and `apps/worker/railway.json`.
No Redis, no volume and no separate frontend service are needed.

## 1. Create the project

1. In Railway: **New Project → Deploy from GitHub repo →** `charan-ship-it/motion-graphics`. Railway creates one service; this will be **web**.
2. **+ New → Database → PostgreSQL.**
3. **+ New → Bucket.** Pick the region closest to the services.

## 2. Configure the web service

**Settings:**

- **Service name:** `web`
- **Config file path** (under *Config-as-code*): `/apps/web/railway.json`
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
| `GOOGLE_CLIENT_ID` | from step 3 |
| `GOOGLE_CLIENT_SECRET` | from step 3 |
| `NEXTAUTH_SECRET` | a long random string: run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | the domain from above, e.g. `https://truecut-web.up.railway.app` |
| `ALLOWED_EMAIL_DOMAINS` | `aixccelerate.com` |

Tip: put everything except the `NEXTAUTH_*` and `GOOGLE_*` values in **Project Settings → Shared Variables** and share them with both services, so you only type them once.

If your bucket's *Credentials* tab says it needs path-style URLs, also set `S3_FORCE_PATH_STYLE=true`.

## 3. Google sign-in

1. Open [Google Cloud console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) in a project owned by your Google Workspace.
2. **OAuth consent screen:** User type **Internal** (only your organisation can sign in), app name *TrueCut*.
3. **Create credentials → OAuth client ID → Web application.**
   - Authorised JavaScript origin: your web URL, e.g. `https://truecut-web.up.railway.app`
   - Authorised redirect URI: the same URL + `/api/auth/callback/google`
4. Copy the client ID and secret into the web service's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Only addresses at `ALLOWED_EMAIL_DOMAINS` (plus any in `ALLOWED_EMAILS`) get in. If neither is set, nobody can sign in. Whoever signs in first becomes the workspace owner.

## 4. Add the worker service

1. **+ New → GitHub Repo →** the same repo.
2. **Settings:** name it `worker`, **Config file path** `/apps/worker/railway.json`, and under **Resources** give it more CPU and memory than web (4 vCPU / 8 GB to start). Don't generate a domain: it doesn't serve the public.
3. **Variables:** the same shared ones as web (`DATABASE_URL`, the bucket values, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`). It doesn't need the Google or NextAuth values.

Optional worker settings:

| Variable | Default | What it does |
|---|---|---|
| `TRUECUT_RENDER_SLOTS` | `1` | renders at once per worker |
| `TRUECUT_WORKER_CONCURRENCY` | `3` | other jobs at once (Nick turns, ingest, voice) |
| `TRUECUT_WORKERS` | half the CPUs, max 6 | Chromium pages per render |
| `TRUECUT_SHUTDOWN_GRACE_SECONDS` | `300` | how long a deploy waits for running jobs to finish |

## 5. Deploy and check

Deploy both services. On each web deploy Railway first runs the database migrations (`truecut migrate`), then starts the app once `/api/health` answers.

- Open the web URL: you should land on the TrueCut sign-in page.
- Sign in, paste a website, and watch Nick work. The worker's **Deploy Logs** show `[worker] listening for …` and each job.
- `https://<web-url>/api/health` shows which pieces are ready (database, ffmpeg, keys present or not). It never shows key values.

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
| Sign-in page says "isn't set up" | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` on web |
| Google says *redirect_uri_mismatch* | the redirect URI in Google must be exactly `<NEXTAUTH_URL>/api/auth/callback/google` |
| "That account isn't on the TrueCut team" | `ALLOWED_EMAIL_DOMAINS` / `ALLOWED_EMAILS` |
| Nick never starts working | worker logs; `TRUECUT_QUEUE=pgboss` on web; the worker has the same `DATABASE_URL` |
| Images or videos don't load | bucket variables on **both** services; try `S3_FORCE_PATH_STYLE=true` |
| A job says "The worker stopped before this finished" | the worker restarted mid-job (deploy or out of memory). Retry; if it repeats, give the worker more memory |
