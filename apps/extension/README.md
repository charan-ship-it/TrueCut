# TrueCut Capture (Chrome extension)

Captures real product screens (including pages behind a login) into the team's TrueCut Library.

- **Visible area** (Alt+Shift+S), **Select an area** (Alt+Shift+A), or **Full page** (scrolls and stitches, up to 20 screens).
- An editor opens with each capture: drag over personal data to **blur** it (pixelated into the image before upload), set title, product and tags, then **Save to Library**.
- Unsaved captures stay in the extension (IndexedDB) until they upload, so a dropped connection loses nothing. The toolbar badge shows how many are waiting.

## Install (team)

1. Download `truecut-capture.zip` from TrueCut → Settings → Capture extension, and unzip it.
2. `chrome://extensions` → Developer mode → **Load unpacked** → the unzipped folder.
3. Click the TrueCut icon → **Connect to TrueCut**. A TrueCut tab opens; confirm, and the extension is paired (the page hands it a token directly, so there is no address or token to type). "Use a token instead" in the popup still works.

The manifest carries a fixed `key`, so the extension keeps the same ID (`mjjgakmkfgababllinaggabmhfjmdlkd`) however and wherever it is loaded. Without it Chrome derives the ID from the folder path, every re-download got a new ID and a new, empty storage, and the sign-in was lost each time.

## How it talks to TrueCut

- `GET /api/ext/me` and `POST /api/ext/captures` with `Authorization: Bearer tc_…` (a personal access token; revocable in Settings, stored hashed on the server).
- Permissions: `activeTab` (capture only the tab you clicked on, when you click), `scripting` (the area selector and full-page scroll), `storage`, and host access to your TrueCut address only (asked for once, when you connect).
- URLs are saved with secrets stripped (query parameters like `token`, `code`, `session` are redacted on the server).

No build step: the files in this folder are the extension. `npm run build:extension` zips it into `apps/web/public/downloads/`.
