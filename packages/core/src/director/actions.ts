// The job kinds behind the manual Edit-bay buttons and source adds. Each `start*` queues a job; the
// matching handler (registered here) is what the worker, or the inline driver, runs.
import path from 'node:path';
import { defineHandler, enqueue } from '@truecut/queue';
import { ingestUrl, ingestPath, ingestText } from '../sources/ingest';
import { analyze, storyboard, reviseScene } from '../ads/ai';
import { voiceAll } from '../audio/voice';
import { buildAudio } from '../audio/soundtrack';
import { renderProject } from '../render/render';
import { updateProject } from '@truecut/db';
import { ROOT } from '@truecut/config';
import type { FormatId } from '@truecut/shared/types';

type By = { createdBy?: string | null };
const pidOf = (job: { projectId: string | null }) => { if (!job.projectId) throw new Error('Job has no project'); return job.projectId; };

defineHandler<{ sid: string; kind: string; value: string }>('ingest', async ({ sid, kind, value }, { job, log }) => {
  const pid = pidOf(job);
  try {
    if (kind === 'url') { let u = value.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; await ingestUrl(pid, sid, u, log); }
    else if (kind === 'path') { const abs = path.resolve(ROOT, value.trim().replace(/^~(?=\/)/, process.env.HOME || '~')); await ingestPath(pid, sid, abs, log); }
    else if (kind === 'text') { await ingestText(pid, sid, value); log('Saved text', 100); }
  } catch (e: any) {
    await updateProject(pid, (p) => { const s = p.sources.find((x) => x.id === sid); if (s) { s.status = 'error'; s.error = e.message; } });
    throw e;
  }
});
defineHandler('analyze', (_: unknown, { job, log }) => analyze(pidOf(job), log));
defineHandler('storyboard', (_: unknown, { job, log }) => storyboard(pidOf(job), log));
defineHandler<{ sceneId: string; instruction: string }>('revise', async ({ sceneId, instruction }, { job, log }) => { log('Revising scene…', 20); await reviseScene(pidOf(job), sceneId, instruction); log('Scene revised', 100); });
defineHandler('voice', (_: unknown, { job, log }) => voiceAll(pidOf(job), log));
defineHandler('audio', (_: unknown, { job, log }) => buildAudio(pidOf(job), log));
defineHandler<{ formats: FormatId[] }>('render', ({ formats }, { job, log }) => renderProject(pidOf(job), formats, log), { heavy: true });

export const startIngest = (pid: string, sid: string, kind: string, value: string, o: By = {}) => enqueue('ingest', pid, { sid, kind, value }, o);
export const startAnalyze = (pid: string, o: By = {}) => enqueue('analyze', pid, {}, o);
export const startStoryboard = (pid: string, o: By = {}) => enqueue('storyboard', pid, {}, o);
export const startRevise = (pid: string, sceneId: string, instruction: string, o: By = {}) => enqueue('revise', pid, { sceneId, instruction }, o);
export const startVoice = (pid: string, o: By = {}) => enqueue('voice', pid, {}, o);
export const startAudio = (pid: string, o: By = {}) => enqueue('audio', pid, {}, o);
export const startRender = (pid: string, formats: FormatId[], o: By = {}) => enqueue('render', pid, { formats }, o);
