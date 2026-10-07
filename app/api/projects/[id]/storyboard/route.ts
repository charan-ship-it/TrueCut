import { ok, route } from '@/lib/http';
import { startStoryboard } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export const POST = route(async (_r: Request, { params }: { params: { id: string } }) => ok({ jobs: [startStoryboard(params.id).id] }));
