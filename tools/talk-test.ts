// Dev harness: builds a talk project from a recording + an ElevenLabs STT json, applies a plan, renders.
// npx tsx tools/talk-test.ts <video> <stt.json> [plan.json] [formats]
import fs from 'node:fs';
import path from 'node:path';
import { createProject, projectPath, updateProject, getProject } from '@truecut/db';
import { addSource } from '@truecut/core/sources/ingest';
import { probeMedia, applyPlan, loadWords, guardTalk, buildProxies, renderTalk } from '@truecut/core/talk/talk';
const [, , video, sttFile, planFile, fmts = '9x16'] = process.argv;
const log = (m: string) => console.log('·', m);
(async () => {
  const id = 'talk-test';
  try { fs.rmSync(projectPath(id), { recursive: true, force: true }); } catch {}
  const p = createProject('Talk test', id);
  const s = addSource(id, 'upload', path.basename(video));
  const mid = 'mtest01'; const file = `sources/${mid}${path.extname(video)}`;
  fs.mkdirSync(projectPath(id, 'talk'), { recursive: true }); fs.copyFileSync(video, projectPath(id, file));
  const info = await probeMedia(projectPath(id, file));
  const stt = JSON.parse(fs.readFileSync(sttFile, 'utf8'));
  const words = stt.words.filter((w: any) => w.type === 'word').map((w: any) => ({ w: w.text.trim(), s: w.start, e: w.end, sp: w.speaker_id }));
  fs.writeFileSync(projectPath(id, `talk/${mid}.words.json`), JSON.stringify(words));
  updateProject(id, (pp) => { pp.kind = 'talk'; pp.style = { preset: 'editorial', useBrandAccent: true } as any; pp.intake.formats = fmts.split(',') as any; pp.intake.productName = 'Scribe';
    pp.talk.media.push({ id: mid, sourceId: s.id, name: path.basename(video), file, duration: info.duration, w: info.w, h: info.h, hasVideo: info.hasVideo, wordsFile: `talk/${mid}.words.json`, words: words.length, speakers: ['speaker_0'], face: { x: 0.5, y: Number(process.env.FACEY || 0.5) } }); });
  console.log('media', info);
  const plan = JSON.parse(fs.readFileSync(planFile!, 'utf8'));
  applyPlan(id, plan, words, getProject(id).talk.media[0]);
  console.log('guard removed', guardTalk(id));
  const q = getProject(id); console.log('duration', q.talk.duration, 'beats', q.talk.beats.length, 'segments', q.talk.segments.length);
  await buildProxies(id, log);
  if (process.env.RENDER) await renderTalk(id, fmts.split(',') as any, log);
  console.log(JSON.stringify(getProject(id).renders.slice(0, 2)));
})().catch((e) => { console.error(e); process.exit(1); });
