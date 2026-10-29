# 0005: Sign-in and access through AIX Core

**Status:** accepted, October 2026. Supersedes [0004](0004-google-sign-in.md).

## Context

TrueCut is now an AIX agent. Every AIX agent signs people in through Core's single Clerk app and lets Core decide who may use it. Keeping our own Google sign-in, email links and allowlist would mean a second identity system and a second answer to "who has access".

## Decision

- Core's Clerk session (shared on `*.aiworkforce.md`) is the only sign-in. `@clerk/nextjs` middleware protects every page and API route; signed-out visitors go to Core's login.
- On every authenticated request TrueCut calls Core's `GET /api/v1/agents/truecut/access` with the person's token and refuses unless `has_access` is true. Core being down or not knowing TrueCut is a 503. Answers are cached for at most 60 seconds.
- The Clerk organisation in the token is the workspace: workspace id = Clerk org id, created the first time a member arrives (`mirrorCoreIdentity`). Users are matched by email, so people who used TrueCut before keep their projects. Core owners and admins are workspace owners; Core members are members. Core is the authority, so the role follows the token on each call.
- No webhooks, no Clerk dashboard changes, no access tables of our own, as the integration guide requires.
- A person can still be switched off inside TrueCut (Settings → Team), which stays local.
- With no Clerk keys (a laptop), sign-in is off and everyone is the "Local" user. `TRUECUT_AUTH=off` forces it off, `required` forces it on.
- Clerk 6, not 7: TrueCut is on Next 14 and Clerk 7 needs Next 15 or later. Nick's frontend (Next 16) uses 7.

## Consequences

- Invites, roles and who belongs to a team now live in Core. The invite and email-link code, and the Google and NextAuth settings, are gone. The `member_invites` and `email_tokens` tables stay until a cleanup migration.
- Extension tokens have no Core session to forward, so Core membership changes don't revoke them (a Settings → Team switch-off does).
- Projects made under the old single workspace (`ws_default`) are not visible to Core organisations. Moving them is a one-off data job, decided before production, not needed for staging.
- Next.js bakes `NEXT_PUBLIC_*` at build time, so the Docker image takes the Clerk publishable key and the Core app URL as build args.
