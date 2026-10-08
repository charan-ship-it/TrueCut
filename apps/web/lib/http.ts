import { NextResponse } from 'next/server';
import { loadEnv } from '@truecut/config';
import { requireUser, requireProject, HttpError } from './auth';
loadEnv();
export const ok = (data: any, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const onError = (e: any) => { if (e instanceof HttpError) return fail(e.message, e.status); const m = e?.message || String(e); if (!/not found/i.test(m)) console.error('[api]', e); return fail(m, /not found/i.test(m) ? 404 : 400); };

type User = Awaited<ReturnType<typeof requireUser>>;
/** An API route for any signed-in member. The handler gets the user as a third argument. */
export function route<C = any>(fn: (req: Request, ctx: C, user: User) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => { try { return await fn(req, ctx, await requireUser()); } catch (e) { return onError(e); } };
}
/** An API route under /projects/:id — also checks the user may open that project. */
export function projectRoute<C extends { params: { id: string } }>(fn: (req: Request, ctx: C, user: User) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => { try { return await fn(req, ctx, await requireProject(ctx.params.id)); } catch (e) { return onError(e); } };
}
