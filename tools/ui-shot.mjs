// node tools/ui-shot.mjs <url> <out.png> [w] [h] [waitMs] [scrollToBottom]
import { chromium } from 'playwright';
const [, , url, out, w = '1440', h = '900', wait = '3000'] = process.argv;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await pg.goto(url); await pg.waitForTimeout(+wait);
await pg.screenshot({ path: out }); await b.close();
