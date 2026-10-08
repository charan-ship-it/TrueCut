// One command from source to finished video.
//   npm run make -- --url https://example.com [--path ../repo] [--text notes.md] [--name "Acme"]
//                   [--length 30] [--formats 4x5,9x16] [--cta "Book a demo"] [--audience "..."] [--yes] [--no-render]
// Interactive by default: it asks the questions the AI could not answer. --yes accepts the suggestions.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { createProject, getProject, updateProject, projectPath } from '@truecut/db';
import { addSource, ingestUrl, ingestPath, ingestText } from '@truecut/core/sources/ingest';
import { analyze, storyboard } from '@truecut/core/ads/ai';
import { voiceAll } from '@truecut/core/audio/voice';
import { renderProject } from '@truecut/core/render/render';
import { checkScenes } from '@truecut/shared/facts';
import { config, loadEnv } from '@truecut/config';
import path from 'node:path';

loadEnv();
const argv = process.argv.slice(2);
const all = (n: string) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []));
const one = (n: string) => all(n)[0];
const has = (n: string) => argv.includes(n);
const log = (m: string, pct?: number) => console.log(`${pct != null ? `[${String(Math.round(pct)).padStart(3)}%] ` : '        '}${m}`);
const urls = all('--url'), paths = all('--path'), texts = all('--text');
const resume = one('--project');
if (!resume && !urls.length && !paths.length && !texts.length) { console.error('Give at least one source: --url, --path or --text <file>'); process.exit(1); }
const yes = has('--yes') || !process.stdin.isTTY;
const rl = yes ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q: string, def = '') => { if (!rl) return def; const a = (await rl.question(`\n? ${q}${def ? ` [${def}]` : ''}\n> `)).trim(); return a || def; };

console.log(`\nTrueCut · Claude ${config.anthropicKey ? 'on' : 'OFF (template mode)'} · ElevenLabs ${config.elevenKey ? 'on' : 'OFF (no voice)'}\n`);
const p0 = resume ? getProject(resume) : createProject(one('--name') || (urls[0] ? new URL(/^https?:/.test(urls[0]) ? urls[0] : 'https://' + urls[0]).hostname.replace(/^www\./, '') : path.basename(path.resolve(paths[0] || 'video'))));
const id = p0.id;
console.log(`Project ${id} → ${projectPath(id)}\n`);
if (!resume) for (const u of urls) { const s = addSource(id, 'url', u); await ingestUrl(id, s.id, /^https?:/.test(u) ? u : 'https://' + u, log); }
if (!resume) for (const d of paths) { const s = addSource(id, 'path', path.resolve(d)); await ingestPath(id, s.id, path.resolve(d), log); }
if (!resume) for (const t of texts) { const s = addSource(id, 'text', t, path.basename(t)); ingestText(id, s.id, fs.readFileSync(t, 'utf8')); }

if (!resume || !getProject(id).facts.length) await analyze(id, log);
let p = getProject(id);
const pr: any = p.product;
console.log(`\n${pr.name || ''} — ${pr.oneLiner || ''}\nFacts: ${p.facts.length} (${p.facts.filter((f) => f.status === 'verified').length} verified) · Visuals: ${p.visuals.length}`);
const intake = { ...p.intake };
intake.productName = await ask('Product name to say in the video', intake.productName);
intake.brandName = await ask('Company / brand', intake.brandName);
intake.audience = one('--audience') || (await ask('Who is this video for?', intake.audience));
intake.cta = one('--cta') || (await ask('Call to action', intake.cta));
intake.length = Number(one('--length') || (await ask('Length in seconds (15/30/45)', String(intake.length)))) || 30;
intake.formats = (one('--formats') || intake.formats.join(',')).split(',') as any;
const questions: typeof p.questions = [];
for (const q of p.questions) questions.push({ ...q, answer: await ask(q.question, q.suggested) });
updateProject(id, (pp) => { pp.intake = intake; pp.questions = questions; });

if (!resume || !getProject(id).scenes.length || has('--restory')) await storyboard(id, log);
p = getProject(id);
console.log(`\nStoryboard — ${p.brief?.title || ''}\n${p.scenes.map((s, i) => `  ${String(i + 1).padStart(2)}. [${s.type}] ${s.vo?.text || ''}`).join('\n')}`);
const issues = checkScenes(p);
for (const i of issues) console.log(`  ${i.level === 'error' ? '✗' : '!'} ${i.message}`);
if (issues.some((i) => i.level === 'error')) { console.log('\nSome numbers are not backed by facts. Open the app to fix them:  npm run dev  →  http://localhost:3100/p/' + id); if (!has('--force')) { rl?.close(); process.exit(2); } }
if (config.elevenKey) await voiceAll(id, log); else log('Skipping voice (no ELEVENLABS_API_KEY)');
if (has('--no-render')) { console.log(`\nReady to render: npm run render -- ${id}`); rl?.close(); process.exit(0); }
const outs = await renderProject(id, intake.formats, log);
console.log('\nDone:'); for (const o of outs) console.log('  ' + projectPath(id, o.file));
rl?.close();
