import { ok, route } from '@/lib/http';
import { getProject } from '@/lib/store';
import { toComposition } from '@/lib/compose';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, { params }: { params: { id: string } }) => ok(toComposition(getProject(params.id))));
