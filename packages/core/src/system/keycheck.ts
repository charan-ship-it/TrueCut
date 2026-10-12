// Check an API key with the provider before saving it, so people find out now, not mid-render.
import Anthropic from '@anthropic-ai/sdk';
import { ELEVEN_API } from './eleven';

export type KeyCheck = { ok: boolean; message: string; warn?: boolean };

export function looksLike(provider: 'anthropic' | 'elevenlabs', key: string): string | null {
  const k = key.trim();
  if (k.length < 20 || k.length > 300 || /\s/.test(k)) return "That doesn't look like an API key (check you copied all of it).";
  if (provider === 'anthropic' && !k.startsWith('sk-ant-')) return 'Anthropic keys start with "sk-ant-". Copy it from console.anthropic.com → API keys.';
  return null;
}

export async function testAnthropicKey(key: string): Promise<KeyCheck> {
  try {
    await new Anthropic({ apiKey: key.trim(), maxRetries: 1, timeout: 15_000 }).models.list({ limit: 1 });
    return { ok: true, message: 'Key works.' };
  } catch (e: any) {
    if (e?.status === 401) return { ok: false, message: 'Anthropic rejected this key. Check it in console.anthropic.com → API keys.' };
    if (e?.status === 403) return { ok: false, message: "This key isn't allowed to use the API (403). Check its workspace permissions in the Anthropic Console." };
    return { ok: true, warn: true, message: "Saved, but TrueCut couldn't reach Anthropic to check it just now." };
  }
}

export async function testElevenKey(key: string): Promise<KeyCheck> {
  try {
    const r = await fetch(`${ELEVEN_API}/user`, { headers: { 'xi-api-key': key.trim() }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) return { ok: true, message: 'Key works.' };
    const body = await r.text().catch(() => '');
    if (r.status === 401 && /missing_permissions/i.test(body)) return { ok: true, warn: true, message: 'Saved. This key can\'t read account details; make sure it allows Text to Speech, Speech to Text and Voices.' };
    if (r.status === 401) return { ok: false, message: 'ElevenLabs rejected this key. Copy it again from elevenlabs.io → API keys.' };
    return { ok: true, warn: true, message: `Saved, but ElevenLabs answered ${r.status} when TrueCut checked it.` };
  } catch {
    return { ok: true, warn: true, message: "Saved, but TrueCut couldn't reach ElevenLabs to check it just now." };
  }
}
