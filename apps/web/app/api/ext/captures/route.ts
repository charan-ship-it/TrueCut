import { ok, tokenRoute, preflight } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { readCapture, storeCaptures } from '@/lib/library';
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
/** A capture from the Chrome extension: multipart "image" + "meta" {title, url, product, tags, capturedAt}. */
export const POST = tokenRoute(async (req: Request, _c: any, u) => {
  rateLimit('upload', u.id);
  const { files, meta } = await readCapture(req);
  const [item] = await storeCaptures(u, files.slice(0, 1), meta, 'extension');
  return ok({ item }, item.duplicate ? 200 : 201);
});
