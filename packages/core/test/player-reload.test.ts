import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT } from '@truecut/config';
import { launchBrowser } from '../src/render/browser';

// Regression: the preview used to re-send its composition on every project refresh, and every re-send reset the player and stopped playback.
describe('player keeps playing when the same cut is sent again', () => {
  it('resumes from the same moment and reports it', async () => {
    const root = path.join(ROOT, 'packages', 'engine', 'src');
    const comp = { title: 't', brand: { name: 'A', product: 'A', accent: '#F47920' }, assets: {}, captions: true, style: { preset: 'signal' },
      scenes: [{ id: 's1', type: 'headline', props: { text: 'Hello' }, vo: { text: 'hello there', duration: 6, words: [] } }, { id: 's2', type: 'headline', props: { text: 'World' }, vo: { text: 'world', duration: 6, words: [] } }] };
    const srv = http.createServer((req, res) => {
      const u = (req.url || '/').split('?')[0];
      if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<iframe id=f src="/player.html?format=4x5" style="width:540px;height:675px"></iframe><script>window.msgs=[];addEventListener('message',e=>{window.msgs.push(e.data)})</script>`); }
      const f = path.join(root, u); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${(srv.address() as any).port}/`);
      const send = (m: any) => page.evaluate((m) => (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(m, '*'), m);
      const types = () => page.evaluate(() => (window as any).msgs.map((m: any) => m.type));
      await page.waitForFunction(() => (window as any).msgs.some((m: any) => m.type === 'nm:want'), null, { timeout: 15000 });
      await send({ type: 'nm:comp', comp });
      await page.waitForFunction(() => (window as any).msgs.some((m: any) => m.type === 'nm:ready'), null, { timeout: 15000 });
      await send({ type: 'nm:play' });
      await page.waitForTimeout(900);
      await page.evaluate(() => { (window as any).msgs.length = 0; });
      await send({ type: 'nm:comp', comp: JSON.parse(JSON.stringify(comp)) }); // same cut, new object, like a project refresh
      await page.waitForFunction(() => (window as any).msgs.some((m: any) => m.type === 'nm:resumed'), null, { timeout: 15000 });
      const t = await types();
      expect(t).not.toContain('nm:paused');
      expect(t).toContain('nm:resumed');
      await page.evaluate(() => { (window as any).msgs.length = 0; });
      await page.waitForTimeout(700);
      const times = await page.evaluate(() => (window as any).msgs.filter((m: any) => m.type === 'nm:time').map((m: any) => m.t));
      expect(times.length).toBeGreaterThan(3);
      expect(times[times.length - 1]).toBeGreaterThan(times[0]); // time is still moving
      expect(times[0]).toBeGreaterThan(0.5); // and did not restart from zero
    } finally { await browser.close(); srv.close(); }
  }, 90000);
});
