import { describe, it, expect } from 'vitest';
import { normalizeForm, summarizeAnswers } from '../src/director/form';

describe('chat forms', () => {
  it('normalises a mixed form and drops what cannot be asked', () => {
    const f = normalizeForm({ title: 'Pick a look', fields: [
      { label: 'Look', type: 'choice', options: [{ value: 'a', label: 'Editorial', description: 'serif' }, 'Bold'], value: 'a' },
      { label: 'Only one option', type: 'choice', options: ['x'] },
      { label: 'Length', type: 'slider', min: 10, max: 60, value: 99, unit: 's' },
      { label: 'Accent', type: 'color', value: '#abc' },
      { label: 'Captions?', type: 'toggle', value: 1 },
    ] })!;
    expect(f.kind).toBe('form');
    expect(f.fields.map((x) => x.type)).toEqual(['choice', 'slider', 'color', 'toggle']);
    expect(f.fields[1].value).toBe(60);
    expect(f.fields[2].value).toBe('#aabbcc');
    expect(f.fields[0].options![1].value).toBe('Bold');
  });
  it('returns null with nothing askable and caps fields', () => {
    expect(normalizeForm({ title: 'x', fields: [] })).toBeNull();
    expect(normalizeForm(null)).toBeNull();
    expect(normalizeForm({ title: 't', fields: Array.from({ length: 9 }, (_, i) => ({ label: `q${i}`, type: 'text' })) })!.fields).toHaveLength(5);
  });
  it('writes answers as a readable message', () => {
    const f = normalizeForm({ title: 't', fields: [{ id: 'l', label: 'Look?', type: 'choice', options: [{ value: 'a', label: 'Editorial' }, { value: 'b', label: 'Bold' }] }, { id: 'n', label: 'Length', type: 'slider', min: 10, max: 60, unit: 's' }, { id: 'c', label: 'Captions', type: 'toggle' }] })!;
    expect(summarizeAnswers(f, { l: 'b', n: 30, c: true })).toBe('Look: Bold · Length: 30 s · Captions: yes');
  });
});
