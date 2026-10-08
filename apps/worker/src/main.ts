// TrueCut worker: takes jobs off the Postgres queue and runs them with the same pipelines the
// web app used to run in-process. Scale by adding replicas; each runs TRUECUT_RENDER_SLOTS renders
// and TRUECUT_WORKER_CONCURRENCY other jobs at a time.
import http from 'node:http';
import { loadEnv, env } from '@truecut/config';
import { closeDb, sql } from '@truecut/db';
import { startWorker } from '@truecut/queue';
import '@truecut/core/handlers';

loadEnv();
process.env.TRUECUT_QUEUE = 'pgboss';

const started = Date.now();
let ready = false;

// Railway (and anyone else) can probe GET /health; it also keeps the service "listening" if a port is set.
const port = Number(env('PORT', '0'));
const server = port ? http.createServer(async (req, res) => {
  if (req.url !== '/health') { res.writeHead(404).end(); return; }
  let db = true; try { await sql()`select 1`; } catch { db = false; }
  res.writeHead(ready && db ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: ready && db, db, uptime: Math.round((Date.now() - started) / 1000) }));
}).listen(port, () => console.log(`[worker] health on :${port}/health`)) : null;

const w = await startWorker();
ready = true;

let stopping = false;
async function shutdown(sig: string) {
  if (stopping) return; stopping = true;
  console.log(`[worker] ${sig}: finishing running jobs…`);
  try { await w.stop(Number(env('TRUECUT_SHUTDOWN_GRACE_SECONDS', '300')) * 1000); } catch (e: any) { console.error('[worker] stop', e?.message); }
  server?.close();
  await closeDb();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
