// "Email me a sign-in link": make a one-time link and send it. The answer is the same whether or not the
// address may sign in, so the form can't be used to find out who is on the team.
import { createEmailToken, EMAIL_TOKEN_MINUTES } from '@truecut/db';
import { env } from '@truecut/config';
import { emailAllowed } from './auth';
import { rateLimit } from './ratelimit';
import { sendMail, signInMail, MailError } from './mailer';

/** Only same-site paths: "/projects/x" yes, "//evil.com" or "https://…" no. */
export function safePath(p?: string | null) {
  return p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') ? p : '/';
}

/** The public URL links point at. Never the request's Host header, which a client can forge. */
export function publicBase(requestOrigin: string) {
  const u = env('NEXTAUTH_URL');
  if (u) return u.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('NEXTAUTH_URL is not set, so sign-in links have nowhere to point.');
  return requestOrigin;
}

export async function requestSignInLink(o: { email: string; callbackUrl?: string; ip: string; origin: string; send?: typeof sendMail }) {
  const email = o.email.trim().toLowerCase();
  rateLimit('signinIp', o.ip);
  rateLimit('signinEmail', email);
  if (!emailAllowed(email)) return { sent: false };
  const { token } = await createEmailToken(email);
  const q = new URLSearchParams({ email, token, callbackUrl: safePath(o.callbackUrl) });
  const link = `${publicBase(o.origin)}/signin/verify?${q}`;
  try {
    await (o.send || sendMail)(signInMail(email, link, EMAIL_TOKEN_MINUTES));
  } catch (e) {
    console.error('[signin] email not sent:', e instanceof MailError ? e.message : e);
    throw new MailError('We couldn’t send the email just now. Please try again in a minute.');
  }
  return { sent: true };
}
