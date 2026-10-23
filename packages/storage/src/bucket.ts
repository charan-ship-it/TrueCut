// S3-compatible bucket (Railway Buckets, AWS S3, Cloudflare R2, MinIO). Objects live at
//   projects/<projectId>/<path inside the project folder>
// Configure with S3_* variables, or Railway's own bucket variables (BUCKET, ENDPOINT, …) as-is.
import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, CopyObjectCommand, type ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@truecut/config';
import type { Readable } from 'node:stream';

export type BucketConfig = { bucket: string; endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean };

export function bucketConfig(): BucketConfig | null {
  const bucket = env('S3_BUCKET') || env('BUCKET');
  if (!bucket) return null;
  return {
    bucket,
    endpoint: env('S3_ENDPOINT') || env('ENDPOINT') || undefined,
    region: env('S3_REGION') || env('REGION') || 'auto',
    accessKeyId: env('S3_ACCESS_KEY_ID') || env('ACCESS_KEY_ID') || env('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY') || env('SECRET_ACCESS_KEY') || env('AWS_SECRET_ACCESS_KEY'),
    forcePathStyle: /^(1|true|yes)$/i.test(env('S3_FORCE_PATH_STYLE')),
  };
}

const g = globalThis as any;
function client(): { s3: S3Client; cfg: BucketConfig } {
  const cfg = bucketConfig();
  if (!cfg) throw new Error('No bucket configured (set S3_BUCKET or BUCKET).');
  if (!g.__tcS3) g.__tcS3 = new S3Client({ region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: cfg.forcePathStyle, credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } });
  return { s3: g.__tcS3, cfg };
}

export const projectPrefix = (pid: string) => `projects/${pid}/`;
export const keyOf = (pid: string, rel: string) => projectPrefix(pid) + rel.replace(/^\/+/, '');
const clean = (etag?: string) => (etag || '').replace(/"/g, '');

export type RemoteObject = { rel: string; size: number; etag: string };

export async function listObjects(pid: string): Promise<RemoteObject[]> {
  const { s3, cfg } = client(); const prefix = projectPrefix(pid);
  const out: RemoteObject[] = []; let token: string | undefined;
  do {
    const r: ListObjectsV2CommandOutput = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents || []) if (o.Key && !o.Key.endsWith('/')) out.push({ rel: o.Key.slice(prefix.length), size: o.Size || 0, etag: clean(o.ETag) });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export async function putObject(pid: string, rel: string, body: Buffer | Readable, contentType?: string): Promise<string> {
  const { s3, cfg } = client();
  const up = new Upload({ client: s3, params: { Bucket: cfg.bucket, Key: keyOf(pid, rel), Body: body, ContentType: contentType }, queueSize: 4, partSize: 16 * 1024 * 1024 });
  const r: any = await up.done();
  return clean(r.ETag);
}

export async function getObject(pid: string, rel: string, range?: string) {
  const { s3, cfg } = client();
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: keyOf(pid, rel), Range: range }));
    return { body: r.Body as Readable, size: r.ContentLength || 0, range: r.ContentRange, etag: clean(r.ETag), type: r.ContentType };
  } catch (e: any) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') return null; if (e?.$metadata?.httpStatusCode === 416) return { body: null, size: 0, range: undefined, etag: '', type: undefined, unsatisfiable: true } as any; throw e; }
}

export async function headObject(pid: string, rel: string) {
  const { s3, cfg } = client();
  try { const r = await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: keyOf(pid, rel) })); return { size: r.ContentLength || 0, etag: clean(r.ETag) }; }
  catch (e: any) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null; throw e; }
}

export async function deleteObjects(pid: string, rels: string[]) {
  if (!rels.length) return;
  const { s3, cfg } = client();
  for (let i = 0; i < rels.length; i += 1000) {
    await s3.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: rels.slice(i, i + 1000).map((r) => ({ Key: keyOf(pid, r) })), Quiet: true } }));
  }
}

/** A short-lived link straight to the object (bucket egress is free on Railway; the web app's isn't). */
export async function signedUrl(pid: string, rel: string, opts: { seconds?: number; download?: string; type?: string } = {}) {
  const { s3, cfg } = client();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: keyOf(pid, rel), ResponseContentDisposition: opts.download ? `attachment; filename="${opts.download.replace(/"/g, '')}"` : undefined, ResponseContentType: opts.type }), { expiresIn: opts.seconds || 3600 });
}

// ───────── raw keys (used by the library; project helpers above add the projects/<id>/ prefix) ─────────
export async function putKey(key: string, body: Buffer | Readable, contentType?: string) {
  const { s3, cfg } = client();
  const r: any = await new Upload({ client: s3, params: { Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }, queueSize: 4, partSize: 16 * 1024 * 1024 }).done();
  return clean(r.ETag);
}
export async function getKey(key: string, range?: string) {
  const { s3, cfg } = client();
  try { const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key, Range: range })); return { body: r.Body as Readable, size: r.ContentLength || 0, range: r.ContentRange, type: r.ContentType }; }
  catch (e: any) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') return null; throw e; }
}
export async function deleteKeys(keys: string[]) {
  if (!keys.length) return; const { s3, cfg } = client();
  for (let i = 0; i < keys.length; i += 1000) await s3.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
}
export async function copyKey(from: string, to: string) {
  const { s3, cfg } = client();
  await s3.send(new CopyObjectCommand({ Bucket: cfg.bucket, CopySource: `${cfg.bucket}/${from.split('/').map(encodeURIComponent).join('/')}`, Key: to }));
}
export async function signedKeyUrl(key: string, opts: { seconds?: number; download?: string; type?: string } = {}) {
  const { s3, cfg } = client();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: key, ResponseContentDisposition: opts.download ? `attachment; filename="${opts.download.replace(/["\\\r\n]/g, '_')}"` : undefined, ResponseContentType: opts.type }), { expiresIn: opts.seconds || 3600 });
}

/** Write, read and delete one tiny object so a wrong key, endpoint or region shows up here instead of in the middle of an upload. */
export async function bucketCheck(): Promise<{ configured: boolean; ok: boolean; error?: string; bucket?: string; host?: string; region?: string }> {
  const cfg = bucketConfig();
  if (!cfg) return { configured: false, ok: true };
  const info = { configured: true, bucket: cfg.bucket, host: cfg.endpoint ? new URL(cfg.endpoint).host : 'aws', region: cfg.region };
  if (!cfg.accessKeyId || !cfg.secretAccessKey) return { ...info, ok: false, error: 'The bucket access key or secret is not set on this service.' };
  try {
    const key = `_health/ping-${Date.now()}`;
    await putKey(key, Buffer.from('ok'), 'text/plain');
    const r = await getKey(key); if (!r) throw new Error('wrote an object but could not read it back');
    await deleteKeys([key]);
    return { ...info, ok: true };
  } catch (e: any) { return { ...info, ok: false, error: `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 200)}` }; }
}
