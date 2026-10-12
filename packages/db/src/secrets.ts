// Encryption for secrets stored in the database (API keys people add in Settings).
// AES-256-GCM with a key derived from TRUECUT_ENCRYPTION_KEY. Format: v1:<iv>:<tag>:<ciphertext>, base64.
// To rotate: set the new value in TRUECUT_ENCRYPTION_KEY and the old one in TRUECUT_ENCRYPTION_KEY_PREVIOUS;
// old secrets still decrypt, and `npm run keys:rotate` re-encrypts them with the new key.
import crypto from 'node:crypto';
import { env } from '@truecut/config';

export class SecretsUnavailable extends Error {
  constructor() { super('Saving API keys needs TRUECUT_ENCRYPTION_KEY on the server (32+ random characters). Ask whoever runs TrueCut to set it.'); }
}

const derive = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest();
function keys() {
  const cur = env('TRUECUT_ENCRYPTION_KEY'); const prev = env('TRUECUT_ENCRYPTION_KEY_PREVIOUS');
  return { current: cur && cur.length >= 32 ? derive(cur) : null, previous: prev && prev.length >= 32 ? derive(prev) : null };
}
export const secretsAvailable = () => !!keys().current;

export function encryptSecret(plain: string): string {
  const k = keys().current; if (!k) throw new SecretsUnavailable();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognised secret format');
  const { current, previous } = keys();
  for (const k of [current, previous]) {
    if (!k) continue;
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
    } catch { /* try the previous key */ }
  }
  throw new Error('Could not decrypt a stored API key (was TRUECUT_ENCRYPTION_KEY changed?). Re-enter it in Settings.');
}

/** True if the blob was written with the previous key (for rotation). */
export function needsRotation(blob: string) {
  const { current } = keys(); if (!current) return false;
  const [, iv, tag, ct] = blob.split(':');
  try { const d = crypto.createDecipheriv('aes-256-gcm', current, Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); d.update(Buffer.from(ct, 'base64')); d.final(); return false; } catch { return true; }
}

export const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
