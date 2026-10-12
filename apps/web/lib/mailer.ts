// Sending email (sign-in links) through Nylas. Two ways, picked from the environment:
//
//   NYLAS_API_KEY        required
//   NYLAS_API_URI        default https://api.us.nylas.com (use the EU URI if the Nylas app is in the EU)
//   NYLAS_SEND_DOMAIN    a domain verified in Nylas → Transactional Send, from EMAIL_FROM (no mailbox needed)
//   NYLAS_GRANT_ID       otherwise: send from this connected mailbox (NYLAS_MAILBOX_EMAIL is its address)
//   EMAIL_FROM           "Name <address>" for the domain way; for a mailbox only the name is used
//
// Everything about Nylas stays in this file, so moving to another provider is a change here only.
import crypto from 'node:crypto';
import { env } from '@truecut/config';

export type Mail = { to: string; subject: string; html: string; text: string };

export class MailError extends Error {}

const parseFrom = (v: string) => {
  const m = v.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, '') || 'TrueCut', email: m[2] } : { name: 'TrueCut', email: v.trim() };
};

function route() {
  const key = env('NYLAS_API_KEY');
  if (!key) return null;
  const base = (env('NYLAS_API_URI') || 'https://api.us.nylas.com').replace(/\/+$/, '');
  const domain = env('NYLAS_SEND_DOMAIN'); const grant = env('NYLAS_GRANT_ID');
  const from = parseFrom(env('EMAIL_FROM') || '');
  if (domain) {
    if (!from.email) return null;
    return { key, url: `${base}/v3/domains/${encodeURIComponent(domain)}/messages/send`, from: from as any, kind: 'domain' as const };
  }
  if (grant) {
    const email = env('NYLAS_MAILBOX_EMAIL');
    // a mailbox can only send as itself; we only choose the display name
    return { key, url: `${base}/v3/grants/${encodeURIComponent(grant)}/messages/send`, from: email ? [{ name: from.name || 'TrueCut', email }] : undefined, kind: 'grant' as const };
  }
  return null;
}

/** True when sign-in links can be emailed. */
export const mailConfigured = () => !!route();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends one email. Retries throttling, provider hiccups and network errors with the same idempotency key,
 *  so a retry never sends twice. Throws MailError with a message safe to log (never the API key). */
export async function sendMail(m: Mail, opts: { fetch?: typeof fetch; attempts?: number; backoffMs?: number } = {}) {
  const r = route();
  if (!r) throw new MailError('Email sending is not set up (NYLAS_API_KEY with NYLAS_SEND_DOMAIN or NYLAS_GRANT_ID).');
  const doFetch = opts.fetch || fetch; const attempts = opts.attempts ?? 3; const backoff = opts.backoffMs ?? 800;
  const body = JSON.stringify({ to: [{ email: m.to }], ...(r.from ? { from: r.from } : {}), subject: m.subject, body: m.html });
  const idem = crypto.randomUUID();
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await doFetch(r.url, {
        method: 'POST', body, signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': idem },
      });
      if (res.ok) return;
      const detail = await res.text().then((t) => { try { const j = JSON.parse(t); return j?.error?.message || j?.message || t; } catch { return t; } }).catch(() => '');
      last = `Nylas ${res.status}: ${String(detail).slice(0, 200)}`;
      if (res.status !== 429 && res.status < 500) break; // our mistake (bad key, unverified domain…): retrying won't help
      const after = Number(res.headers.get('retry-after'));
      if (i < attempts - 1) await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 10_000) : backoff * 2 ** i);
    } catch (e: any) {
      last = `Nylas unreachable: ${e?.name === 'TimeoutError' ? 'timed out' : e?.message || e}`;
      if (i < attempts - 1) await sleep(backoff * 2 ** i);
    }
  }
  throw new MailError(last || 'Nylas did not accept the email.');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function signInMail(to: string, link: string, minutes: number): Mail {
  const text = `Sign in to TrueCut\n\nOpen this link to sign in as ${to}. It works once and expires in ${minutes} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<h1 style="margin:0 0 12px;font-size:22px;font-weight:600">Sign in to TrueCut</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#444">Click the button to sign in as <strong>${esc(to)}</strong>. The link works once and expires in ${minutes} minutes.</p>
<p style="margin:0 0 24px"><a href="${esc(link)}" style="display:inline-block;background:#1b1b1b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">Sign in to TrueCut</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#777">Or paste this link into your browser:</p>
<p style="margin:0 0 24px;font-size:12px;color:#777;word-break:break-all">${esc(link)}</p>
<p style="margin:0;font-size:13px;color:#999">If you didn't ask for this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { to, subject: 'Your TrueCut sign-in link', html, text };
}
