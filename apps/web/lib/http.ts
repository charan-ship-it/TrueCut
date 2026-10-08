import { NextResponse } from 'next/server';
import { loadEnv } from '@truecut/config';
loadEnv();
export const ok = (data: any, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
export function route<T extends any[]>(fn: (...a: T) => Promise<Response> | Response) {
  return async (...a: T) => { try { return await fn(...a); } catch (e: any) { const m = e?.message || String(e); return fail(m, /not found/i.test(m) ? 404 : 400); } };
}
