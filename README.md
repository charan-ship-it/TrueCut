# TrueCut

**Drop a link. Get a film.** TrueCut is a chat-first studio that turns real material into short, motion-rich videos for LinkedIn and Instagram, and never puts anything on screen it can't trace back to a source.

Two kinds of video, one conversation with **Nick**, the AI director:

| Mode | You give it | You get |
|---|---|---|
| **Motion ad** | A website URL, a repo or folder path, docs, screenshots or notes | A 15–60s motion-graphics ad. Nick pitches three creative angles, writes the storyboard from verified facts, then voices, scores and renders it. |
| **Founder talk** | A podcast, interview or talking-head recording (`.mp4 .mov .mp3 .wav .m4a`…) | An edited short. Nick transcribes it, keeps the strongest moments, cuts the dead air, and designs an animated illustration for every beat over the speaker. |

The rule in both modes: **every number and claim on screen traces to a source.** That means the site, the repo, your notes, or the words the speaker actually said. Anything Nick can't verify stays off screen unless you approve it.

---

## Quick start (your laptop)

You need Node 22 and Postgres 16 (`brew install postgresql@16`, or `docker compose up -d db`).

```bash
npm run setup          # deps, headless Chromium, .env.local, database, demo project, health check
npm run dev            # → http://localhost:3100
```

Locally everything runs in one process and files stay in `data/`. Sign-in is off until you set the Google keys.
The full guide, including running the worker and a bucket locally, is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

### Keys (`.env.local`)

| Key | Powers | Without it |
|---|---|---|
| `DATABASE_URL` | Projects, chat, jobs, users | Required |
| `ANTHROPIC_API_KEY` | Fact extraction, angles, storyboards, the founder-talk edit, chat edits | Rule-based fallbacks |
| `ELEVENLABS_API_KEY` | Voice-over for ads, **Scribe transcription** for founder talks | Ads get music and captions only. Talks need a transcript. |

To reuse keys that already live elsewhere, point TrueCut at those files. Only the API keys are read from them, and nothing is copied:

```bash
TRUECUT_ENV_FILES=../linkedin-nick/.env,../agent-nick/.env.local
```

Every setting is listed in [.env.example](.env.example).

### For the team (hosted)

TrueCut runs on Railway as two services from one image: **web** (UI + API) and **worker** (Nick turns, transcription, voice, renders), with Postgres for data and the job queue and a bucket for files. Team members sign in with their Google work account.
Step-by-step: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Using it

1. **Home:** paste a URL or path, drop files, or click **Edit a founder talk**. Options under the box set the type, length, formats and look. Type `/` for commands.
2. **The chat:** Nick works in the open. A live checklist shows what he's doing, and he replies with cards:
   - What he read, with screenshots.
   - A **fact ledger** where you tick what's allowed on screen.
   - A pre-filled **brief**.
   - **Three creative angles**.
   - A storyboard or **edit** strip.
   - **Look tiles**: hover one to preview it live on the monitor.
   - The finished renders.
3. **Ask for changes in plain words:** "punchier hook", "cut a 30s version", "start on the tribal knowledge bit", "switch to overlay layout", `/direction neon`, `/render`.
4. **Monitor:** the sticky preview player, with a timeline split by scene or beat and a 4:5 / 9:16 / 1:1 switch. **Edit bay** opens every setting by hand.

### Founder talk, step by step

```
recording ──► Scribe transcript ──► Claude's edit ──► cut + crop ──► illustrated beats ──► composite + mix
 mp4/mov/mp3   word timings,        keep ranges,      ffmpeg, face-     motion toolkit       Chromium renders the
               speakers             beats, visuals    centred crop      (14 primitives)      panel with alpha → ffmpeg
```

- **Layouts:**
  - **Split**: illustrations on top, speaker below. Built for 9:16.
  - **Overlay**: speaker full-frame, graphics float over.
- **Motion toolkit:** cards, icon grid, dashboard bars, meter, app window, chat bubbles, brand reveal, big number, quote, list, before/after, flow, orbit, real screenshot. Each beat gets a headline with one accent word, plus a subline.
- **Audio:** the speaker's own voice, a quiet generated bed (lo-fi, piano or ambient) ducked under it, soft beat ticks, loudness-normalised to −14 LUFS.

---

## CLI

```bash
npm run make -- --url https://yourproduct.com --length 30 --formats 4x5,9x16
npm run make -- --path ../agent-nick --text call-transcript.md --cta "Book a demo"
npm run render -- <projectId> --formats 9x16
npm run seed:demo        # the Agent Nick example (real AIX data, only on machines that have it)
npm run doctor           # ffmpeg, Chromium, Postgres, keys, data folder
npm run db:migrate       # apply database migrations
npm run db:import        # copy old data/projects/*/project.json into Postgres
npm test                 # unit + integration tests (uses a local truecut_test database)
```

## Repository layout

```
apps/
  web/          Next.js app: chat UI, API routes, Google sign-in
  worker/       background job runner (pg-boss consumer)
packages/
  core/         the pipelines: sources, ads (facts, storyboard, casting), talk, audio, render, Nick (director)
  engine/       the deterministic renderer (runtime.js, talk.js, styles.js), shared by preview and render
  shared/       types, fact guard, composition helpers (safe in the browser)
  db/           Postgres schema, migrations, projects/jobs/users
  queue/        enqueue + job handlers (inline or pg-boss)
  storage/      project files: local folder, synced with an S3-compatible bucket
  config/       environment loading
tools/          CLI scripts, setup, test helpers
docs/           architecture, development, deployment, decisions (adr/)
```

How the pieces fit: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Why they are built this way: [docs/adr](docs/adr).

Keys and `.env*` files are never committed. Project data lives in Postgres and the bucket (or `data/` locally), never in git.
