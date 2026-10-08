// Background jobs (ingest, analyse, storyboard, voice, audio, render) with progress + logs.
// Runs in-process; heavy jobs are serialised so a laptop is never asked to render twice at once.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@truecut/config';
import { newId } from '@truecut/db';

export type Job = { id: string; kind: string; projectId: string; status: 'queued' | 'running' | 'done' | 'error'; progress: number; message: string; log: string[]; error?: string; createdAt: string; startedAt?: string; endedAt?: string; result?: any };
type Reg = { jobs: Map<string, Job>; chain: Promise<void> };
const g = globalThis as any;
const reg: Reg = g.__nmJobs || (g.__nmJobs = { jobs: new Map(), chain: Promise.resolve() });

const jobsDir = () => path.join(config.dataDir, 'jobs');
function persist(j: Job) { try { fs.mkdirSync(jobsDir(), { recursive: true }); fs.writeFileSync(path.join(jobsDir(), j.id + '.json'), JSON.stringify(j)); } catch {} }

export function getJob(id: string): Job | null {
  if (reg.jobs.has(id)) return reg.jobs.get(id)!;
  try { return JSON.parse(fs.readFileSync(path.join(jobsDir(), id + '.json'), 'utf8')); } catch { return null; }
}
export function projectJobs(pid: string): Job[] { return [...reg.jobs.values()].filter((j) => j.projectId === pid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

export type Log = (msg: string, pct?: number) => void;

export function startJob(kind: string, projectId: string, fn: (log: Log, job: Job) => Promise<any>, opts: { heavy?: boolean } = {}): Job {
  const job: Job = { id: 'j' + newId(), kind, projectId, status: 'queued', progress: 0, message: 'Queued', log: [], createdAt: new Date().toISOString() };
  reg.jobs.set(job.id, job); persist(job);
  let last = 0;
  const log: Log = (msg, pct) => { job.message = msg; if (pct != null) job.progress = Math.max(0, Math.min(100, pct)); job.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`); if (job.log.length > 300) job.log.splice(0, 100); const now = Date.now(); if (now - last > 400) { last = now; persist(job); } };
  const runIt = async () => {
    job.status = 'running'; job.startedAt = new Date().toISOString(); persist(job);
    try { job.result = await fn(log, job); job.status = 'done'; job.progress = 100; }
    catch (e: any) { job.status = 'error'; job.error = e?.message || String(e); job.message = job.error!; console.error(`[job ${kind}]`, e); }
    job.endedAt = new Date().toISOString(); persist(job);
  };
  if (opts.heavy) { reg.chain = reg.chain.then(runIt, runIt); } else { void runIt(); }
  return job;
}

/** True only while a job for this project is actually running in this server process (survives restarts correctly). */
export function isBusy(pid: string, kind = 'nick') { return [...reg.jobs.values()].some((j) => j.projectId === pid && j.kind === kind && (j.status === 'running' || j.status === 'queued')); }
