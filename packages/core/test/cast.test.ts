import { describe, it, expect } from 'vitest';
import { heuristicCast } from '../src/ads/cast';
import { Project } from '@truecut/shared/types';

const V = [
  { id: 'brian', name: 'Brian - Deep, Resonant and Comforting', labels: { gender: 'male', age: 'middle_aged', accent: 'american', descriptive: 'classy', use_case: 'social_media' } },
  { id: 'george', name: 'George - Warm, Captivating Storyteller', labels: { gender: 'male', age: 'middle_aged', accent: 'british', descriptive: 'mature', use_case: 'narrative_story' } },
  { id: 'jessica', name: 'Jessica - Playful, Bright, Warm', labels: { gender: 'female', age: 'young', accent: 'american', descriptive: 'cute', use_case: 'conversational' } },
  { id: 'charlie', name: 'Charlie - Deep, Confident, Energetic', labels: { gender: 'male', age: 'young', accent: 'australian', descriptive: 'hyped', use_case: 'conversational' } },
] as any;
const proj = (preset: string, types: string[]) => Project.parse({ id: 'x', name: 'x', createdAt: '', updatedAt: '', style: { preset }, scenes: types.map((t, i) => ({ id: 's' + i, type: t, vo: { text: 'line ' + i } })) });

describe('voice casting (rule-based)', () => {
  it('fits the voice to the direction', () => {
    expect(heuristicCast(proj('editorial', ['headline', 'reveal', 'end']), V, [0, 1, 2]).members[0].voiceId).toBe('george');
    expect(heuristicCast(proj('pop', ['headline', 'reveal', 'end']), V, [0, 1, 2]).members[0].voiceId).toBe('jessica');
    expect(heuristicCast(proj('brutal', ['kinetic', 'reveal', 'end']), V, [0, 1, 2]).members[0].energy).toBe('energetic');
  });
  it('uses one voice unless a quoted line benefits from a second', () => {
    expect(heuristicCast(proj('signal', ['stat', 'headline', 'reveal', 'end']), V, [0, 1, 2, 3]).members).toHaveLength(1);
    const c = heuristicCast(proj('signal', ['stat', 'quote', 'reveal', 'card', 'end']), V, [0, 1, 2, 3, 4]);
    expect(c.members).toHaveLength(2);
    expect(c.members[1].voiceId).not.toBe(c.members[0].voiceId);
    expect(c.assign.find((a: any) => a.scene === 2).role).toBe('Quoted line');
    expect(c.assign.filter((a: any) => a.role === 'Narrator').length).toBe(4);
  });
});

import { voiceAll } from '../src/audio/voice';
import { createProject, updateProject, getProject } from '@truecut/db';
describe('founder talks keep the founder voice', () => {
  it('never synthesises voice-over for a talk', async () => {
    const id = 'test-talk-lock';
    createProject('lock', id);
    updateProject(id, (p) => { p.kind = 'talk'; p.scenes = [{ id: 'a', type: 'headline', vo: { text: 'hello' }, props: {}, facts: [] }] as any; });
    const logs: string[] = [];
    await voiceAll(id, (m) => logs.push(m));
    expect(logs.join(' ')).toMatch(/original voice/);
    expect(getProject(id).scenes[0].vo?.file).toBeUndefined();
  });
});
