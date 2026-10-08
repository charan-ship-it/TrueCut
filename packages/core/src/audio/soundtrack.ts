// Builds the full soundtrack (score + SFX + voice, ducked) for a project.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { getProject, updateProject } from '@truecut/db';
import { projectPath } from '@truecut/storage';
import { decodeAudio } from '../render/media';
import { projectLayout } from '@truecut/shared/compose';
import { score, wav, SR } from './synth';
import type { Log } from '@truecut/queue';
import { resolveStyle } from '@truecut/engine/styles.js';
import type { Project } from '@truecut/shared/types';

export async function audioKey(pid: string) {
  const p = await getProject(pid); const L = projectLayout(p);
  return crypto.createHash('sha1').update(JSON.stringify([p.music.mode, p.style, p.cast?.music, 'g3', L.duration, L.revealAt, L.scenes.map((s: any) => [s.type, s.start, s.vo?.text, s.scene?.vo?.file]), p.scenes.map((s) => s.vo?.hash || '')])).digest('hex').slice(0, 12);
}

export async function buildAudio(pid: string, log: Log) {
  const p = await getProject(pid);
  const key = await audioKey(pid);
  if (p.audioFile && p.audioHash === key && fs.existsSync(projectPath(pid, p.audioFile))) { log('Soundtrack up to date', 100); return p.audioFile; }
  const L = projectLayout(p);
  log('Decoding voice…', 10);
  const vo: { t: number; pcm: Float32Array }[] = [];
  for (const s of L.scenes as any[]) {
    const sc = p.scenes.find((x) => x.id === s.id);
    if (sc?.vo?.file && fs.existsSync(projectPath(pid, sc.vo.file))) vo.push({ t: s.voStart, pcm: await decodeAudio(projectPath(pid, sc.vo.file), SR) });
  }
  log(`Scoring ${L.duration.toFixed(1)}s of music and sound design…`, 35);
  const endScene = (L.scenes as any[]).find((s) => s.type === 'end');
  const out = score({ duration: L.duration, revealAt: L.revealAt, endAt: endScene ? endScene.start : null, cues: L.cues as any, vo, music: p.music.mode === 'none' ? false : scoreFor(p), seed: parseInt(key.slice(0, 6), 16) });
  const file = `audio/mix-${key}.wav`;
  fs.writeFileSync(projectPath(pid, file), wav(out.L, out.R));
  await updateProject(pid, (pp) => { pp.audioFile = file; pp.audioHash = key; });
  log(vo.length ? `Soundtrack ready (${vo.length} voice lines)` : 'Soundtrack ready (no voice yet — music and effects only)', 100);
  return file;
}

/** The direction's score, unless casting picked one for this same direction. */
export function scoreFor(p: Project) {
  const base = resolveStyle(p.style || {}, p.intake.accent).music;
  const c = p.cast?.music;
  if (c && c.genre && (!c.preset || c.preset === p.style?.preset)) return { ...base, genre: c.genre, bpm: c.bpm || base.bpm };
  return base;
}
