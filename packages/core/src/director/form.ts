/** Generative UI for the chat: Nick asks for a decision with real controls (option cards, sliders, colour swatches,
 *  toggles, text) instead of a free-text question. The model proposes a spec; this normalises it into a safe `form` card. */
export type FieldType = 'choice' | 'multi' | 'text' | 'slider' | 'color' | 'toggle';
export interface FormField { id: string; type: FieldType; label: string; hint?: string; options?: { value: string; label: string; description?: string; swatch?: string }[]; min?: number; max?: number; step?: number; unit?: string; value?: string | number | boolean | string[]; placeholder?: string }
export interface FormCard { kind: 'form'; title: string; description?: string; fields: FormField[]; submit: string }

const TYPES: FieldType[] = ['choice', 'multi', 'text', 'slider', 'color', 'toggle'];
const s = (v: any, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hex = (v: any) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : /^#[0-9a-f]{3}$/i.test(String(v)) ? '#' + String(v).slice(1).split('').map((c) => c + c).join('').toLowerCase() : undefined);

/** Returns a valid card or null when the spec has nothing askable. At most 5 fields; choices need 2+ options. */
export function normalizeForm(raw: any): FormCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const fields: FormField[] = [];
  for (const [i, f] of (Array.isArray(raw.fields) ? raw.fields : []).slice(0, 5).entries()) {
    const type = TYPES.includes(f?.type) ? (f.type as FieldType) : (Array.isArray(f?.options) ? 'choice' : 'text');
    const label = s(f?.label, 90); if (!label) continue;
    const id = s(f?.id, 30).replace(/[^\w-]/g, '_') || `f${i + 1}`;
    const out: FormField = { id: fields.some((x) => x.id === id) ? `${id}_${i}` : id, type, label };
    if (f?.hint) out.hint = s(f.hint, 140);
    if (type === 'choice' || type === 'multi') {
      const seen = new Set<string>();
      out.options = (Array.isArray(f.options) ? f.options : []).slice(0, 8).map((o: any) => typeof o === 'string' ? { value: s(o, 60), label: s(o, 60) } : { value: s(o?.value ?? o?.label, 60), label: s(o?.label ?? o?.value, 60), description: o?.description ? s(o.description, 120) : undefined, swatch: hex(o?.swatch) })
        .filter((o: any) => o.label && !seen.has(o.value) && seen.add(o.value));
      if (out.options!.length < 2) continue;
      const known = (v: any) => out.options!.some((o) => o.value === v);
      if (type === 'choice' && known(f.value)) out.value = f.value;
      if (type === 'multi') out.value = (Array.isArray(f.value) ? f.value : []).filter(known);
    } else if (type === 'slider') {
      const min = Number.isFinite(+f.min) ? +f.min : 0; const max = Number.isFinite(+f.max) && +f.max > min ? +f.max : min + 100;
      out.min = min; out.max = max; out.step = +f.step > 0 ? +f.step : Math.max(1, Math.round((max - min) / 50)); if (f.unit) out.unit = s(f.unit, 8);
      out.value = Math.min(max, Math.max(min, Number.isFinite(+f.value) ? +f.value : Math.round((min + max) / 2)));
    } else if (type === 'color') {
      out.value = hex(f.value) || '#4f6bff';
      const sw = (Array.isArray(f.options) ? f.options : []).map((o: any) => hex(typeof o === 'string' ? o : o?.value)).filter(Boolean).slice(0, 8) as string[];
      if (sw.length) out.options = sw.map((v) => ({ value: v, label: v, swatch: v }));
    } else if (type === 'toggle') out.value = !!f.value;
    else { out.value = s(f.value, 300); if (f.placeholder) out.placeholder = s(f.placeholder, 90); }
    fields.push(out);
  }
  if (!fields.length) return null;
  return { kind: 'form', title: s(raw.title, 100) || fields[0].label, description: raw.description ? s(raw.description, 200) : undefined, fields, submit: s(raw.submit, 24) || 'Continue' };
}

/** What the person's answers read like, sent back to Nick as their message. */
export function summarizeAnswers(c: FormCard, a: Record<string, any>) {
  const parts = c.fields.map((f) => {
    const v = a[f.id]; const lab = f.label.replace(/[?:]\s*$/, '');
    if (f.type === 'toggle') return `${lab}: ${v ? 'yes' : 'no'}`;
    if (f.type === 'multi') { const l = (v as string[] || []).map((x) => f.options?.find((o) => o.value === x)?.label || x); return `${lab}: ${l.length ? l.join(', ') : 'none'}`; }
    if (f.type === 'choice') return `${lab}: ${f.options?.find((o) => o.value === v)?.label || v || 'no preference'}`;
    if (f.type === 'slider') return `${lab}: ${v}${f.unit ? ' ' + f.unit : ''}`;
    return `${lab}: ${String(v ?? '').trim() || 'no preference'}`;
  });
  return parts.join(' · ');
}

export const FORM_SPEC = { type: 'object', description: 'A question with real controls. title, optional description, 1-5 fields, optional submit label.', properties: {
  title: { type: 'string' }, description: { type: 'string' }, submit: { type: 'string' },
  fields: { type: 'array', items: { type: 'object', required: ['label', 'type'], properties: {
    id: { type: 'string' }, label: { type: 'string' }, hint: { type: 'string' }, type: { type: 'string', enum: TYPES },
    options: { type: 'array', description: 'choice/multi: 2-8 {value,label,description?,swatch?}; color: optional preset hex swatches', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' }, swatch: { type: 'string' } } } },
    min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' }, unit: { type: 'string' }, value: { description: 'default' }, placeholder: { type: 'string' } } } } }, required: ['title', 'fields'] };

export const ASK_GUIDE = ` ASKING: when a choice is the person's to make (which look, which angle, how long, what colour, yes/no on something costly or irreversible, or a request too vague to act on), do not ask in prose. Use the "ask" action with a form: option cards (choice) when the options are a few named things, a slider for amounts, colour swatches for colour, a toggle for yes/no, text only when nothing else fits. Give every field a sensible default and a short description on each option. One form per turn, at most 4 fields, and never ask what the sources or the request already answer. When the request is clear, act without asking.`;
