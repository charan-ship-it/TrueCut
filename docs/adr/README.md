# Decisions

Short records of the choices that shape TrueCut's code: what was decided, why, and what it costs.
Add one when a change would surprise someone reading the code later. Number them in order and never rewrite an old one: write a new record that supersedes it.

| # | Decision |
|---|---|
| [0001](0001-monorepo.md) | One repo with npm workspaces: `apps/` for services, `packages/` for code they share |
| [0002](0002-postgres-job-queue.md) | Postgres for both the data and the job queue (pg-boss), no Redis |
| [0003](0003-bucket-with-local-working-folder.md) | Files in an S3-compatible bucket; each job works in a local copy |
| [0004](0004-google-sign-in.md) | Google sign-in limited to the team's domain; one team workspace for now |
