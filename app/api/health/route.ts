import { ok, route } from '@/lib/http';
import { doctor } from '@/lib/doctor';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ok(await doctor({ launch: false })));
