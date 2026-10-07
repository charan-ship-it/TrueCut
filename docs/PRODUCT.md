# Truecut — product spec (v0.1)

_Last updated 2026-10-07._

## 1. Problem

B2B teams need short, scroll-stopping video for LinkedIn and Instagram. Today they pick from three options, and all three fail:

- **Agencies and motion designers** are slow and expensive. They also don't know the product, so they ask for everything.
- **Template tools** look generic, and their stock "dashboards" are fake.
- **Gen-AI video** hallucinates logos, UI and numbers, which is unusable for a product that has to be accurate.

The raw material for great product video already exists: the website, the repo, real screenshots, real metrics and real customer and founder lines. Nobody turns it into motion fast **without making things up**.

## 2. Product

Truecut turns a URL, a repo or folder, uploads or pasted notes into a 15–45 second motion-graphics ad. It works in five steps:

1. It reads the material and captures real visuals.
2. It extracts verifiable facts.
3. It asks the customer only what it cannot know.
4. It writes the creative.
5. It voices, scores and renders the video.

The promise, in one line: **"A video that only says what's true — in an afternoon, not a month."**

## 3. Users

| User | Job | What they need from us |
|---|---|---|
| **Marketer** at a B2B SaaS company (primary) | Ship launch, feature and brand videos every month | A first cut in minutes, full control over every line, nothing that legal or the founder will reject |
| **Founder** | "We need a video for the launch tomorrow" | Paste the URL, answer 4 questions, get a video |
| **Agency / AIX team** (internal) | Produce videos for many clients | Repeatable projects, a scene library, brand per client, CLI for batch runs |

## 4. Principles

1. **No fake data.** Every number and claim traces to a source quote. The fact guard blocks a render if any number is untraced. An override exists, it is explicit, and it is recorded in the ledger.
2. **Real visuals over generated ones.** Use the product's own screenshots, logos and records, rebuilt crisp as motion graphics. Never AI-generate a UI or a logo.
3. **Ask only what the sources can't answer.** Questions are generated per project, and every one comes with a suggested answer.
4. **Preview is the render.** The editor's live player is the same code the renderer captures frame by frame. What you scrub is what you ship.
5. **Every second is alive.** Cuts sit on a 120 BPM grid. Something moves in every frame: counters, typing, scans, a HUD status line and word-by-word captions. Sound effects follow the motion.
6. **Human in charge.** The AI drafts, the human approves facts, edits scenes and signs off on the render.

## 5. Scope

### In v0.1 (shipped)

- **Sources**
  - URL crawl (up to 4 priority pages), real screenshots, logo, `og:image` and brand colour
  - Local folder and repo scan (docs, README, transcripts, screenshots; skips build folders)
  - File uploads (images, md/txt/csv/vtt/html) and pasted text
- **AI analysis** (Claude, vision included)
  - Product summary and risk list ("don't claim")
  - 15–40 atomic facts with verbatim quotes, each verified by string match
  - Visual descriptions plus a focus region per visual
  - 3–7 customer questions with suggested answers
- **Brief**
  - Brand, product, one-liner, audience, tone, goal, CTA and URL, byline, must say / must avoid
  - Length (15/30/45 s), formats (4:5, 9:16, 1:1), accent colour, hero image, voice picker (ElevenLabs voices), data label
- **Storyboard** (Claude)
  - Creative brief (concept, insight, proposition, hook)
  - Scenes drawn from a 12-type scene library, each with one voice line, an optional caption, a HUD status and fact ids
- **Editor**
  - Edit each scene's voice, caption, status, duration, type and content (JSON)
  - Reorder, duplicate, delete and add scenes
  - Revise a scene with AI from a plain-language instruction
  - Live preview with play, scrub, a format switch and scene jumps
  - Fact check panel
- **Voice-over:** ElevenLabs with character timestamps → word-timed captions. Cached per line.
- **Music and sound design:** an original procedural score timed to the storyboard, with ducking. Can be switched off.
- **Render**
  - 1080-wide H.264/AAC at −14 LUFS, in 4:5, 9:16 (Reels-safe layout) and 1:1
  - Parallel workers
  - Also outputs an `.srt` file and a facts ledger (`*_FACTS.md`)
- **Jobs:** background jobs with progress and logs. Heavy jobs are serialised.
- **CLI:** `make` (source → video in one command, interactive or `--yes`), `render`, `seed:demo`, `doctor`, `setup`.
- **Demo project:** Agent Nick, built from real AIX product screenshots.

### Explicitly out of v0.1

- **Multi-user, auth and cloud hosting.** It runs locally, and projects are files under `data/`.
- **16:9 / YouTube layout.** The scene library is designed for vertical and feed formats.
- **Custom fonts and brand kits beyond accent colour + hero image + logo.** Fonts are Geist, Inter and JetBrains Mono.
- **Licensed music library, uploaded music, voice cloning.**
- **Direct publishing to LinkedIn or Instagram.**
- **Logged-in or app-only screens.** The crawler sees only public pages. Upload screenshots of the app instead.
- **PDF ingestion.** Paste the text, or upload screenshots of the pages.

## 6. User flow (UI)

1. **Home → New video.** Paste a URL, give a folder path or paste notes, then choose **Read it and start**. The project opens and ingestion runs.
2. **Sources.** Watch ingestion, add more sources, and toggle which visuals are allowed. Choose **Analyse sources**.
3. **Facts & visuals.** Review the product summary and the "don't claim" risks. Approve or reject facts and confirm the "needs check" ones. Add your own facts, then mark the hero image.
4. **Brief.** Fill in the gaps and answer the AI's questions, then choose **Write the storyboard**.
5. **Storyboard.** Read the brief, fix fact-check issues, edit scenes or ask AI to revise one, and preview live.
6. **Voice & music.** Generate the voice-over, listen to each line, and build the soundtrack. The preview now plays with sound.
7. **Render.** Pick formats and render. Then watch, download the MP4, the `.srt` and the facts ledger.

## 7. Success metrics

- **Time to first cut:** target under 10 minutes from URL to rendered 30 s video, on a laptop with keys set.
- **Untraced numbers in shipped renders:** 0. Track how often the override is used.
- **Edit depth:** the share of scenes edited before render. High means the AI drafts are weak.
- **Re-render rate per project:** how many iterations it takes to get to a keeper.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| The AI invents a number | Quote verification, the number guard on every scene, a render block, and the ledger |
| A site blocks headless browsers or needs a login | Fall back to uploads and paste. The error is shown per source |
| Facts read off screenshots can't be string-verified | They are marked "needs check" until a human confirms them |
| Long renders on small laptops | Parallel workers (half the cores), a progress bar, CLI batch runs |
| Brand mismatch | Accent colour from the site, hero image and logo selection, and an editable tone |
