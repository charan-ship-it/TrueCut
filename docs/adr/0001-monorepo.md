# 0001: One repo, npm workspaces

**Status:** accepted, October 2026

## Context

TrueCut started as one Next.js app with everything in `lib/`. Going multi-user needs a second process (the worker) that runs the same pipelines without the web app around it.

## Decision

- `apps/web` and `apps/worker` are the deployable services.
- Everything they share is a package under `packages/` (`core`, `engine`, `shared`, `db`, `queue`, `storage`, `config`), imported as `@truecut/<name>`.
- Packages ship TypeScript source. Next.js compiles them (`transpilePackages`), and the worker and the tools run them with `tsx`. There is no separate build step per package.
- One `Dockerfile` builds an image that runs either service (`truecut web` / `truecut worker`).

## Consequences

- A change to a pipeline is one commit that both services pick up.
- Dependency direction is fixed: `config` ← `shared`/`engine` ← `db`/`storage` ← `queue` ← `core` ← apps. Nothing in `packages/` imports from `apps/`.
- No Turborepo or Nx. With two apps, npm workspaces are enough; revisit if builds get slow.
