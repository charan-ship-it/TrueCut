'use client';
// Playback diagnostics. Every event goes to the console and a ring buffer (window.__tcLog, readable from devtools),
// and the notable ones (a pause nobody asked for, a stall, a reload of the player, an error) are also sent to the server
// so they show up in Railway's web logs as `[client] <event> {...}`.
const NOTABLE = new Set(['pause.unrequested', 'comp.reload', 'stall', 'waiting', 'media.error', 'audio.error', 'frame.gap', 'player.error', 'hidden', 'ended.early']);
let sent = 0; let project = '';
export function plogProject(id: string) { project = id; }
export function plog(ev: string, data: Record<string, unknown> = {}) {
  try {
    const row = { t: Math.round(performance.now()), ev, ...data };
    const w = window as any; (w.__tcLog ||= []).push(row); if (w.__tcLog.length > 300) w.__tcLog.shift();
    console.debug('[tc:player]', ev, data);
    if (NOTABLE.has(ev) && sent < 40) {
      sent++;
      const body = JSON.stringify({ ev, project, data: { ...data, ua: navigator.userAgent.slice(0, 80), visible: document.visibilityState } });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/client-log', new Blob([body], { type: 'application/json' }));
    }
  } catch {}
}
