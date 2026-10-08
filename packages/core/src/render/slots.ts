// Renders are the expensive part (Chromium + ffmpeg). However a render is reached (an Edit-bay
// button, or a Nick turn), at most TRUECUT_RENDER_SLOTS run at once in a process; the rest wait.
import { env } from '@truecut/config';

const g = globalThis as any;
const st: { active: number; waiting: (() => void)[] } = g.__tcRenderSlots || (g.__tcRenderSlots = { active: 0, waiting: [] });
const limit = () => Math.max(1, Number(env('TRUECUT_RENDER_SLOTS', '1')) || 1);

export async function withRenderSlot<T>(fn: () => Promise<T>, onWait?: () => void): Promise<T> {
  if (st.active >= limit()) { onWait?.(); await new Promise<void>((r) => st.waiting.push(r)); }
  st.active++;
  try { return await fn(); }
  finally { st.active--; st.waiting.shift()?.(); }
}
