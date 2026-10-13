import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { loadEnv } from '@truecut/config';
import { UserFacingError } from '@truecut/core/system/errors';
import { requireUser, requireProject, userFromBearer, HttpError } from './auth';
loadEnv();

export const ok = (data: any, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400, code?: string) => NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });

const STATUS: Record<string, number> = { budget_exceeded: 402, missing_anthropic_key: 400, missing_elevenlabs_key: 400, invalid_key: 400, rate_limited: 429, overloaded: 503 };
function onError(e: any) {
  if (e instanceof HttpError) return fail(e.message, e.status);
  if (e instanceof ZodError) return fail(`Invalid request: ${e.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`, 400, 'invalid_request');
  if (e instanceof UserFacingError) return fail(e.message, STATUS[e.code] || 400, e.code);
  const m = e?.message || String(e);
  if (/not found/i.test(m)) return fail(m, 404);
  console.error('[api]', e);
  // never leak internals (SQL, stack traces) to the browser
  return fail(/^(DrizzleError|PostgresError|Failed query)|relation |syntax error|ECONNREFUSED/i.test(m) || e?.name === 'PostgresError' ? 'Something went wrong on the server. Please try again.' : m, 500);
}

/** Parse and validate a JSON body. */
export async function body<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, 'Expected a JSON body.'); }
  return schema.parse(raw);
}

/** An API route anyone may call (sign-in). Same error handling, no user. */
export function publicRoute<C = any>(fn: (req: Request, ctx: C) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => { try { return await fn(req, ctx); } catch (e) { return onError(e); } };
}

type User = Awaited<ReturnType<typeof requireUser>>;
/** An API route for any signed-in member. The handler gets the user as a third argument. */
export function route<C = any>(fn: (req: Request, ctx: C, user: User) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => { try { return await fn(req, ctx, await requireUser()); } catch (e) { return onError(e); } };
}
/** An API route under /projects/:id — also checks the user may open that project. */
export function projectRoute<C extends { params: { id: string } }>(fn: (req: Request, ctx: C, user: User) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => { try { return await fn(req, ctx, await requireProject(ctx.params.id)); } catch (e) { return onError(e); } };
}

// The extension calls from chrome-extension://… with a bearer token; it has host permission, but
// answering preflights keeps it working if Chrome ever applies CORS.
const cors = (req: Request): Record<string, string> => { const o = req.headers.get('origin') || ''; return /^chrome-extension:\/\/[a-p]{32}$/.test(o) ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {}; };
export const preflight = (req: Request) => new Response(null, { status: 204, headers: cors(req) });
/** For the extension: a personal access token (Bearer tc_…) or, from the web app itself, the session. */
export function tokenRoute<C = any>(fn: (req: Request, ctx: C, user: User & { tokenId?: string }) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => {
    let res: Response;
    try {
      const t = await userFromBearer(req);
      if (req.headers.get('authorization') && !t) throw new HttpError(401, 'This TrueCut token is not valid any more. Create a new one in Settings → Capture extension.');
      res = await fn(req, ctx, t ? { id: t.id, email: t.email, name: t.name, image: t.image, workspaceId: t.workspaceId, tokenId: t.tokenId } : await requireUser());
    } catch (e) { res = onError(e); }
    for (const [k, v] of Object.entries(cors(req))) res.headers.set(k, v);
    return res;
  };
}
