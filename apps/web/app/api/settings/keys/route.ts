import { z } from 'zod';
import { ok, route, body, fail } from '@/lib/http';
import { requireOwner, authEnabled } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { saveKey, secretsAvailable } from '@truecut/db';
import { looksLike, testAnthropicKey, testElevenKey } from '@truecut/core/system/keycheck';
export const dynamic = 'force-dynamic';

const Add = z.object({ provider: z.enum(['anthropic', 'elevenlabs']), scope: z.enum(['personal', 'workspace']), secret: z.string().min(1).max(400) }).strict();

export const POST = route(async (req: Request, _c: any, u) => {
  rateLimit('keys', u.id);
  const b = await body(req, Add);
  if (!secretsAvailable()) return fail('Saving API keys needs TRUECUT_ENCRYPTION_KEY on the server. Ask whoever runs TrueCut to set it (see docs/DEPLOYMENT.md).', 503, 'no_encryption_key');
  if (b.scope === 'workspace') await requireOwner(u);
  if (b.scope === 'personal' && (!authEnabled() || !u.id)) return fail('Personal keys need sign-in. On this machine, add a workspace key instead.', 400);
  const bad = looksLike(b.provider, b.secret);
  if (bad) return fail(bad, 400, 'bad_key_format');
  const check = b.provider === 'anthropic' ? await testAnthropicKey(b.secret) : await testElevenKey(b.secret);
  if (!check.ok) return fail(check.message, 400, 'key_rejected');
  const key = await saveKey({ workspaceId: u.workspaceId, userId: b.scope === 'personal' ? u.id : null, provider: b.provider, secret: b.secret, createdBy: u.id || null });
  return ok({ key, check }, 201);
});
