// Runs against any S3-compatible endpoint: TRUECUT_TEST_S3_ENDPOINT (e.g. MinIO in CI, moto locally).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';

const endpoint = process.env.TRUECUT_TEST_S3_ENDPOINT;
const key = process.env.TRUECUT_TEST_S3_KEY || 'test', secret = process.env.TRUECUT_TEST_S3_SECRET || 'test';

describe.skipIf(!endpoint)('bucket sync', () => {
  let s: typeof import('../src/index');
  beforeAll(async () => {
    Object.assign(process.env, { S3_ENDPOINT: endpoint, S3_BUCKET: 'truecut-test', S3_ACCESS_KEY_ID: key, S3_SECRET_ACCESS_KEY: secret, S3_REGION: 'us-east-1', S3_FORCE_PATH_STYLE: '1' });
    const c = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: key, secretAccessKey: secret } });
    await c.send(new CreateBucketCommand({ Bucket: 'truecut-test' })).catch(() => {});
    s = await import('../src/index');
  });
  const otherWorker = (pid: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-w2-')); const prev = process.env.TRUECUT_DATA; process.env.TRUECUT_DATA = d; return () => { process.env.TRUECUT_DATA = prev; }; };

  it('flushes a job\'s files and hydrates them on another machine', async () => {
    const pid = 'sync-' + Date.now().toString(36);
    expect(s.storageDriver()).toBe('s3');
    s.ensureProjectDirs(pid);
    s.writeAtomic(s.projectPath(pid, 'renders/a.mp4'), Buffer.alloc(200_000, 7));
    s.writeAtomic(s.projectPath(pid, 'sources/s1.txt'), 'hello');
    expect(await s.flush(pid)).toEqual({ uploaded: 2, deleted: 0 });
    expect(await s.flush(pid)).toEqual({ uploaded: 0, deleted: 0 }); // nothing changed
    const back = otherWorker(pid);
    try {
      expect((await s.hydrate(pid)).downloaded).toBe(2);
      expect(fs.readFileSync(s.projectPath(pid, 'sources/s1.txt'), 'utf8')).toBe('hello');
      expect((await s.hydrate(pid)).downloaded).toBe(0);
      // this worker deletes one file and adds another
      fs.rmSync(s.projectPath(pid, 'sources/s1.txt'));
      s.writeAtomic(s.projectPath(pid, 'vo/x.mp3'), 'mp3');
      expect(await s.flush(pid)).toEqual({ uploaded: 1, deleted: 1 });
    } finally { back(); }
    // the first machine catches up: deleted file is not re-uploaded, new file arrives
    await s.hydrate(pid);
    expect(fs.existsSync(s.projectPath(pid, 'vo/x.mp3'))).toBe(true);
    const got = await s.getObject(pid, 'renders/a.mp4', 'bytes=0-9');
    expect(got?.size).toBe(10);
    expect(await s.signedUrl(pid, 'renders/a.mp4')).toMatch(/X-Amz-Signature/);
    await s.removeProject(pid);
    expect(await s.headObject(pid, 'renders/a.mp4')).toBeNull();
  });

  it('never deletes files another worker added', async () => {
    const pid = 'sync2-' + Date.now().toString(36);
    s.ensureProjectDirs(pid);
    await s.hydrate(pid); // this worker knows nothing yet
    const back = otherWorker(pid);
    try { s.ensureProjectDirs(pid); s.writeAtomic(s.projectPath(pid, 'assets/new.jpg'), 'jpg'); await s.flush(pid); } finally { back(); }
    s.writeAtomic(s.projectPath(pid, 'audio/mix.wav'), 'wav');
    expect((await s.flush(pid)).deleted).toBe(0);
    expect(await s.headObject(pid, 'assets/new.jpg')).not.toBeNull();
    await s.removeProject(pid);
  });
});
