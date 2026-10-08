// "No fake data" guard. Facts are verified mechanically against the source text, and every
// number that appears in a storyboard must trace back to an approved fact (or the brief).
import type { Fact, Project, Scene } from './types';

export const norm = (s: string) => String(s ?? '').toLowerCase()
  .replace(/\*\*|__|`|^#+\s|\s#+\s|\|/gm, ' ').replace(/^[>\-*•]\s+/gm, ' ')
  .replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—−]/g, '-')
  .replace(/\s+/g, ' ').trim();

export function verifyFact(f: Fact, corpus: string): Fact['status'] {
  const c = norm(corpus);
  const q = norm(f.quote || '');
  if (q.length >= 8 && c.includes(q)) return 'verified';
  // tolerate ellipses inside quotes: every fragment must be present, in order
  if (q.includes('...') || q.includes('…')) {
    const parts = q.split(/\.\.\.|…/).map((x) => x.trim()).filter((x) => x.length > 6);
    let at = 0; let ok = parts.length > 0;
    for (const p of parts) { const i = c.indexOf(p, at); if (i < 0) { ok = false; break; } at = i + p.length; }
    if (ok) return 'verified';
  }
  return 'needs-check';
}

const NUM = /(?<![\w.])\$?\d[\d,]*(?:\.\d+)?[%kKmMbBx]?(?![\w])/g;
export function numbersIn(s: string): string[] {
  return (String(s ?? '').match(NUM) || []).map((n) => n.replace(/[$,]/g, '').toLowerCase());
}
function walkStrings(v: any, out: string[] = []): string[] {
  if (v == null) return out;
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'number') out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => walkStrings(x, out));
  else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (['image', 'images', 'shape', 'tone', 'fit', 'focus', 'aspect'].includes(k)) continue; walkStrings(x, out); }
  return out;
}

/** Numbers the video may show: from approved facts and from what the customer typed. */
export function allowedNumbers(p: Project): Set<string> {
  const s = new Set<string>();
  const add = (t: any) => numbersIn(String(t ?? '')).forEach((n) => { s.add(n); s.add(n.replace(/[%kmbx]$/, '')); });
  for (const f of p.facts) if (f.approved && f.status !== 'rejected') { add(f.statement); add(f.value); add(f.quote); }
  const i = p.intake; [i.mustSay, i.oneLiner, i.cta, i.dataLabel, i.byline].forEach(add);
  p.questions.forEach((q) => add(q.answer));
  return s;
}

export type Issue = { sceneId: string; level: 'error' | 'warn'; message: string };

export function checkScenes(p: Project): Issue[] {
  const allowed = allowedNumbers(p);
  const issues: Issue[] = [];
  const visualIds = new Set(p.visuals.map((v) => v.id));
  const factIds = new Set(p.facts.map((f) => f.id));
  p.scenes.forEach((sc: Scene, i) => {
    const texts = [sc.vo?.text || '', sc.caption || '', sc.status || '', ...walkStrings(sc.props)];
    const bad = new Set<string>();
    for (const t of texts) for (const n of numbersIn(t)) {
      const bare = n.replace(/[%kmbx]$/, '');
      if (allowed.has(n) || allowed.has(bare)) continue;
      if (/^0?\d$/.test(bare) && Number(bare) <= 12 && sc.type === 'selector') continue; // list numbering
      bad.add(n);
    }
    if (bad.size) issues.push({ sceneId: sc.id, level: 'error', message: `Scene ${i + 1}: number(s) ${[...bad].join(', ')} not found in any approved fact. Approve a fact that contains it, or remove it.` });
    for (const img of [sc.props?.image, ...(sc.props?.images || [])].filter(Boolean)) if (!visualIds.has(img)) issues.push({ sceneId: sc.id, level: 'error', message: `Scene ${i + 1}: image "${img}" is not in this project's visuals.` });
    for (const f of sc.facts || []) if (!factIds.has(f)) issues.push({ sceneId: sc.id, level: 'warn', message: `Scene ${i + 1}: references unknown fact ${f}.` });
    const unchecked = (sc.facts || []).map((id) => p.facts.find((f) => f.id === id)).filter((f) => f && f.status !== 'verified');
    if (unchecked.length) issues.push({ sceneId: sc.id, level: 'warn', message: `Scene ${i + 1}: uses ${unchecked.length} fact(s) whose quote could not be matched in the sources — double-check before publishing.` });
    if ((sc.vo?.text || '').split(/\s+/).length > 22) issues.push({ sceneId: sc.id, level: 'warn', message: `Scene ${i + 1}: voice line is long (${sc.vo!.text.split(/\s+/).length} words). Keep it under ~14 for pace.` });
  });
  if (p.scenes.length && p.scenes[p.scenes.length - 1].type !== 'end') issues.push({ sceneId: p.scenes[p.scenes.length - 1].id, level: 'warn', message: 'The last scene is not an end card.' });
  if (p.scenes.filter((s) => s.type === 'reveal').length > 1) issues.push({ sceneId: '', level: 'warn', message: 'More than one reveal scene — the music drop only happens once.' });
  return issues;
}
