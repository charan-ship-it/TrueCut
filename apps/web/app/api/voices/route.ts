import { ok, route } from '@/lib/http';
import { listVoices } from '@truecut/core/audio/voice';
import { withUserContext } from '@truecut/core/system/context';
import { config } from '@truecut/config';
export const dynamic = 'force-dynamic';
/** The voice library of whichever ElevenLabs key this person's jobs would use. */
export const GET = route(async (_r: Request, _c: any, u) => ok(await withUserContext({ workspaceId: u.workspaceId, userId: u.id }, async () => ({
  voices: await listVoices().catch(() => []), default: config.defaultVoice, enabled: !!config.elevenKey,
}))));
