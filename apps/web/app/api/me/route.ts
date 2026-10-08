import { ok, route } from '@/lib/http';
import { authEnabled } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, _c: any, user) => ok({ user: { id: user.id, name: user.name, email: user.email, image: user.image }, auth: authEnabled() }));
