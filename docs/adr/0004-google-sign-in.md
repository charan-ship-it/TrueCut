# 0004: Google sign-in for the team

**Status:** accepted, October 2026

## Context

TrueCut is for the AIX team first, and may later live inside AIX Core. Everyone already has a Google Workspace account.

## Decision

- Auth.js (next-auth v4) with the Google provider and signed JWT session cookies. There is no sessions table.
- Only verified addresses at `ALLOWED_EMAIL_DOMAINS`, or listed in `ALLOWED_EMAILS`, may sign in. With neither set, nobody can (fail closed). In Google Cloud the OAuth app is *Internal* to the Workspace as a second fence.
- Middleware protects every page and API route. Project routes also check that the project is in the user's workspace.
- Each sign-in upserts the user and adds them to the single team workspace (`ws_default`). The first person to sign in becomes its owner. Projects and jobs record `created_by`.
- Sign-in is on whenever `GOOGLE_CLIENT_ID` is set, on Railway, and in the Docker image. On a laptop without Google keys it is off. `TRUECUT_AUTH=off` forces it off, `required` forces it on.

## Consequences

- Teammates share every project in the workspace, which is what the team wants today.
- The data model already has workspaces and memberships, so an AIX Core integration can map organisations onto workspaces and swap the provider (or accept AIX Core's tokens) without touching the pipelines.
