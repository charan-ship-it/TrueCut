// Wires user actions to background jobs.
import path from 'node:path';
import { startJob } from '@truecut/queue';
import { ingestUrl, ingestPath, ingestText } from '../sources/ingest';
import { analyze, storyboard, reviseScene } from '../ads/ai';
import { voiceAll } from '../audio/voice';
import { buildAudio } from '../audio/soundtrack';
import { renderProject } from '../render/render';
import { updateProject } from '@truecut/db';
import { ROOT } from '@truecut/config';
import type { FormatId } from '@truecut/shared/types';

export function startIngest(pid: string, sid: string, kind: string, value: string) {
  return startJob('ingest', pid, async (log) => {
    try {
      if (kind === 'url') { let u = value.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; await ingestUrl(pid, sid, u, log); }
      else if (kind === 'path') { const abs = path.resolve(ROOT, value.trim().replace(/^~(?=\/)/, process.env.HOME || '~')); await ingestPath(pid, sid, abs, log); }
      else if (kind === 'text') { ingestText(pid, sid, value); log('Saved text', 100); }
    } catch (e: any) {
      updateProject(pid, (p) => { const s = p.sources.find((x) => x.id === sid); if (s) { s.status = 'error'; s.error = e.message; } });
      throw e;
    }
  }, { heavy: kind === 'url' });
}
export const startAnalyze = (pid: string) => startJob('analyze', pid, (log) => analyze(pid, log));
export const startStoryboard = (pid: string) => startJob('storyboard', pid, (log) => storyboard(pid, log));
export const startRevise = (pid: string, sceneId: string, instruction: string) => startJob('revise', pid, async (log) => { log('Revising scene…', 20); await reviseScene(pid, sceneId, instruction); log('Scene revised', 100); });
export const startVoice = (pid: string) => startJob('voice', pid, (log) => voiceAll(pid, log));
export const startAudio = (pid: string) => startJob('audio', pid, (log) => buildAudio(pid, log));
export const startRender = (pid: string, formats: FormatId[]) => startJob('render', pid, (log) => renderProject(pid, formats, log), { heavy: true });
