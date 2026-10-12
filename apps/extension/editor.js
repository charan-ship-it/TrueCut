import { getCapture, putCapture, deleteCapture, uploadCapture, getConn, MAX_BYTES } from './lib.js';

const $ = (id) => document.getElementById(id);
const say = (html, kind = '') => { const m = $('msg'); m.hidden = !html; m.innerHTML = html || ''; m.className = `msg ${kind}`; };
const id = new URLSearchParams(location.search).get('id');
let cap, img, blurs = [], drag = null;
const view = $('view'), ctx = view.getContext('2d');
const full = document.createElement('canvas');

function pixelate(c, r) {
  const g = c.getContext('2d'); const s = Math.max(6, Math.round(Math.min(r.w, r.h) / 6));
  const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(r.w / s)); t.height = Math.max(1, Math.round(r.h / s));
  const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, t.width, t.height);
  g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, t.width, t.height, r.x, r.y, r.w, r.h); g.imageSmoothingEnabled = true;
}
function render() {
  full.width = img.width; full.height = img.height;
  const f = full.getContext('2d'); f.drawImage(img, 0, 0);
  for (const r of blurs) pixelate(full, r);
  const maxW = Math.min(img.width, document.querySelector('main').clientWidth - 40);
  const k = maxW / img.width; view.width = Math.round(img.width * k); view.height = Math.round(img.height * k);
  ctx.drawImage(full, 0, 0, view.width, view.height);
  $('undo').disabled = !blurs.length; $('count').textContent = blurs.length ? `${blurs.length} area${blurs.length > 1 ? 's' : ''} blurred` : '';
}
const toImage = (e) => { const b = view.getBoundingClientRect(); const k = img.width / b.width; return { x: (e.clientX - b.left) * k, y: (e.clientY - b.top) * k }; };

view.addEventListener('mousedown', (e) => { const p = toImage(e); const el = document.createElement('div'); el.className = 'sel'; $('wrap').append(el); drag = { p, el, sx: e.offsetX, sy: e.offsetY }; });
window.addEventListener('mousemove', (e) => { if (!drag) return; const b = view.getBoundingClientRect(); const x = Math.min(Math.max(e.clientX - b.left, 0), b.width), y = Math.min(Math.max(e.clientY - b.top, 0), b.height); Object.assign(drag.el.style, { left: Math.min(drag.sx, x) + 'px', top: Math.min(drag.sy, y) + 'px', width: Math.abs(x - drag.sx) + 'px', height: Math.abs(y - drag.sy) + 'px' }); });
window.addEventListener('mouseup', (e) => {
  if (!drag) return; const a = drag.p, q = toImage(e); drag.el.remove(); drag = null;
  const r = { x: Math.max(0, Math.min(a.x, q.x)), y: Math.max(0, Math.min(a.y, q.y)) }; r.w = Math.min(img.width - r.x, Math.abs(q.x - a.x)); r.h = Math.min(img.height - r.y, Math.abs(q.y - a.y));
  if (r.w > 4 && r.h > 4) { blurs.push(r); render(); }
});
$('undo').onclick = () => { blurs.pop(); render(); };
window.addEventListener('resize', () => img && render());

async function flattened() {
  let blob = await new Promise((res) => full.toBlob(res, 'image/png'));
  if (blob.size > MAX_BYTES) blob = await new Promise((res) => full.toBlob(res, 'image/jpeg', 0.88));
  return blob;
}
const fields = () => ({ title: $('title').value.trim() || cap.title, product: $('product').value.trim(), tags: $('tags').value.split(',').map((t) => t.trim()).filter(Boolean), includeUrl: $('incurl').checked });

$('save').onclick = async () => {
  $('save').disabled = true; say('Saving…');
  try {
    const blob = blurs.length ? await flattened() : cap.blob;
    cap = { ...cap, ...fields(), blob, blurred: blurs.length };
    await putCapture(cap); // kept until the upload succeeds
    const item = await uploadCapture(cap);
    const conn = await getConn();
    say(`${item.duplicate ? 'Already in the Library' : 'Saved to the Library'}. <a href="${conn.server}/library" target="_blank">Open it</a>. Nick is reading it now.`, 'good');
    chrome.runtime.sendMessage({ type: 'badge' });
    $('discard').textContent = 'Close';
  } catch (e) {
    const hint = e.code === 'unauthorized' || e.code === 'not_connected' ? ' Reconnect from the TrueCut button in the toolbar, then press Save again.' : e.code === 'network' ? '' : '';
    say(`${e.message}${hint}`, 'bad'); $('save').disabled = false;
  }
};
$('discard').onclick = async () => { if ($('discard').textContent !== 'Close' && !confirm('Discard this capture?')) return; await deleteCapture(id).catch(() => {}); chrome.runtime.sendMessage({ type: 'badge' }); window.close(); };

(async () => {
  cap = await getCapture(id);
  if (!cap) { say('This capture is no longer here (already saved or discarded).', 'bad'); $('save').disabled = true; return; }
  img = await createImageBitmap(cap.blob);
  $('title').value = cap.title || ''; $('product').value = cap.product || ''; $('tags').value = (cap.tags || []).join(', '); $('incurl').checked = cap.includeUrl !== false;
  try { $('host').textContent = new URL(cap.url).host; } catch { $('incurl').checked = false; $('incurl').disabled = true; }
  $('dims').textContent = `${img.width} × ${img.height}px · ${(cap.blob.size / 1024 / 1024).toFixed(1)} MB`;
  const conn = await getConn();
  for (const p of conn?.products || []) { const o = document.createElement('option'); o.value = p; $('products').append(o); }
  if (!conn) say('Not connected yet: click the TrueCut button in the toolbar and connect, then press Save.', 'bad');
  render();
})();
