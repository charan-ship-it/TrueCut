// Who a job (or an API request) is working for: their workspace, their API keys and model choices.
// Registered with the queue so every job runs inside it; API routes call withUserContext().
import { runWithContext } from '@truecut/config';
import { projectMeta, resolveRunContext } from '@truecut/db';
import { setContextProvider } from '@truecut/queue';

setContextProvider(async (job) => {
  const workspaceId = job.projectId ? (await projectMeta(job.projectId))?.workspaceId : (job.payload as any)?.workspaceId;
  return resolveRunContext({ workspaceId, userId: job.createdBy, projectId: job.projectId, jobId: job.id });
});

/** Run `fn` with a person's keys and models (for API routes that call Claude or ElevenLabs directly). */
export async function withUserContext<T>(u: { workspaceId: string; userId?: string | null; projectId?: string | null }, fn: () => Promise<T>): Promise<T> {
  const ctx = await resolveRunContext({ workspaceId: u.workspaceId, userId: u.userId || null, projectId: u.projectId || null });
  return runWithContext(ctx, fn);
}
