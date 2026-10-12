import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { sendMail, signInMail, mailConfigured, MailError } from '../lib/mailer';
import { safePath, requestSignInLink } from '../lib/emailsignin';
import { verifyEmailLink } from '../lib/auth';
import { closeDb } from '@truecut/db';

const keep = { ...process.env };
afterEach(() => { process.env = { ...keep }; });
const res = (status: number, body: any = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe('safePath', () => {
  it('keeps same-site paths only', () => {
    expect(safePath('/projects/p1?x=1')).toBe('/projects/p1?x=1');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '', null, undefined]) expect(safePath(bad as any)).toBe('/');
  });
});

describe('mailer (Nylas)', () => {
  beforeEach(() => { delete process.env.NYLAS_SEND_DOMAIN; delete process.env.NYLAS_GRANT_ID; delete process.env.EMAIL_FROM; delete process.env.NYLAS_MAILBOX_EMAIL; });
  const mail = signInMail('a@aixccelerate.com', 'https://t.app/signin/verify?token=abc&x=<b>', 15);

  it('is off without a key and a sender', () => {
    delete process.env.NYLAS_API_KEY; expect(mailConfigured()).toBe(false);
    process.env.NYLAS_API_KEY = 'nyk_test'; expect(mailConfigured()).toBe(false);
    process.env.NYLAS_GRANT_ID = 'g1'; expect(mailConfigured()).toBe(true);
  });

  it('sends from a connected mailbox with the TrueCut name', async () => {
    Object.assign(process.env, { NYLAS_API_KEY: 'nyk_test', NYLAS_GRANT_ID: 'g/1', NYLAS_MAILBOX_EMAIL: 'agent@wkr.email', NYLAS_API_URI: 'https://api.eu.nylas.com/' });
    const f = vi.fn(async (..._a: any[]) => res(200, { data: { id: 'm1' } }));
    await sendMail(mail, { fetch: f as any });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.eu.nylas.com/v3/grants/g%2F1/messages/send');
    const b = JSON.parse(init.body);
    expect(b.from).toEqual([{ name: 'TrueCut', email: 'agent@wkr.email' }]);
    expect(b.to).toEqual([{ email: 'a@aixccelerate.com' }]);
    expect(init.headers.Authorization).toBe('Bearer nyk_test');
    expect(b.body).toContain('&lt;b&gt;'); // link is escaped in the HTML
  });

  it('sends from a verified domain', async () => {
    Object.assign(process.env, { NYLAS_API_KEY: 'k', NYLAS_SEND_DOMAIN: 'mail.aixccelerate.com', EMAIL_FROM: 'TrueCut <signin@mail.aixccelerate.com>' });
    const f = vi.fn(async (..._a: any[]) => res(200));
    await sendMail(mail, { fetch: f as any });
    expect(f.mock.calls[0][0]).toBe('https://api.us.nylas.com/v3/domains/mail.aixccelerate.com/messages/send');
    expect(JSON.parse(f.mock.calls[0][1].body).from).toEqual({ name: 'TrueCut', email: 'signin@mail.aixccelerate.com' });
  });

  it('retries throttling and outages with one idempotency key, not bad requests', async () => {
    Object.assign(process.env, { NYLAS_API_KEY: 'k', NYLAS_GRANT_ID: 'g' });
    const f = vi.fn().mockResolvedValueOnce(res(429, {}, { 'retry-after': '0' })).mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce(res(200));
    await sendMail(mail, { fetch: f as any, backoffMs: 1 });
    expect(f).toHaveBeenCalledTimes(3);
    const keys = f.mock.calls.map((c) => c[1].headers['Idempotency-Key']);
    expect(new Set(keys).size).toBe(1);

    const bad = vi.fn(async () => res(401, { error: { message: 'Unauthorized' } }));
    await expect(sendMail(mail, { fetch: bad as any, backoffMs: 1 })).rejects.toThrow(/Nylas 401: Unauthorized/);
    expect(bad).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => res(504));
    await expect(sendMail(mail, { fetch: down as any, backoffMs: 1 })).rejects.toBeInstanceOf(MailError);
    expect(down).toHaveBeenCalledTimes(3);
  });

  it('never puts the API key in an error', async () => {
    Object.assign(process.env, { NYLAS_API_KEY: 'nyk_supersecret', NYLAS_GRANT_ID: 'g' });
    const f = vi.fn(async () => res(400, { error: { message: 'bad' } }));
    await expect(sendMail(mail, { fetch: f as any })).rejects.not.toThrow(/supersecret/);
  });
});

describe.skipIf(!dbReady)('requesting and using a link', () => {
  afterAll(async () => { await closeDb(); });
  beforeEach(() => { Object.assign(process.env, { ALLOWED_EMAIL_DOMAINS: 'aixccelerate.com', NEXTAUTH_URL: 'https://truecut.example/' }); });

  it('emails a working one-time link to an allowed address', async () => {
    const send = vi.fn(async (_m: any) => {});
    expect(await requestSignInLink({ email: ' Link@AIXccelerate.com ', callbackUrl: '//evil.com', ip: 'ip-1', origin: 'https://forged.host', send })).toEqual({ sent: true });
    const m = send.mock.calls[0][0];
    expect(m.to).toBe('link@aixccelerate.com');
    const link = new URL(m.html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'));
    expect(link.origin).toBe('https://truecut.example'); // never the request's host
    expect(link.pathname).toBe('/signin/verify');
    expect(link.searchParams.get('callbackUrl')).toBe('/');
    const token = link.searchParams.get('token')!;
    expect(await verifyEmailLink('link@aixccelerate.com', token)).toMatchObject({ email: 'link@aixccelerate.com' });
    expect(await verifyEmailLink('link@aixccelerate.com', token)).toBeNull();
  });

  it('answers the same for an address that may not sign in, and sends nothing', async () => {
    const send = vi.fn(async () => {});
    expect(await requestSignInLink({ email: 'someone@gmail.com', ip: 'ip-2', origin: 'x', send })).toEqual({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('a valid link stops working if the address is no longer allowed', async () => {
    const send = vi.fn(async (_m: any) => {});
    await requestSignInLink({ email: 'gone@aixccelerate.com', ip: 'ip-3', origin: 'x', send });
    const token = new URL(send.mock.calls[0][0].html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&')).searchParams.get('token');
    process.env.ALLOWED_EMAIL_DOMAINS = 'other.com';
    expect(await verifyEmailLink('gone@aixccelerate.com', token)).toBeNull();
  });

  it('limits requests per address', async () => {
    const send = vi.fn(async () => {});
    for (let i = 0; i < 3; i++) await requestSignInLink({ email: 'limit@aixccelerate.com', ip: `ip-l${i}`, origin: 'x', send });
    await expect(requestSignInLink({ email: 'limit@aixccelerate.com', ip: 'ip-l9', origin: 'x', send })).rejects.toThrow(/Too many/);
  });

  it('reports a failed send without details', async () => {
    const send = vi.fn(async () => { throw new MailError('Nylas 401: Unauthorized'); });
    await expect(requestSignInLink({ email: 'fail@aixccelerate.com', ip: 'ip-f', origin: 'x', send })).rejects.toThrow(/couldn’t send/);
  });
});
