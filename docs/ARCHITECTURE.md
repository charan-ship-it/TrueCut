# TrueCut — architecture

## Overview

```
 browser ──► apps/web (Next.js 14: UI + API, Google sign-in)
               │  writes project changes + job rows          reads/serves files
               ▼                                                   ▲
            Postgres ── projects (jsonb document), users,          │
               │        workspaces, jobs (progress/log)       S3-compatible bucket
               │        pg-boss queue (schema "pgboss")      projects/<id>/{assets,sources,talk,vo,audio,renders}
               ▼                                                   ▲
            apps/worker ── hydrate project folder ── run handler ── flush changes ┘
                           (packages/core pipelines: Playwright, Claude, ElevenLabs, ffmpeg, Chromium render)
```

- **apps/web** never does slow work in a request. It saves edits, posts the user's chat message and enqueues a job.
- **apps/worker** takes jobs off the queue. Before each job it brings the project's folder up to date from the bucket, runs the handler with the same file-based pipelines as before, and uploads what changed (also every 15 s while the job runs, so screenshots appear live).
- **The UI polls** the project (`/api/projects/:id`) and jobs. Progress lives in the job row; the chat's live checklist lives in the project document.
- **Locally** (`TRUECUT_QUEUE=inline`, no bucket) the web app runs the handlers itself and files stay in `data/`. It is the same code with no infrastructure.

### Packages

| Package | Owns | Depends on |
|---|---|---|
| `@truecut/config` | env loading (`env()`, `config`) | nothing |
| `@truecut/shared` | types (zod), fact guard, composition helpers; browser-safe | engine |
| `@truecut/engine` | `runtime.js`, `talk.js`, `styles.js`, `timeline.js`, player; served to the browser and to the renderer | nothing |
| `@truecut/db` | schema, migrations, `getProject`/`updateProject` (row-locked), jobs, users, workspaces | config, shared |
| `@truecut/storage` | project folder paths, bucket driver, hydrate/flush | config |
| `@truecut/queue` | `defineHandler`, `enqueue`, `runJob`, the pg-boss driver | db, storage |
| `@truecut/core` | every pipeline and Nick; registers the job handlers | all of the above |
| `apps/web`, `apps/worker` | the two services | core and the rest |

### Job kinds

| Kind | Started by | Does |
|---|---|---|
| `nick` | every chat message or card click | one Nick turn: intake → facts → questions → angles → storyboard → voice → render, as far as the turn goes |
| `ingest` | Edit bay: add a link, path, text or upload | read one source |
| `analyze`, `storyboard`, `revise`, `voice`, `audio`, `render` | Edit bay buttons | one pipeline step |

Renders hold a render slot (`TRUECUT_RENDER_SLOTS`) however they were started. A job whose worker stops sending heartbeats for 90 s is marked failed so the UI stops waiting.

### Data

- `projects.data` holds the full project document (`packages/shared/src/types.ts`: sources, visuals, facts, questions, intake, brief, scenes, cast, talk, renders, chat). The columns beside it (`name`, `stage`, `summary`, `workspace_id`, `created_by`) exist for listing and access.
- Files are addressed by a path relative to the project folder (`assets/v1.jpg`) everywhere: in the document, in the bucket (`projects/<id>/assets/v1.jpg`) and on disk.
- Users belong to workspaces through `memberships`. Today there is one workspace for the team; projects already carry a `workspace_id`, so a later AIX Core integration can map its organisations onto workspaces.

## Key decisions

| Decision | Why |
|---|---|
| **The HTML/CSS/JS engine is rendered frame by frame in headless Chromium** (no Remotion or After Effects) | Deterministic `render(t)` means identical preview and output. There are no licence constraints (Remotion needs a paid licence above 3 employees). Real product UI and screenshots compose naturally in the DOM |
| **The engine is plain ES modules in `packages/engine`** (copied to `apps/web/public/engine` at build) | One copy serves the browser preview, the renderer and the Node side (timeline cues, captions, tests) |
| **Timeline is a pure function** of the composition (`layout(comp)`) | Scene durations, cut points, caption word times and sound cues all derive from one place. The audio and the picture can't drift |
| **Forced tool output** for every Claude call | Structured JSON every time, validated with zod and normalised (`normalizeScene`) |
| **Fact guard outside the model** | Hallucination control is mechanical: verbatim quote match, plus "every number in a scene must appear in an approved fact" |
| **ffmpeg and ffprobe via npm (`ffmpeg-static`)** | No system install, same binary on every Mac or Linux box |
| **Postgres document per project** | One jsonb document keeps the pipelines unchanged; a row lock per update means the web app and workers never overwrite each other ([ADR 0002](adr/0002-postgres-job-queue.md)) |
| **pg-boss queue in the same Postgres** | Durable jobs and a separate worker without running Redis ([ADR 0002](adr/0002-postgres-job-queue.md)) |
| **Bucket + local working folder** | ffmpeg and Chromium need real files; the bucket makes them shared and durable ([ADR 0003](adr/0003-bucket-with-local-working-folder.md)) |
| **Procedural score** instead of stock music | Synced to cuts and the reveal by construction. Nothing to license |

## Composition format (what the engine renders)

```jsonc
{
  "title": "…",
  "brand": { "name": "AIX", "product": "Agent Nick", "accent": "#F47920", "hudImage": "nick", "hudPre": "AIX", "hudName": "Agent Nick", "hudSub": "Live data · Sep 2026" },
  "assets": { "<visualId>": { "url": "assets/v123.jpg" } },     // resolved against assetBase
  "captions": true,
  "scenes": [
    { "id": "s1", "type": "stat", "vo": { "text": "…", "duration": 1.85, "words": [{ "w": "One", "s": 0, "e": 0.2 }] },
      "caption": "189 meetings.", "status": "Scoring 457 ideas", "duration": null, "props": { … }, "facts": ["f1"] }
  ]
}
```

- **Durations:** `snap(voDuration + 0.25 lead + 0.55 tail)` to 0.5 s, clamped per scene type, unless the scene sets `duration`.
- **Reveal:** the first `reveal` scene is the musical drop. The camera shakes, a flash fires and the HUD switches to accent colour.
- **Scene-local time:** scenes after the first start 0.18 s "already moving" (`PRE`), so cuts never land on empty frames.
- **Cues:** `layout().cues` lists whooshes before cuts, riser and impact around the reveal, ticks for counters, typing, clicks, stamps, gauge blips and the sting. `packages/core/src/audio/synth.ts` turns these into sound.

## Rendering pipeline

1. Build the soundtrack WAV. It is cached by a hash of the timeline and voice files.
2. Start a local static server: `/engine/*` and `/p/*` (the project folder).
3. Open N Chromium pages. N defaults to half the CPU cores, max 6, or `TRUECUT_WORKERS`. Each page gets the composition via `addInitScript` and owns a contiguous frame range: it calls `render(f/30)`, takes a JPEG screenshot and pipes it to its own ffmpeg (`mjpeg → libx264 crf 17`).
4. Concat the segments with `-c copy`, then mux the WAV with `loudnorm I=-14 TP=-1.5`, AAC 256k and faststart.
5. Write the `.srt` from the caption word timings and `*_FACTS.md` from the scenes plus facts.

## Extending

- **New scene type:**
  - Add the renderer to `SCENES` in `packages/engine/src/runtime.js`.
  - Add bounds and a description to `SCENE_TYPES` and its cues to `buildCues` in `timeline.js`.
  - Add the prop spec to `SCENE_SPEC` in `packages/core/src/ads/ai.ts`.
  - Add the enum value in `packages/shared/src/types.ts`.
- **New source type:** add an `ingestX` in `packages/core/src/sources/ingest.ts` and a branch in the `ingest` handler (`director/actions.ts`) and in Nick's intake (`director/agent.ts`).
- **New background job:** `defineHandler('kind', fn)` beside the code, plus a `start*` helper that calls `enqueue`. The worker picks up every registered kind automatically.

## Security notes

- Every page and API route requires a signed-in member of an allowed domain (`apps/web/middleware.ts`), and project routes also check the project's workspace (`projectRoute`).
- File serving and every project path go through `projectPath()`, which refuses anything outside the project folder. Bucket links are signed and expire after an hour.
- Uploads are limited to the file types TrueCut can read, streamed to disk, never held in memory.
- Folder ingestion is off on a server. Locally it reads only text and image files and skips dot-folders and build output.
- API keys come from the environment. `TRUECUT_ENV_FILES` imports only `ANTHROPIC_API_KEY` and `ELEVENLABS_*` from other env files. Nothing secret is in the image or the repo.
