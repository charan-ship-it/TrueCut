// Dev helper: render still frames of a composition JSON for visual QA.
// node scripts/dev-stills.mjs <comp.json> <4x5|9x16|1x1> <t1,t2,...> <outDir> [assetBaseUrl]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';
const [, , compPath, fmt, times, out, assetBase = ''] = process.argv;
const comp = JSON.parse(fs.readFileSync(compPath, 'utf8'));
const dims = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] }[fmt];
const b = await chromium.launch({ executablePath: process.env.NICK_MOTION_CHROMIUM || undefined });
const pg = await b.newPage({ viewport: { width: dims[0], height: dims[1] } });
pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
pg.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await pg.addInitScript((c) => { window.__COMP__ = c; }, comp);
const roots = { '/engine/': path.resolve('public/engine'), '/assets/': path.resolve(assetBase || '.') };
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const k = Object.keys(roots).find((r) => u.startsWith(r));
  if (!k) { res.writeHead(404); return res.end(); } const f = path.join(roots[k], u.slice(k.length)); if (!f.startsWith(roots[k]) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const player = `http://127.0.0.1:${port}/engine/player.html`;
await pg.goto(`${player}?render=1&format=${fmt}&assetBase=/assets/`);
await pg.waitForFunction(() => window.ready);
await pg.evaluate(() => window.ready);
console.log('DUR', await pg.evaluate(() => window.DUR));
fs.mkdirSync(out, { recursive: true });
for (const t of times.split(',')) {
  await pg.evaluate((t) => window.render(+t), t);
  await pg.screenshot({ path: `${out}/s_${fmt}_${String(t).padStart(5, '0')}.png` });
}
await b.close(); srv.close();
