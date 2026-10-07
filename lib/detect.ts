// Pure helpers shared by the server agent and the browser composer.
export type Attachment = { kind: 'url' | 'path' | 'text' | 'upload'; label: string; ref: string };
export function detectSources(text: string): Attachment[] {
  const out: Attachment[] = [];
  const urls = text.match(/\bhttps?:\/\/[^\s<>"')]+|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ai|io|dev|app|co|org|net|md|so|xyz|tech|us|uk|in)(?:\/[^\s<>"')]*)?/gi) || [];
  for (const u of urls) if (!out.some((o) => o.ref === u)) out.push({ kind: 'url', label: u.replace(/^https?:\/\//, '').replace(/\/$/, ''), ref: u });
  const paths = text.match(/(?:^|\s)((?:~|\.{1,2})?\/[^\s,;]+)/g) || [];
  for (const raw of paths) { const pth = raw.trim(); if (/^\/\//.test(pth) || urls.some((u) => u.includes(pth))) continue; out.push({ kind: 'path', label: pth.split('/').filter(Boolean).pop() || pth, ref: pth }); }
  if (/agent nick repo/i.test(text) && !out.length) out.push({ kind: 'path', label: 'agent-nick', ref: '../agent-nick' });
  return out;
}

