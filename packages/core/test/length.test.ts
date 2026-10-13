import { describe, expect, it } from 'vitest';
import { Project } from '@truecut/shared/types';
import { projectLayout } from '@truecut/shared/compose';
import { plannedDuration } from '../src/ads/ai';

const line = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const project = (words: number[]) => Project.parse({ id: 'p', name: 'p', createdAt: 'x', updatedAt: 'x', scenes: words.map((w, i) => ({ id: 's' + i, type: i === words.length - 1 ? 'end' : 'headline', vo: w ? { text: line(w) } : undefined })) });

describe('planning the length before the voice exists', () => {
  it('plans with a real narrator pace, slower than the preview estimate', () => {
    const p = project([12, 14, 12, 14, 12, 8]);
    expect(plannedDuration(p)).toBeGreaterThan(projectLayout(p).duration);
  });
  it('uses the recorded duration once a line is voiced', () => {
    const p = project([12, 0]);
    p.scenes[0].vo!.duration = 10;
    expect(plannedDuration(p)).toBeCloseTo(projectLayout(p).duration, 5);
  });
});
