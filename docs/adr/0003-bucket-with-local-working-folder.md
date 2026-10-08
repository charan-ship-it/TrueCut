# 0003: Files in a bucket, a local working folder per job

**Status:** accepted, October 2026

## Context

A project's files (screenshots, uploaded recordings, transcripts, voice-overs, renders) were in `data/projects/<id>/` on one machine. ffmpeg, Chromium and Playwright need real files on disk. On Railway a volume attaches to one service only, so the web app and the worker can't share a disk, and replicas can't either.

## Decision

- The bucket (any S3-compatible store: Railway Buckets, AWS S3, R2, MinIO) is the shared, durable copy, at `projects/<id>/<path>`.
- Each worker keeps a **working folder** per project, the same layout as before. Around every job the runner:
  1. **hydrates**: downloads objects that are missing or changed, using a small manifest (`.truecut-sync.json`) of sizes and ETags;
  2. runs the handler unchanged;
  3. **flushes**: uploads files that changed (every 15 s during the job, and at the end), and deletes from the bucket only the files this folder knew about and the job removed. A job on another worker can add files without this one ever deleting them.
- The web app streams uploads to the bucket and serves files back: media by signed redirect (bucket egress is free on Railway and seeking works), text and JSON by proxy (no CORS setup needed).
- Without bucket variables, storage is the local folder only. That is the default for development.

## Consequences

- Pipelines kept their file-based code; there is no object-storage code inside them.
- A new worker downloads a project's files on its first job for it. For long recordings, an optional volume on the worker avoids repeating that after restarts.
- Two jobs editing the *same file* of one project at the same time on different workers would race (last upload wins). Nick runs one turn per project at a time, which avoids this in practice.
