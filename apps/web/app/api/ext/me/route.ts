import { ok, tokenRoute, preflight } from '@/lib/http';
import { libraryProducts } from '@truecut/db';
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
/** The extension's "Connected as …" check, plus product names for the picker. */
export const GET = tokenRoute(async (_r: Request, _c: any, u) => ok({ user: { name: u.name, email: u.email }, workspaceId: u.workspaceId, products: (await libraryProducts(u.workspaceId)).map((p) => p.product), maxBytes: 25 * 1024 * 1024 }));
