import { getConn, setConn, clearConn, normalizeServer, apiFetch, listCaptures, uploadCapture } from './lib.js';

const $ = (id) => document.getElementById(id);
const say = (t, kind = '') => { const m = $('msg'); m.hidden = !t; m.textContent = t || ''; m.className = `msg ${kind}`; };

async function show() {
  const conn = await getConn();
  $('connect').hidden = !!conn; $('ready').hidden = !conn; $('menu').hidden = !conn;
  if (!conn) { $('server').focus(); return; }
  $('who').textContent = `${conn.name || conn.email} · ${new URL(conn.server).host}`;
  $('lib').href = `${conn.server}/library`;
  const pending = await listCaptures();
  const box = $('pending'); box.hidden = !pending.length; box.innerHTML = '';
  if (pending.length) {
    const row = document.createElement('div'); row.className = 'row';
    const label = document.createElement('span'); label.className = 'grow xs muted'; label.textContent = `${pending.length} capture${pending.length > 1 ? 's' : ''} not saved yet`; row.append(label);
    const open = document.createElement('button'); open.className = 'btn xs'; open.textContent = 'Review';
    open.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${pending[0].id}`) });
    row.append(open);
    // only captures someone already reviewed (and blurred) in the editor are retried from here
    const reviewed = pending.filter((c) => c.reviewed);
    if (reviewed.length) {
      const retry = document.createElement('button'); retry.className = 'btn xs'; retry.textContent = `Retry ${reviewed.length}`;
      retry.onclick = async () => { let ok = 0; for (const c of reviewed) { try { await uploadCapture(c); ok++; } catch (e) { say(e.message, 'bad'); break; } } chrome.runtime.sendMessage({ type: 'badge' }); if (ok) say(`Saved ${ok} to the Library.`, 'good'); show(); };
      row.append(retry);
    }
    box.append(row);
  }
}

$('go').onclick = async () => {
  say('');
  let server;
  try { server = normalizeServer($('server').value); } catch (e) { return say(e.message, 'bad'); }
  const token = $('token').value.trim();
  if (!/^tc_[A-Za-z0-9_-]{20,}$/.test(token)) return say('Paste the token from TrueCut → Settings → Capture extension (it starts with tc_).', 'bad');
  // permission to talk to this one server, asked for once
  const granted = await chrome.permissions.request({ origins: [server + '/*'] }).catch(() => false);
  if (!granted) return say('TrueCut needs permission to send captures to that address.', 'bad');
  await setConn({ server, token });
  try {
    const me = await apiFetch('/api/ext/me');
    await setConn({ server, token, name: me.user.name, email: me.user.email, products: me.products || [] });
    say('Connected.', 'good'); show();
  } catch (e) { await clearConn(); say(e.status === 401 ? 'That token was not accepted. Create a new one in Settings.' : e.message, 'bad'); }
};

$('menu').onclick = async () => { await clearConn(); say('Disconnected.'); show(); };

for (const b of document.querySelectorAll('[data-mode]')) {
  b.onclick = async () => {
    say(b.dataset.mode === 'full' ? 'Scrolling the page…' : '');
    const p = chrome.runtime.sendMessage({ type: 'capture', mode: b.dataset.mode });
    if (b.dataset.mode === 'area') { window.close(); return; } // the page needs the mouse
    const r = await p;
    if (!r?.ok) say(r?.error || 'Capture failed.', 'bad'); else window.close();
  };
}

show();
