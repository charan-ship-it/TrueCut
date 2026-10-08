// Copies the renderer (packages/engine/src) into apps/web/public/engine so the browser can load the
// live preview player. The copy is generated — edit packages/engine, never apps/web/public/engine.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'packages/engine/src');
const dst = path.join(root, 'apps/web/public/engine');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (f) => !f.endsWith('.d.ts') });
console.log('engine → apps/web/public/engine');
