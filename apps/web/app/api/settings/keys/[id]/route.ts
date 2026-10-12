import { ok, route, fail } from '@/lib/http';
import { requireOwner } from '@/lib/auth';
import { deleteKey, getKeyRow } from '@truecut/db';
export const dynamic = 'force-dynamic';

export const DELETE = route(async (_r: Request, { params }: { params: { id: string } }, u) => {
  const k = await getKeyRow(params.id);
  if (!k || k.workspaceId !== u.workspaceId) return fail('Key not found', 404);
  if (k.userId) { if (k.userId !== u.id) return fail('Key not found', 404); }
  else await requireOwner(u);
  await deleteKey(k.id, u.workspaceId);
  return ok({ deleted: true });
});
