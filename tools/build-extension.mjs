// Zips apps/extension into apps/web/public/downloads/truecut-capture.zip (served from Settings).
// No dependencies: writes a plain "stored" zip (the files are small; PNGs are already compressed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'apps/extension');
const outDir = path.join(root, 'apps/web/public/downloads');
const out = path.join(outDir, 'truecut-capture.zip');

const files = [];
(function walk(d, rel = '') { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(p, r); else files.push([r, fs.readFileSync(p)]); } })(src);

// zlib.crc32 needs Node 22.2+; keep a fallback for older Node
const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = zlib.crc32 || ((buf) => { let c = 0xffffffff; for (const b of buf) c = T[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; });
const local = []; const central = []; let offset = 0;
const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed timestamp: reproducible zips
for (const [name, data] of files.sort(([a], [b]) => a.localeCompare(b))) {
  const n = Buffer.from(name); const crc = crc32(data);
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
  local.push(h, n, data);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, n);
  offset += 30 + n.length + data.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, Buffer.concat([...local, cd, end]));
const v = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8')).version;
console.log(`TrueCut Capture ${v}: ${files.length} files → ${path.relative(root, out)}`);
