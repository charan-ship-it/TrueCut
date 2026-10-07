// Visual QA: renders one frame per scene for every creative direction → a contact sheet per direction.
// node scripts/qa-directions.mjs [outDir] [format] [presets,comma]
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path'; import http from 'http'; import { execFileSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import { layout } from '../public/engine/timeline.js';
import { DIRECTIONS } from '../public/engine/styles.js';
const [, , out = 'qa-out', fmt = '4x5', only = ''] = process.argv;
if (!fs.existsSync('scripts/fixtures/agent-nick-demo.json')) { console.log('qa-directions needs the private demo fixtures in scripts/fixtures/.'); process.exit(0); }
const base = JSON.parse(fs.readFileSync('scripts/fixtures/agent-nick-demo.json', 'utf8'));
const extra = [
  { id: 'k1', type: 'kinetic', vo: { text: 'Stop guessing. Start shipping.' }, props: { words: ['Stop', 'guessing.', 'Start', 'shipping.'] } },
  { id: 'sp1', type: 'split', vo: { text: 'Every call becomes a brief.' }, props: { image: 'transcript', kicker: 'FROM THE CALL', title: 'Every call becomes a brief', body: 'Nick reads the transcript and pulls the ideas out.' } },
  { id: 'l1', type: 'list', vo: { text: 'Three steps. No busywork.' }, props: { title: 'How it works', style: 'numbers', items: ['Listen to the call', 'Score every idea', 'Draft the post'] } },
  { id: 'c1', type: 'compare', vo: { text: 'From blank page to drafted post.' }, props: { beforeLabel: 'Before', afterLabel: 'With Nick', before: ['Blank page', 'Lost ideas', 'Hours of edits'], after: ['Drafted post', 'Every idea scored', 'Minutes'] } },
];
const scenes = [...base.scenes.slice(0, 4), ...extra, ...base.scenes.slice(4)];
const presets = only ? only.split(',') : Object.keys(DIRECTIONS);
const dims = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] }[fmt];
const roots = { '/engine/': path.resolve('public/engine'), '/assets/': path.resolve('scripts/fixtures/agent-nick') };
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const k = Object.keys(roots).find((r) => u.startsWith(r)); if (!k) { res.writeHead(404); return res.end(); } const f = path.join(roots[k], u.slice(k.length)); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const b = await chromium.launch({ executablePath: process.env.NICK_MOTION_CHROMIUM || undefined });
fs.mkdirSync(out, { recursive: true });
for (const preset of presets) {
  const comp = { ...base, scenes, style: { preset } };
  const L = layout(comp);
  const pg = await b.newPage({ viewport: { width: dims[0], height: dims[1] } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript((c) => { window.__COMP__ = c; }, comp);
  await pg.goto(`http://127.0.0.1:${port}/engine/player.html?render=1&format=${fmt}&assetBase=/assets/`);
  await pg.waitForFunction(() => window.ready); await pg.evaluate(() => window.ready);
  const dir = path.join(out, preset); fs.mkdirSync(dir, { recursive: true });
  let i = 0;
  for (const s of L.scenes) { const t = s.start + Math.min(s.dur * 0.62, s.dur - 0.35); await pg.evaluate((t) => window.render(t), t); await pg.screenshot({ path: `${dir}/${String(i++).padStart(2, '0')}.png`, scale: 'css' }); }
  // a transition frame too
  await pg.evaluate((t) => window.render(t), L.scenes[2].start + 0.06); await pg.screenshot({ path: `${dir}/${String(i++).padStart(2, '0')}.png` });
  await pg.close();
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-pattern_type', 'glob', '-i', `${dir}/*.png`, '-vf', `scale=270:-1,tile=8x2:padding=6:color=gray`, '-frames:v', '1', path.join(out, `sheet-${preset}.jpg`)]);
  console.log(preset, L.duration.toFixed(1) + 's', errs.length ? 'ERRORS: ' + [...new Set(errs)].join(' | ') : 'ok');
}
await b.close(); srv.close();
