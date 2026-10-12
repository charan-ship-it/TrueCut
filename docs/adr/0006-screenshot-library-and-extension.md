# 0006: A team screenshot library, fed by a Chrome extension

**Status:** accepted, October 2026

## Context

The crawler only sees public pages. The screens that sell a product (dashboards, inboxes, editors) are behind a login, so videos were missing the real product.

## Decision

- **A workspace-wide Library** (`library_assets`) of screenshots, kept apart from projects so one shot serves many videos. Files live at `library/<workspace>/<id>.<ext>` in the bucket (or under `TRUECUT_DATA` locally).
- **Captured with a Chrome extension** (`apps/extension`, Manifest V3, no build step): visible area, a dragged area, or the full page (scroll and stitch, up to 20 screens). An editor opens for every capture, where people blur personal data. The blur is pixelated into the image before upload, so the original never leaves the computer. Unsent captures wait in IndexedDB and retry.
- **The extension authenticates with personal access tokens** (`tc_…`, SHA-256 hashed in `api_tokens`, revocable, 180-day default expiry). It only asks Chrome for access to the one TrueCut address it connects to, plus `activeTab`.
- **Claude reads each shot once** (job `library_read`): a summary, the visible text, numbers with the exact on-screen text they came from (kept only if that text really appears), and whether personal data is readable. Flagged shots aren't used on screen until someone confirms they're fine.
- **Nick uses it automatically:** when a video's sources include a site, shots from that domain are attached before facts are extracted. Each becomes a visual plus a source whose text is the shot's transcript, so its numbers pass the same fact guard as everything else. Shots matching the product name are offered with a card.
- URLs are stored with secret-looking query parameters redacted, and identical images are de-duplicated per workspace.

## Consequences

- Distribution starts as a zip from Settings (load unpacked). Publishing to the Chrome Web Store (private to the Google Workspace) is the next step when the team is happy with it.
- Reading a screenshot costs roughly 2k tokens (about $0.01 on Opus 5.5).
