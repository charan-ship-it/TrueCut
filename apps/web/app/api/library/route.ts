import { ok, route } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { listLibrary, libraryProducts } from '@truecut/db';
import { assetView, readCapture, storeCaptures } from '@/lib/library';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request, _c: any, u) => {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get('limit')) || 60, 200); const offset = Math.max(Number(sp.get('offset')) || 0, 0);
  const [items, products] = await Promise.all([
    listLibrary(u.workspaceId, { q: sp.get('q') || undefined, product: sp.get('product') || undefined, limit: limit + 1, offset }),
    offset ? Promise.resolve(undefined) : libraryProducts(u.workspaceId),
  ]);
  return ok({ items: items.slice(0, limit).map(assetView), more: items.length > limit, products });
});

/** Upload from the Library page (one or many images). */
export const POST = route(async (req: Request, _c: any, u) => {
  rateLimit('upload', u.id);
  const { files, meta } = await readCapture(req);
  return ok({ items: await storeCaptures(u, files, meta, 'upload') }, 201);
});
