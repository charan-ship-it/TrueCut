import { addSource, ingestUpload } from '@truecut/core/sources/ingest';
import type { Action, Attachment } from '@truecut/core/director/agent';

/** Parse a chat request: JSON {action} or multipart (files + "action" JSON field). Uploads are ingested before the turn starts. */
export async function readAction(req: Request, pid: string): Promise<Action> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const action = JSON.parse(String(fd.get('action') || '{"type":"message","text":""}')) as Action;
    const files = fd.getAll('files').filter((f): f is File => typeof f !== 'string');
    const atts: Attachment[] = [];
    for (const f of files) { const s = await addSource(pid, 'upload', f.name); await ingestUpload(pid, s.id, f.name, Buffer.from(await f.arrayBuffer())); atts.push({ kind: 'upload', label: f.name, ref: s.id }); }
    if (action.type === 'message') action.attachments = [...(action.attachments || []), ...atts];
    return action;
  }
  const b = await req.json().catch(() => ({}));
  return b.action || { type: 'message', text: String(b.text || '') };
}

