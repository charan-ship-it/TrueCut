import { ok, route } from '@/lib/http';
import { revokeToken } from '@truecut/db';
export const dynamic = 'force-dynamic';
export const DELETE = route(async (_r: Request, { params }: { params: { id: string } }, u) => { await revokeToken(params.id, u.id); return ok({ revoked: true }); });
