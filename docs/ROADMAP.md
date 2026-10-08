# TrueCut — roadmap

## Done (v0.3)

- **Hosted multi-user:** Google sign-in for the team, Postgres, a job queue with a separate render worker, and bucket storage. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Next (v0.2)

- **Brand kit:** upload fonts (woff2), a logo lockup and secondary colours, with per-project brand presets.
- **Music:** upload your own track or pick a mood (tense, upbeat, calm). Allow BPM changes (the grid follows).
- **16:9 layout** for YouTube, website hero and sales decks.
- **Screenshot capture of logged-in apps:** provide a session cookie or Playwright storage state, then capture named routes.
- **Region picker:** draw the zoom/focus box on a screenshot instead of editing JSON.
- **Visual scene editor:** generate form fields from each scene's schema, with an inline image picker.
- **Versioning:** snapshot the storyboard per render and diff between versions.
- **A/B hooks:** generate 3 alternative openings and render each as a 6 s bumper.

## Later

- **AIX Core integration:** map AIX Core organisations onto TrueCut workspaces and sign in with AIX Core.
- **Per-project sharing and roles** beyond one team workspace.
- **Publish** to LinkedIn and Instagram (reuse Agent Nick's Zernio integration).
- **Agent Nick hand-off:** turn a Nick-approved idea plus a draft into a video in one click, through an API rather than a shared codebase.
- **Localization:** multiple voice languages, with caption re-timing per language.
- **Analytics loop:** pull post performance and learn which hooks and scene types work.
