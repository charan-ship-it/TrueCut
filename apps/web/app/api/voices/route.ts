import { ok, route } from '@/lib/http';
import { listVoices } from '@truecut/core/audio/voice';
import { config } from '@truecut/config';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ok({ voices: await listVoices().catch(() => []), default: config.defaultVoice, enabled: !!config.elevenKey }));
