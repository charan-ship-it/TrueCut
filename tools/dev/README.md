# Developer helpers

Scripts for checking how things look while working on the engine. None of them run in production or CI.

| Script | What it does |
|---|---|
| `qa-directions.mjs [outDir] [format] [presets]` | One frame per scene for every creative direction, as a contact sheet per direction. Use it after changing `packages/engine/src/styles.js`. |
| `dev-stills.mjs <comp.json> <format> <t1,t2,…> <outDir>` | Still frames of one composition at given times. |
| `ui-shot.mjs <url> <out.png> [w] [h] [waitMs]` | A screenshot of a page in the running app. |
| `talk-test.ts <video> <stt.json> [plan.json] [formats]` | Builds and renders a founder-talk project from a recording and an ElevenLabs transcript. |

Run them from the repo root, e.g. `node tools/dev/qa-directions.mjs /tmp/qa 4x5`.
