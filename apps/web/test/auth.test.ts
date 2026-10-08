import { afterEach, describe, expect, it } from 'vitest';
import { emailAllowed } from '../lib/auth';

const keep = { ...process.env };
afterEach(() => { process.env = { ...keep }; });

describe('who may sign in', () => {
  it('lets in the team domain and listed addresses only', () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'aixccelerate.com, example.org';
    process.env.ALLOWED_EMAILS = 'contractor@gmail.com';
    expect(emailAllowed('Charan@AIXccelerate.com')).toBe(true);
    expect(emailAllowed('a@example.org')).toBe(true);
    expect(emailAllowed('contractor@gmail.com')).toBe(true);
    expect(emailAllowed('someone@gmail.com')).toBe(false);
    expect(emailAllowed('x@aixccelerate.com.evil.io')).toBe(false);
    expect(emailAllowed(null)).toBe(false);
  });
  it('fails closed when nothing is configured', () => {
    delete process.env.ALLOWED_EMAIL_DOMAINS; delete process.env.ALLOWED_EMAILS;
    expect(emailAllowed('charan@aixccelerate.com')).toBe(false);
  });
});
