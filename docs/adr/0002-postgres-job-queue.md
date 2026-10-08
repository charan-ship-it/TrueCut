# 0002: Postgres for data and the job queue (no Redis)

**Status:** accepted, October 2026

## Context

Hosted, several people use TrueCut at once, and deploys restart services. Jobs (Nick turns, transcription, renders) take from seconds to many minutes and must survive a web restart, run on a separate worker, and report progress to any web instance.

The usual answer is BullMQ on Redis. That adds a service to run and pay for, and a second source of truth next to the database.

## Decision

- **Projects** are rows in Postgres. The whole project document is one `jsonb` column, so the pipelines, which read and write a project object, didn't have to change shape. `updateProject` reads and writes under `SELECT … FOR UPDATE`, so concurrent updates from the web app and workers never lose a write.
- **Job records** (`jobs` table) hold status, progress, log and a heartbeat. The UI reads these.
- **Delivery** uses [pg-boss](https://github.com/timgit/pg-boss) in the same database (schema `pgboss`): one queue per job kind, no automatic retries (jobs are not idempotent; the user retries), and a long expiry for renders.
- A running job sends a heartbeat every 15 s. One that goes quiet for 90 s counts as dead: the UI stops showing it as busy, and the worker's reaper marks it failed.

## Consequences

- One stateful service to back up and monitor instead of two.
- Throughput is far beyond a team's needs. Postgres-backed queues handle thousands of jobs per second; TrueCut runs a few per minute.
- If TrueCut ever needs very high fan-out or cross-service events, swap the driver in `packages/queue/src/boss.ts`. Handlers and callers don't change.
