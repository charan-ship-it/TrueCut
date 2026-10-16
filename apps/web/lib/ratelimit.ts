// Simple per-person rate limits (sliding window, in memory). Each web instance keeps its own window,
// which is fine for protecting the paid APIs from a stuck client or a runaway script.
import { HttpError } from './auth';

const g = globalThis as any;
const hits: Map<string, number[]> = g.__tcRate || (g.__tcRate = new Map());

export const LIMITS = {
  chat: { n: 30, perMs: 60_000 },       // Nick turns
  heavy: { n: 20, perMs: 60_000 },      // renders, voice, analyse
  upload: { n: 120, perMs: 60_000 },    // captures and uploads
  skills: { n: 30, perMs: 60_000 },     // creating / importing team skills
  keys: { n: 10, perMs: 60_000 },       // saving / testing API keys
  read: { n: 600, perMs: 60_000 },
  clientLog: { n: 60, perMs: 60_000 }, // playback diagnostics from the browser
  signinIp: { n: 10, perMs: 600_000 },  // sign-in link requests per IP
  signinEmail: { n: 3, perMs: 600_000 },// sign-in link emails per address
} as const;

export function rateLimit(kind: keyof typeof LIMITS, who: string) {
  const { n, perMs } = LIMITS[kind];
  const k = `${kind}:${who || 'anon'}`; const now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < perMs);
  if (arr.length >= n) { const wait = Math.ceil((perMs - (now - arr[0])) / 1000); throw new HttpError(429, `Too many requests. Try again in ${wait}s.`); }
  arr.push(now); hits.set(k, arr);
  if (hits.size > 10_000) for (const [key, v] of hits) if (!v.length || now - v[v.length - 1] > 120_000) hits.delete(key);
}
