import type { Action } from '@truecut/core/director/agent';
import type { Project } from '@truecut/shared/types';
import { detectSources } from '@truecut/shared/detect';

/** The chat action from a request body: {action} or {text}. Files are uploaded first (PUT …/uploads)
 *  and arrive here as attachments {kind:'upload', ref:<source id>}. */
export async function readAction(req: Request): Promise<Action> {
  const b = await req.json().catch(() => ({}));
  return b.action || { type: 'message', text: String(b.text || '') };
}

/** Composer options sent with the first message (length, formats, type, look), plus a name from the first source. */
export function applyOptions(pp: Project, action: Action) {
  const opts = (action as any).options || {};
  if (opts.length) pp.intake.length = Number(opts.length);
  if (opts.formats?.length) pp.intake.formats = opts.formats;
  if (opts.kind) pp.kind = opts.kind;
  if (opts.preset) pp.style = { preset: opts.preset } as any;
  if (pp.name === 'Untitled video' && action.type === 'message') {
    // name it after the site or repo; an uploaded recording names a founder talk; documents leave it to Nick
    const media = /\.(mp4|mov|m4v|webm|mkv|mp3|wav|m4a|aac|ogg|flac)$/i;
    const all = [...detectSources(action.text), ...(action.attachments || [])];
    const first = all.find((a) => a.kind === 'url' || a.kind === 'path') || all.find((a) => a.kind === 'upload' && media.test(a.label));
    if (first) pp.name = first.label.replace(/^www\./, '').split('/')[0].replace(/\.(png|jpe?g|webp|gif|md|txt|csv|html?|json|vtt|srt|mp4|mov|m4v|webm|mkv|mp3|wav|m4a|aac|ogg|flac)$/i, '') || pp.name;
  }
}
