# TrueCut Capture (Chrome extension)

Captures real product screens (including pages behind a login) into the team's TrueCut Library.

- **Visible area** (Alt+Shift+S), **Select an area** (Alt+Shift+A), or **Full page** (scrolls and stitches, up to 20 screens).
- An editor opens with each capture: drag over personal data to **blur** it (pixelated into the image before upload), set title, product and tags, then **Save to Library**.
- Unsaved captures stay in the extension (IndexedDB) until they upload, so a dropped connection loses nothing. The toolbar badge shows how many are waiting.

## Install (team)

1. Download `truecut-capture.zip` from TrueCut → Settings → Capture extension, and unzip it.
2. `chrome://extensions` → Developer mode → **Load unpacked** → the unzipped folder.
3. Click the TrueCut icon → paste your TrueCut address and a token from Settings → **Connect**.

## How it talks to TrueCut

- `GET /api/ext/me` and `POST /api/ext/captures` with `Authorization: Bearer tc_…` (a personal access token; revocable in Settings, stored hashed on the server).
- Permissions: `activeTab` (capture only the tab you clicked on, when you click), `scripting` (the area selector and full-page scroll), `storage`, and host access to your TrueCut address only (asked for once, when you connect).
- URLs are saved with secrets stripped (query parameters like `token`, `code`, `session` are redacted on the server).

No build step: the files in this folder are the extension. `npm run build:extension` zips it into `apps/web/public/downloads/`.
