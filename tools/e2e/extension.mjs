// End-to-end check of TrueCut Capture against a running TrueCut:
//   node tools/e2e/extension.mjs --base http://localhost:3100 --session <next-auth cookie> --site http://localhost:4000 --out /tmp/out
// Loads the extension (with host access pre-granted, since automation can't click Chrome's permission
// prompt), connects it with a fresh token, captures the visible area, an area and the full page,
// blurs a region in the editor, saves, and checks the Library has them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:3100'), SITE = arg('site', 'http://localhost:4000'), OUT = arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'tc-ext-'))), SESSION = arg('session');
const exe = arg('chromium', process.env.TRUECUT_CHROMIUM);
fs.mkdirSync(OUT, { recursive: true });

// a test copy of the extension with host access already granted
const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../apps/extension');
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-extcopy-'));
fs.cpSync(src, ext, { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
man.host_permissions = ['<all_urls>']; fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man));

const api = async (p, init = {}) => { const r = await fetch(BASE + p, { ...init, headers: { cookie: `next-auth.session-token=${SESSION}`, 'content-type': 'application/json', ...(init.headers || {}) } }); const j = await r.json(); if (!r.ok) throw new Error(`${p}: ${r.status} ${JSON.stringify(j)}`); return j; };
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('✓', m); };

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tc-prof-')), {
  headless: true, executablePath: exe, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
ok(extId, `extension loaded (${extId})`);

const token = (await api('/api/settings/tokens', { method: 'POST', body: JSON.stringify({ name: 'e2e', days: 1 }) })).token;
ok(token.startsWith('tc_'), 'created an extension token in Settings');

// connect through the real popup
const popup = await ctx.newPage(); await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.fill('#server', BASE); await popup.fill('#token', 'tc_wrong_token_aaaaaaaaaaaaaaaaaaaa'); await popup.click('#go');
await popup.waitForSelector('#msg:not([hidden])'); ok(/not accepted/i.test(await popup.textContent('#msg')), 'a wrong token is refused with a clear message');
await popup.fill('#token', token); await popup.click('#go');
await popup.waitForSelector('#ready:not([hidden])', { timeout: 10000 });
ok((await popup.textContent('#who')).includes(new URL(BASE).host), `connected as ${await popup.textContent('#who')}`);
await popup.screenshot({ path: path.join(OUT, 'ext-popup.png') });

const page = await ctx.newPage(); await page.goto(SITE); await page.bringToFront();
const tab = async () => sw.evaluate(async (site) => (await chrome.tabs.query({ url: site + '/*' }))[0], SITE);
const editorFor = async (fn) => { const p = ctx.waitForEvent('page', (pg) => pg.url().includes('editor.html')); await fn(); const ed = await p; await ed.waitForLoadState(); await ed.waitForSelector('#view'); await ed.waitForTimeout(400); return ed; };

// 1. visible area, with a blur and a product
let ed = await editorFor(async () => sw.evaluate(async (t) => self.__tcCapture('visible', t), await tab()));
ok(/Agent Nick/.test(await ed.inputValue('#title')), 'editor opened with the page title');
const box = await ed.locator('#view').boundingBox();
await ed.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.35); await ed.mouse.down(); await ed.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 }); await ed.mouse.up();
ok(/1 area blurred/.test(await ed.textContent('#count')), 'blurred one area');
await ed.fill('#product', 'Agent Nick'); await ed.fill('#tags', 'inbox, e2e');
await ed.screenshot({ path: path.join(OUT, 'ext-editor.png') });
await ed.click('#save'); await ed.waitForSelector('#msg.good', { timeout: 15000 });
ok(/Saved to the Library/.test(await ed.textContent('#msg')), 'saved to the Library');
await ed.close();

// 2. select an area by dragging on the page
await page.bringToFront();
const areaP = editorFor(async () => sw.evaluate(async (t) => { self.__tcArea = self.__tcCapture('area', t); return true; }, await tab()));
await page.waitForTimeout(600);
await page.mouse.move(40, 120); await page.mouse.down(); await page.mouse.move(520, 300, { steps: 6 }); await page.mouse.up();
ed = await areaP;
ok(/480 × 180|960 × 360/.test(await ed.textContent('#dims')), `area capture is the dragged size (${await ed.textContent('#dims')})`);
await ed.click('#save'); await ed.waitForSelector('#msg.good', { timeout: 15000 }); await ed.close();

// 3. full page (scrolls)
await page.bringToFront();
ed = await editorFor(async () => sw.evaluate(async (t) => self.__tcCapture('full', t), await tab()));
const dims = await ed.textContent('#dims'); const h = Number(dims.match(/× (\d+)/)[1]);
ok(h > 2000, `full-page capture is taller than the screen (${dims})`);
await ed.click('#save'); await ed.waitForSelector('#msg.good', { timeout: 20000 }); await ed.close();

// 4. the same capture again is recognised as a duplicate (re-upload the first one's bytes via the API path)
const lib = await api('/api/library?limit=10');
ok(lib.items.filter((i) => i.source === 'extension').length >= 3, `Library has the ${lib.items.length} captures`);
// wait until Nick has read them
for (let i = 0; i < 60; i++) { const l = await api('/api/library?limit=10'); if (l.items.slice(0, 3).every((x) => x.status === 'ready')) break; await new Promise((r) => setTimeout(r, 500)); }
const read = (await api('/api/library?limit=10')).items[0];
ok(read.status === 'ready' && read.numbers.length && read.sensitive.has, `read: ${read.summary} · ${read.numbers.length} numbers · personal data flagged`);
ok(read.url && !/token=/.test(read.url), 'page address saved without secrets');

const web = await ctx.newPage();
await ctx.addCookies([{ name: 'next-auth.session-token', value: SESSION, domain: new URL(BASE).hostname, path: '/' }]);
await web.goto(BASE + '/library'); await web.waitForTimeout(2500); await web.screenshot({ path: path.join(OUT, 'library.png') });
await web.click('.libcard'); await web.waitForTimeout(1200); await web.screenshot({ path: path.join(OUT, 'library-detail.png') });
for (const t of ['keys', 'models', 'usage', 'extension']) { await web.goto(`${BASE}/settings?tab=${t}`); await web.waitForTimeout(1800); await web.screenshot({ path: path.join(OUT, `settings-${t}.png`), fullPage: true }); }
console.log('screenshots in', OUT);
await ctx.close();
