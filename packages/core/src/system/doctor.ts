import fs from 'node:fs';
import { config } from '@truecut/config';
import { ffmpegPath, ffmpegWorks } from '../render/media';
import { launchBrowser } from '../render/browser';
import { sql } from '@truecut/db';

export async function doctor(opts: { launch?: boolean } = {}) {
  const checks: { id: string; ok: boolean; label: string; hint?: string }[] = [];
  checks.push({ id: 'ffmpeg', ok: ffmpegWorks(), label: 'ffmpeg (bundled)', hint: `Path: ${ffmpegPath()}. Run npm install again if missing.` });
  let browserOk = true; let hint = '';
  if (opts.launch) { try { const b = await launchBrowser(); await b.close(); } catch (e: any) { browserOk = false; hint = 'Run: npx playwright install chromium — ' + e.message.slice(0, 120); } }
  checks.push({ id: 'chromium', ok: browserOk, label: 'Headless Chromium (Playwright)', hint: hint || (opts.launch ? '' : 'Checked when you render') });
  checks.push({ id: 'anthropic', ok: !!config.anthropicKey, label: 'Claude API key (analysis + storyboard)', hint: 'Set ANTHROPIC_API_KEY in .env.local. Without it, rule-based fallbacks are used.' });
  checks.push({ id: 'eleven', ok: !!config.elevenKey, label: 'ElevenLabs key (voice-over)', hint: 'Set ELEVENLABS_API_KEY in .env.local. Without it, videos have music + captions only.' });
  let dbOk = true, dbHint = '';
  try { await sql()`select 1 from projects limit 1`; } catch (e: any) { dbOk = false; dbHint = /DATABASE_URL/.test(e.message) ? e.message : `Run npm run db:migrate. ${String(e.message).slice(0, 120)}`; }
  checks.push({ id: 'database', ok: dbOk, label: 'Postgres (projects, jobs)', hint: dbHint });
  let writable = true; try { fs.mkdirSync(config.dataDir, { recursive: true }); fs.accessSync(config.dataDir, fs.constants.W_OK); } catch { writable = false; }
  checks.push({ id: 'data', ok: writable, label: `Data folder writable (${config.dataDir})` });
  return { ok: checks.every((c) => c.ok || c.id === 'anthropic' || c.id === 'eleven'), checks, models: { analysis: config.model, creative: config.creativeModel } };
}
