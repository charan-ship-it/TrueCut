import { z } from 'zod';
import { ok, route, body, fail } from '@/lib/http';
import { getLibraryAsset, updateLibraryAsset, softDeleteLibraryAsset } from '@truecut/db';
import { deleteLibraryFiles } from '@truecut/storage';
import { cleanTags } from '@truecut/core/library/library';
import { assetView } from '@/lib/library';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };

export const GET = route(async (_r: Request, { params }: C, u) => {
  const a = await getLibraryAsset(params.id, u.workspaceId);
  return a ? ok(assetView(a)) : fail('Not found', 404);
});

const Patch = z.object({ title: z.string().max(200).optional(), product: z.string().max(60).nullable().optional(), tags: z.array(z.string().max(30)).max(12).optional(), sensitiveOk: z.boolean().optional() }).strict();
export const PATCH = route(async (req: Request, { params }: C, u) => {
  const a = await getLibraryAsset(params.id, u.workspaceId);
  if (!a) return fail('Not found', 404);
  const b = await body(req, Patch);
  const patch: any = {};
  if (b.title !== undefined) patch.title = b.title.trim() || a.title;
  if (b.product !== undefined) patch.product = b.product?.trim() || null;
  if (b.tags) patch.tags = cleanTags(b.tags);
  // someone checked the personal data and decided it's fine to show
  if (b.sensitiveOk !== undefined && a.analysis) patch.analysis = { ...(a.analysis as any), sensitive: { ...(a.analysis as any).sensitive, has: !b.sensitiveOk, reviewedBy: u.id || 'local' } };
  return ok(assetView(await updateLibraryAsset(a.id, patch)));
});

export const DELETE = route(async (_r: Request, { params }: C, u) => {
  const a = await softDeleteLibraryAsset(params.id, u.workspaceId);
  if (!a) return fail('Not found', 404);
  // the row stays (videos may reference it); the files go
  await deleteLibraryFiles(u.workspaceId, [a.file, `${params.id}_t.jpg`]).catch((e) => console.error('[library] delete files', e?.message));
  return ok({ deleted: true });
});
