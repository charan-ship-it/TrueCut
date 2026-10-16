import { z } from 'zod';
import { ok, route, body } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { slog } from '@truecut/core/system/log';
export const dynamic = 'force-dynamic';

const Schema = z.object({ ev: z.string().max(40), project: z.string().max(40).optional(), data: z.record(z.any()).optional() });

/** Playback diagnostics from the browser (pauses nobody asked for, stalls, player reloads), written to the server log. */
export const POST = route(async (req, _ctx, user) => {
  rateLimit('clientLog', user.id);
  const b = await body(req, Schema);
  slog('client', b.ev, { user: user.id, project: b.project, ...(b.data || {}) });
  return ok({ ok: true });
});
