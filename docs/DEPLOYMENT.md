# Deploying TrueCut on Railway

This sets up TrueCut for the team: everyone signs in with their Google work account and sees the same projects.

## Have these ready first

Collect these before you open Railway; the rest of this guide is copying them into the right boxes.

| # | Thing | Where to get it | Notes |
|---|---|---|---|
| 1 | **Railway account** on a paid plan (Pro recommended) | railway.com | The worker needs 4+ vCPU / 8 GB for renders, more than the free tier allows |
| 2 | **GitHub access** to `charan-ship-it/TrueCut` | your GitHub | Railway deploys from it; CI must be green |
| 3 | **Google Workspace admin** (or someone who is) | admin.google.com | To create the *Internal* OAuth app for sign-in |
| 4 | **Google OAuth client ID + secret**, and/or a **Nylas** API key for email links | console.cloud.google.com → Credentials (step 3 below) | Needs the final web URL, so you create it after step 2 |
| 5 | **Anthropic API key** for the workspace | console.anthropic.com → API keys | Optional at deploy time: owners can add it later in Settings → API keys. Make sure the account has credits and access to Claude Opus 5.5 |
| 6 | **ElevenLabs API key** | elevenlabs.io → Developers → API keys | Allow Text to Speech, Speech to Text and Voices. A plan with enough characters for your voice-overs |
| 7 | **Two random secrets** | run `openssl rand -base64 32` twice | One for `NEXTAUTH_SECRET` (sessions), one for `TRUECUT_ENCRYPTION_KEY` (saved API keys). **Store the encryption key in your password manager**: if it is lost, saved keys can't be opened and must be re-entered |
| 8 | **Your email domain(s)** | | e.g. `aixccelerate.com`, for `ALLOWED_EMAIL_DOMAINS` |
| 9 | **A monthly AI budget** | your call | Owners set it in Settings → Models & budget; calls stop cleanly when it's reached |
| 10 | (optional) **A custom domain** | your DNS | e.g. `truecut.aixccelerate.com`; then use it for `NEXTAUTH_URL` and the Google redirect |

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
| `GOOGLE_CLIENT_ID` | from step 3 |
| `GOOGLE_CLIENT_SECRET` | from step 3 |
| `NEXTAUTH_SECRET` | a long random string: run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | the domain from above, e.g. `https://truecut-web.up.railway.app` |
| `ALLOWED_EMAIL_DOMAINS` | `aixccelerate.com` |
| `TRUECUT_ENCRYPTION_KEY` | the second random secret (encrypts API keys people save in Settings) |

`ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` are the server's fallback keys. You can leave them out and have an owner add a workspace key in **Settings → API keys** instead (people can also add personal keys); jobs use personal, then workspace, then server keys.

Tip: put everything except the `NEXTAUTH_*` and `GOOGLE_*` values in **Project Settings → Shared Variables** and share them with both services, so you only type them once.

If your bucket's *Credentials* tab says it needs path-style URLs, also set `S3_FORCE_PATH_STYLE=true`.

## 3. Sign-in: Google, email links, or both

People can sign in with Google, with a one-time link emailed to them, or either. Each way shows on the sign-in page only when it is set up, and both lead to the same account for the same address.

### Google

1. Open [Google Cloud console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) in a project owned by your Google Workspace.
2. **OAuth consent screen:** User type **Internal** (only your organisation can sign in), app name *TrueCut*.
3. **Create credentials → OAuth client ID → Web application.**
   - Authorised JavaScript origin: your web URL, e.g. `https://truecut-web.up.railway.app`
   - Authorised redirect URI: the same URL + `/api/auth/callback/google`
4. Copy the client ID and secret into the web service's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Email links (Nylas)

The link is sent through [Nylas](https://dashboard.nylas.com). Add to the **web** service:

| Variable | Value |
|---|---|
| `NYLAS_API_KEY` | Nylas dashboard → API Keys |
| `NYLAS_API_URI` | `https://api.us.nylas.com` (or the EU URI if your Nylas app is in the EU) |
| either `NYLAS_SEND_DOMAIN` + `EMAIL_FROM` | a domain verified under Organization Settings → Domains (e.g. `mail.aixccelerate.com`) and `TrueCut <signin@mail.aixccelerate.com>`. Recommended: no mailbox needed, best delivery |
| or `NYLAS_GRANT_ID` + `NYLAS_MAILBOX_EMAIL` | a connected mailbox; links come from that address, shown as "TrueCut" |

A link works once, for 15 minutes, and only for an allowed address. Opening it shows a *Continue* button, so mail scanners that open links can't use it up. The form answers the same for any address, so it can't be used to find out who is on the team. Requests are limited per address and per IP.

### Who gets in

Only addresses at `ALLOWED_EMAIL_DOMAINS` (plus any in `ALLOWED_EMAILS`) get in, whichever way they sign in. If neither is set, nobody can sign in. Whoever signs in first becomes the workspace owner.

## 4. Add the worker service

1. **+ New → GitHub Repo →** the same repo.
2. **Settings:** name it `worker`, the worker column of the settings table above, and under **Resources** give it more CPU and memory than web (4 vCPU / 8 GB to start). Don't generate a domain: it doesn't serve the public.
3. **Variables:** the same shared ones as web (`DATABASE_URL`, the bucket values, `TRUECUT_ENCRYPTION_KEY`, and `ANTHROPIC_API_KEY` / `ELEVENLABS_API_KEY` if you use server keys). It doesn't need the Google or NextAuth values. **The encryption key must be identical on both services**, or the worker can't open saved keys.

Optional worker settings:

| Variable | Default | What it does |
|---|---|---|
| `TRUECUT_RENDER_SLOTS` | `1` | renders at once per worker |
| `TRUECUT_WORKER_CONCURRENCY` | `3` | jobs at once per job kind (Nick turns, ingest, voice…) |
| `TRUECUT_WORKERS` | half the CPUs, max 6 | Chromium pages per render |
| `TRUECUT_SHUTDOWN_GRACE_SECONDS` | `300` | how long a deploy waits for running jobs to finish |

## 5. Deploy and check

Deploy both services. On each web deploy Railway first runs the database migrations (`truecut migrate`), then starts the app once `/api/health` answers.

- Open the web URL: you should land on the TrueCut sign-in page.
- Sign in, paste a website, and watch Nick work. The worker's **Deploy Logs** show `[worker] listening for …` and each job.
- `https://<web-url>/api/health` shows which pieces are ready (database, ffmpeg, keys present or not). It never shows key values.

## After the first deploy

1. **Sign in first.** The first person to sign in becomes the workspace owner.
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
| Sign-in page says "isn't set up" | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, or the `NYLAS_*` values, and `NEXTAUTH_SECRET` on web |
| "We couldn't send the email" | web Deploy Logs show `[signin] email not sent: Nylas …` with the reason (bad key, unverified domain, mailbox disconnected) |
| Email link says "expired or already used" | links last 15 minutes and work once; only the newest 3 per address stay valid |
| Google says *redirect_uri_mismatch* | the redirect URI in Google must be exactly `<NEXTAUTH_URL>/api/auth/callback/google` |
| "That account isn't on the TrueCut team" | `ALLOWED_EMAIL_DOMAINS` / `ALLOWED_EMAILS` |
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
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | web | required hosted | sign-in |
| `ALLOWED_EMAIL_DOMAINS`, `ALLOWED_EMAILS` | web | nobody | who may sign in |
| `NYLAS_API_KEY`, `NYLAS_API_URI`, `NYLAS_SEND_DOMAIN` + `EMAIL_FROM` or `NYLAS_GRANT_ID` + `NYLAS_MAILBOX_EMAIL` | web | email links off | sign-in links by email |
| `TRUECUT_WORKSPACE_NAME` | web | `AI Xccelerate` | the team workspace's name |
| `TRUECUT_RENDER_SLOTS`, `TRUECUT_WORKER_CONCURRENCY`, `TRUECUT_WORKERS` | worker | 1, 3, auto | throughput per worker |
| `TRUECUT_SHUTDOWN_GRACE_SECONDS` | worker | 300 | finish running jobs on deploy |
| `TRUECUT_ELEVEN_USD_PER_1K_CHARS`, `TRUECUT_ELEVEN_USD_PER_MINUTE` | both | 0 | optional ElevenLabs cost estimates on the Usage page (plans differ) |
| `TRUECUT_ALLOW_PATHS` | both | off with a bucket | folder-path sources on a self-hosted box |
