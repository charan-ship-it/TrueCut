import { describe, expect, it } from 'vitest';
import { dedupeSources } from '../src/director/agent';

describe('sources from one message', () => {
  it('reads a site once even when it is attached and pasted in the text', () => {
    const out = dedupeSources([
      { kind: 'url', label: 'www.aixccelerate.com', ref: 'www.aixccelerate.com' },
      { kind: 'url', label: 'https://www.aixccelerate.com', ref: 'https://www.aixccelerate.com/' },
      { kind: 'url', label: 'aixccelerate.com/pricing', ref: 'https://aixccelerate.com/pricing' },
      { kind: 'text', label: 'notes', ref: 'a' }, { kind: 'text', label: 'notes', ref: 'a' },
    ] as any);
    expect(out.map((x: any) => x.ref)).toEqual(['www.aixccelerate.com', 'https://aixccelerate.com/pricing', 'a', 'a']);
  });
});
