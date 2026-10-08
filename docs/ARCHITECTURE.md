# TrueCut — architecture

## Overview

```
Next.js 14 (App Router, Node runtime) ──────────────┐
  UI: components/Workspace + panels + Preview        │   same code renders preview and video
  API: app/api/**  ──► lib/actions ──► lib/jobs ───┐ │
                                                    ▼ ▼
 lib/ingest  (Playwright crawl + screenshots, fs scan, uploads)
 lib/ai      (Anthropic: analyze → facts/visuals/questions; storyboard; revise — forced tool output)
 lib/facts   (quote verification + number guard)          public/engine/
 lib/voice   (ElevenLabs with-timestamps, cached)           timeline.js  pure timing/captions/cues
 lib/synth   (procedural score + SFX, TS DSP)               runtime.js   scene library → DOM, render(t)
 lib/audio   (decode VO via ffmpeg, mix, WAV)               player.html  preview (postMessage) / render (window.__COMP__)
 lib/render  (static server + N Chromium pages → ffmpeg segments → concat → mux + loudnorm)
 lib/store   (file store: data/projects/<id>/project.json + folders)
```

## Key decisions

| Decision | Why |
|---|---|
| **The HTML/CSS/JS engine is rendered frame by frame in headless Chromium** (no Remotion or After Effects) | Deterministic `render(t)` means identical preview and output. There are no licence constraints (Remotion needs a paid licence above 3 employees). Real product UI and screenshots compose naturally in the DOM |
| **The engine is plain ES modules in `public/engine`** | One copy serves the browser preview, the renderer and the Node side (timeline cues, captions, tests) |
| **Timeline is a pure function** of the composition (`layout(comp)`) | Scene durations, cut points, caption word times and sound cues all derive from one place. The audio and the picture can't drift |
| **Forced tool output** for every Claude call | Structured JSON every time, validated with zod and normalised (`normalizeScene`) |
| **Fact guard outside the model** | Hallucination control is mechanical: verbatim quote match, plus "every number in a scene must appear in an approved fact" |
| **ffmpeg and ffprobe via npm (`ffmpeg-static`)** | No system install, same binary on every Mac or Linux box |
| **File-based store** | Local-first, zero infrastructure, easy to inspect, back up and git-ignore. Atomic writes |
| **In-process job runner** with a serial queue for heavy jobs | Simple and good enough for a single-user local tool. Swap for BullMQ and Redis when hosted |
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
- **Cues:** `layout().cues` lists whooshes before cuts, riser and impact around the reveal, ticks for counters, typing, clicks, stamps, gauge blips and the sting. `lib/synth` turns these into sound.

## Rendering pipeline

1. Build the soundtrack WAV. It is cached by a hash of the timeline and voice files.
2. Start a local static server: `/engine/*` and `/p/*` (the project folder).
3. Open N Chromium pages. N defaults to half the CPU cores, max 6, or `NICK_MOTION_WORKERS`. Each page gets the composition via `addInitScript` and owns a contiguous frame range: it calls `render(f/30)`, takes a JPEG screenshot and pipes it to its own ffmpeg (`mjpeg → libx264 crf 17`).
4. Concat the segments with `-c copy`, then mux the WAV with `loudnorm I=-14 TP=-1.5`, AAC 256k and faststart.
5. Write the `.srt` from the caption word timings and `*_FACTS.md` from the scenes plus facts.

## Data model

See `lib/types.ts`: Project → sources, visuals, facts, questions, product, intake, brief, scenes, music, renders. Everything lives in `data/projects/<id>/project.json`, and binary files sit next to it.

## Extending

- **New scene type:**
  - Add the renderer to `SCENES` in `public/engine/runtime.js`.
  - Add bounds and a description to `SCENE_TYPES` and its cues to `buildCues` in `timeline.js`.
  - Add the prop spec to `SCENE_SPEC` in `lib/ai.ts`.
  - Add the enum value in `lib/types.ts`.
- **New source type:** add an `ingestX` in `lib/ingest.ts` and a branch in `lib/actions.ts`.
- **Hosting:**
  - Move `lib/store` to Postgres or S3 and `lib/jobs` to BullMQ.
  - Run renders on a worker with Chromium and the bundled ffmpeg.
  - Add auth in front of `app/api`.

## Security notes

- File serving and every project path go through `projectPath()`, which refuses anything outside the project folder.
- Folder ingestion reads only text and image files, skips dot-folders and build output, and copies images into the project.
- API keys are read from env. `NICK_MOTION_ENV_FILES` imports only `ANTHROPIC_API_KEY` and `ELEVENLABS_*` from other env files.
