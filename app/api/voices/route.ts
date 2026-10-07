import { ok, route } from '@/lib/http';
import { listVoices } from '@/lib/voice';
import { config } from '@/lib/env';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ok({ voices: await listVoices().catch(() => []), default: config.defaultVoice, enabled: !!config.elevenKey }));
