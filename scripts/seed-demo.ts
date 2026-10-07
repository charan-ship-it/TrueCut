// Seeds a finished example project. The AIX demo (real workspace data) lives in scripts/fixtures/,
// which is git-ignored, so it only exists on machines that have it.
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const demo = path.join(here, 'fixtures', 'seed-demo.ts');
if (!fs.existsSync(demo)) { console.log('No demo fixtures on this machine (they are private). Skipping: start a video from the home screen instead.'); process.exit(0); }
await import(demo);
