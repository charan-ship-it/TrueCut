import { describe, it, expect } from 'vitest';
import { verifyFact, numbersIn, checkScenes } from '../lib/facts';
import { Project } from '../lib/types';

const base = () => Project.parse({ id: 'testproj', name: 't', createdAt: '', updatedAt: '' });

describe('fact verification', () => {
  const corpus = 'Acme cut onboarding time by 43% across 1,200 customers.\nIt “just works”, says the team.';
  it('verifies verbatim quotes (case/space/quote-style insensitive)', () => {
    expect(verifyFact({ quote: 'cut onboarding  time by 43%' } as any, corpus)).toBe('verified');
    expect(verifyFact({ quote: 'It "just works"' } as any, corpus)).toBe('verified');
  });
  it('flags quotes that are not in the sources', () => {
    expect(verifyFact({ quote: 'cut onboarding time by 50%' } as any, corpus)).toBe('needs-check');
  });
  it('accepts ellipsis-joined fragments in order', () => {
    expect(verifyFact({ quote: 'Acme cut onboarding … 1,200 customers' } as any, corpus)).toBe('verified');
  });
  it('extracts numbers incl. %, $, commas, k/m', () => {
    expect(numbersIn('Saved $12M for 1,200 teams, 43% faster, 3x ROI, 10k users')).toEqual(['12m', '1200', '43%', '3x', '10k']);
    expect(numbersIn('see v2 and 11am')).toEqual([]);
  });
});

describe('no-fake-data guard', () => {
  it('blocks numbers that no approved fact contains', () => {
    const p = base();
    p.facts = [{ id: 'f1', statement: '457 ideas found', value: 457, kind: 'metric', quote: '457 fresh ideas', status: 'verified', approved: true }];
    p.scenes = [
      { id: 'a', type: 'stat', props: { value: 457, label: 'ideas' }, facts: ['f1'], vo: { text: '457 ideas.' } },
      { id: 'b', type: 'stat', props: { value: 999, label: 'leads' }, facts: [], vo: { text: 'Nine hundred leads.' } },
      { id: 'c', type: 'end', props: { wordmark: 'X' }, facts: [] },
    ] as any;
    const issues = checkScenes(p);
    expect(issues.filter((i) => i.level === 'error').map((i) => i.sceneId)).toEqual(['b']);
  });
  it('unapproving a fact makes its numbers illegal again', () => {
    const p = base();
    p.facts = [{ id: 'f1', statement: '457 ideas', value: 457, kind: 'metric', quote: '457', status: 'verified', approved: false }];
    p.scenes = [{ id: 'a', type: 'stat', props: { value: 457 }, facts: [] }] as any;
    expect(checkScenes(p).some((i) => i.level === 'error')).toBe(true);
  });
  it('flags images that are not project visuals', () => {
    const p = base();
    p.scenes = [{ id: 'a', type: 'screen', props: { image: 'nope' }, facts: [] }] as any;
    expect(checkScenes(p).some((i) => i.message.includes('not in this project'))).toBe(true);
  });
});

describe('markdown-tolerant verification', () => {
  it('matches quotes across markdown emphasis and table pipes', () => {
    const corpus = '| **Combined** | **6/14 — 43%** |\n> To a marketer: Ghostwrite for every exec';
    expect(verifyFact({ quote: 'Combined 6/14 — 43%' } as any, corpus)).toBe('verified');
    expect(verifyFact({ quote: 'To a marketer: Ghostwrite for every exec' } as any, corpus)).toBe('verified');
  });
});
