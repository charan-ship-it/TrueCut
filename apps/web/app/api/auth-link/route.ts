// POST { email, callbackUrl } → emails a one-time sign-in link (if the address may sign in).
// Public: it sits under the /api/auth* prefix the middleware leaves open.
import { z } from 'zod';
import { body, ok, fail, publicRoute } from '@/lib/http';
import { requestSignInLink } from '@/lib/emailsignin';
import { mailConfigured, MailError } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
const Req = z.object({ email: z.string().trim().email().max(254), callbackUrl: z.string().max(2000).optional() });

export const POST = publicRoute(async (req) => {
  if (!mailConfigured()) return fail('Email sign-in isn’t set up on this server.', 404);
  const b = await body(req, Req);
  const ip = req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  try {
    await requestSignInLink({ email: b.email, callbackUrl: b.callbackUrl, ip, origin: new URL(req.url).origin });
  } catch (e) {
    if (e instanceof MailError) return fail(e.message, 502, 'mail_failed');
    throw e;
  }
  return ok({ ok: true }); // same answer for addresses that aren't allowed
});
