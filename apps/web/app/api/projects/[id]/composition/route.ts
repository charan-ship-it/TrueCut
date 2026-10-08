import { ok, projectRoute } from '@/lib/http';
import { getProject } from '@truecut/db';
import { toComposition } from '@truecut/shared/compose';
export const dynamic = 'force-dynamic';
export const GET = projectRoute(async (_r: Request, { params }: { params: { id: string } }) => ok(toComposition(await getProject(params.id))));
