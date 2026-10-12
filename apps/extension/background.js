// TrueCut Capture: takes the screenshot (visible area, a selected area, or the full page), keeps it
// in IndexedDB, and opens the editor where people blur personal data and save it to the Library.
import { putCapture, newId, listCaptures } from './lib.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RESTRICTED = /^(chrome|edge|about|chrome-extension|devtools|view-source):|^https:\/\/chrome(webstore)?\.google\.com\/(webstore|detail)/;
let lastShot = 0;

async function shoot(windowId) {
  // Chrome allows ~2 captures a second; stay under it
  const wait = 550 - (Date.now() - lastShot); if (wait > 0) await sleep(wait);
  lastShot = Date.now();
  const url = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  return (await fetch(url)).blob();
}

async function crop(blob, rect, viewportW) {
  const bmp = await createImageBitmap(blob);
  const k = bmp.width / viewportW; // device pixels per CSS pixel, including zoom
  const sx = Math.max(0, Math.round(rect.x * k)), sy = Math.max(0, Math.round(rect.y * k));
  const w = Math.min(bmp.width - sx, Math.round(rect.w * k)), h = Math.min(bmp.height - sy, Math.round(rect.h * k));
  const c = new OffscreenCanvas(w, h); c.getContext('2d').drawImage(bmp, sx, sy, w, h, 0, 0, w, h);
  return c.convertToBlob({ type: 'image/png' });
}

// runs in the page: let the person drag a rectangle; resolves to it (CSS px) or null on Esc
function selectArea() {
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.25)';
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px solid #F47920;background:rgba(244,121,32,.08);box-shadow:0 0 0 9999px rgba(0,0,0,.35);display:none;pointer-events:none';
    const tip = document.createElement('div');
    tip.textContent = 'Drag to select an area · Esc to cancel';
    tip.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#171615;color:#fff;font:13px system-ui;padding:6px 12px;border-radius:8px;pointer-events:none';
    o.append(box, tip); document.documentElement.append(o);
    let sx = 0, sy = 0, dragging = false;
    const done = (r) => { o.remove(); window.removeEventListener('keydown', key, true); requestAnimationFrame(() => requestAnimationFrame(() => resolve(r))); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    window.addEventListener('keydown', key, true);
    o.addEventListener('mousedown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; box.style.display = 'block'; tip.style.display = 'none'; });
    o.addEventListener('mousemove', (e) => { if (!dragging) return; const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY); Object.assign(box.style, { left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - sx) + 'px', height: Math.abs(e.clientY - sy) + 'px' }); });
    o.addEventListener('mouseup', (e) => {
      dragging = false;
      const r = { x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy), vw: window.innerWidth };
      if (r.w < 8 || r.h < 8) { box.style.display = 'none'; tip.style.display = 'block'; return; }
      done(r);
    });
  });
}

// runs in the page: measure, scroll, hide sticky headers after the first frame, restore
function pageOps(op, arg) {
  const w = window;
  if (op === 'measure') return { h: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0), vh: w.innerHeight, vw: w.innerWidth, y: w.scrollY };
  if (op === 'scroll') { w.scrollTo(0, arg); return w.scrollY; }
  if (op === 'hideFixed') {
    const hidden = [];
    for (const el of document.querySelectorAll('body *')) { const p = getComputedStyle(el).position; if (p === 'fixed' || p === 'sticky') { hidden.push(el); el.dataset.tcVis = el.style.visibility; el.style.visibility = 'hidden'; } }
    w.__tcHidden = hidden; return hidden.length;
  }
  if (op === 'restore') { for (const el of w.__tcHidden || []) { el.style.visibility = el.dataset.tcVis || ''; delete el.dataset.tcVis; } w.__tcHidden = []; w.scrollTo(0, arg); return true; }
}
const run = async (tabId, func, args = []) => (await chrome.scripting.executeScript({ target: { tabId }, func, args }))[0]?.result;

async function fullPage(tab) {
  const m = await run(tab.id, pageOps, ['measure']);
  const frames = Math.min(Math.ceil(m.h / m.vh), 20);
  const shots = []; let first = null;
  try {
    for (let i = 0; i < frames; i++) {
      const y = await run(tab.id, pageOps, ['scroll', i * m.vh]);
      await sleep(350);
      if (i === 1) await run(tab.id, pageOps, ['hideFixed']);
      const b = await shoot(tab.windowId); const bmp = await createImageBitmap(b);
      if (!first) first = bmp;
      shots.push({ bmp, y });
    }
  } finally { await run(tab.id, pageOps, ['restore', m.y]).catch(() => {}); }
  const k = first.width / m.vw;
  const total = Math.min(m.h, frames * m.vh);
  let W = first.width, H = Math.round(total * k);
  const scale = H > 16000 ? 16000 / H : 1; // canvas and model limits
  W = Math.round(W * scale); H = Math.round(H * scale);
  const c = new OffscreenCanvas(W, H); const ctx = c.getContext('2d');
  for (const s of shots) ctx.drawImage(s.bmp, 0, Math.round(s.y * k * scale), W, Math.round(s.bmp.height * scale));
  return c.convertToBlob({ type: 'image/png' });
}

async function capture(mode, tab) {
  if (!tab?.id) throw new Error('No tab to capture.');
  if (RESTRICTED.test(tab.url || '')) throw new Error("Chrome doesn't let extensions capture this page. Open the product page you want, then try again.");
  let blob;
  if (mode === 'area') {
    const r = await run(tab.id, selectArea);
    if (!r) return null; // cancelled
    blob = await crop(await shoot(tab.windowId), r, r.vw);
  } else if (mode === 'full') {
    blob = await fullPage(tab);
  } else {
    blob = await shoot(tab.windowId);
  }
  const { lastProduct = {} } = await chrome.storage.local.get('lastProduct');
  let host = ''; try { host = new URL(tab.url).hostname; } catch {}
  const id = newId();
  await putCapture({ id, blob, title: tab.title || host || 'Screenshot', url: tab.url || '', includeUrl: true, product: lastProduct[host] || '', tags: [], capturedAt: new Date().toISOString(), mode });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${id}`), index: tab.index + 1, openerTabId: tab.id });
  await refreshBadge();
  return id;
}

export async function refreshBadge() {
  const n = (await listCaptures()).length;
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#F47920' });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'capture') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => capture(msg.mode, tab)).then((id) => reply({ ok: true, id }), (e) => reply({ ok: false, error: e?.message || String(e) }));
    return true;
  }
  if (msg?.type === 'badge') { refreshBadge().then(() => reply({ ok: true })); return true; }
});

chrome.commands.onCommand.addListener((command, tab) => {
  const mode = command === 'capture-area' ? 'area' : 'visible';
  capture(mode, tab).catch((e) => chrome.action.setTitle({ title: `TrueCut: ${e?.message || e}` }));
});

// exposed for the automated end-to-end test (tools/test/extension-e2e.mjs)
self.__tcCapture = capture;

chrome.runtime.onInstalled.addListener(() => { refreshBadge(); });
chrome.runtime.onStartup.addListener(() => { refreshBadge(); });
