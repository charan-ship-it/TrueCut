import fs from 'node:fs';
import path from 'node:path';
import { projectPath } from '@truecut/db';
export const dynamic = 'force-dynamic';
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.srt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
export async function GET(req: Request, { params }: { params: { id: string; path: string[] } }) {
  let f: string;
  try { f = projectPath(params.id, params.path.join('/')); } catch { return new Response('Bad path', { status: 400 }); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('Not found', { status: 404 });
  const size = fs.statSync(f).size; const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const dl = new URL(req.url).searchParams.has('download');
  const headers: Record<string, string> = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
  if (dl) headers['content-disposition'] = `attachment; filename="${path.basename(f)}"`;
  const range = req.headers.get('range');
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/); const start = m && m[1] ? +m[1] : 0; const end = m && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    const stream = fs.createReadStream(f, { start, end });
    return new Response(stream as any, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(fs.createReadStream(f) as any, { headers: { ...headers, 'content-length': String(size) } });
}
