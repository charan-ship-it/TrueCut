import { readText } from '@truecut/storage';
import type { Project } from '@truecut/shared/types';

/** All extracted source text, labelled per source, for the AI and the fact checker. */
export function corpus(p: Project, max = 160_000): string {
  let out = '';
  for (const s of p.sources) {
    if (s.status !== 'ready' || !s.textFile) continue;
    out += `\n\n===== SOURCE ${s.id} · ${s.kind} · ${s.label} =====\n${readText(p.id, s.textFile)}`;
    if (out.length > max) break;
  }
  return out.slice(0, max);
}
