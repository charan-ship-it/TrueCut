import { describe, expect, it } from 'vitest';
import { dedupeSources, recentChat } from '../src/director/agent';
import { Project } from '@truecut/shared/types';

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

describe('what Nick remembers of the conversation', () => {
  const msg = (role: string, text: string, cards: any[] = []) => ({ id: Math.random().toString(36), role, text, cards, replies: [], attachments: [], at: 'x' });
  it('includes earlier turns and the angles offered, not the message being answered', () => {
    const p = Project.parse({ id: 'p', name: 'p', createdAt: 'x', updatedAt: 'x', angles: [{ id: 'a1', title: 'Execution, Not Ideas', hook: 'h', why: '', preset: 'signal', structure: '' }, { id: 'a2', title: 'From Chatbot to Worker', hook: 'h', why: '', preset: 'magazine', structure: '' }],
      chat: [msg('user', 'Make a 30s ad, keep it calm'), msg('nick', 'Three ways to tell it', [{ kind: 'angles' }]), msg('user', 'use the second one like I said')] });
    const c = recentChat(p);
    expect(c).toContain('User: Make a 30s ad, keep it calm');
    expect(c).toContain('2. From Chatbot to Worker');
    expect(c).not.toContain('use the second one');
  });
  it('is empty for a first message', () => {
    const p = Project.parse({ id: 'p', name: 'p', createdAt: 'x', updatedAt: 'x', chat: [msg('user', 'hi')] });
    expect(recentChat(p)).toBe('');
  });
});
