/** One-line structured logs for Railway: `[scope] event {json}`. Never log secrets or whole documents; keep fields short. */
export function slog(scope: string, event: string, data: Record<string, unknown> = {}) {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) clean[k] = typeof v === 'string' && v.length > 240 ? v.slice(0, 240) + '…' : v;
  console.log(`[${scope}] ${event} ${JSON.stringify(clean)}`);
}
/** Time an async step and log it (also on failure). */
export async function timed<T>(scope: string, event: string, data: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try { const r = await fn(); slog(scope, event, { ...data, ms: Date.now() - t }); return r; }
  catch (e: any) { slog(scope, event + '.failed', { ...data, ms: Date.now() - t, error: e?.message || String(e) }); throw e; }
}
