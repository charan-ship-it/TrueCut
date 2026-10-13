import { describe, expect, it } from 'vitest';
import { captionStyleFrom, directionFrom } from '../src/director/agent';

describe('typed intents', () => {
  it('matches caption styles', () => {
    expect(captionStyleFrom('/captions outline')).toBe('outline');
    expect(captionStyleFrom('captions: highlight')).toBe('highlight');
    expect(captionStyleFrom('change caption style to typewriter')).toBe('typewriter');
    expect(captionStyleFrom('use karaoke captions')).toBe('karaoke');
    expect(captionStyleFrom('make the captions bigger')).toBeNull();
    expect(captionStyleFrom('captions off')).toBeNull();
  });
  it('matches every direction by key or label', () => {
    expect(directionFrom('/direction riso')).toBe('riso');
    expect(directionFrom('switch to neon night')).toBe('neon');
    expect(directionFrom('try the bento look')).toBe('bento');
    expect(directionFrom('try chrome')).toBe('chrome');
    expect(directionFrom('change scene 2 to show the chrome extension install')).toBeNull();
    expect(directionFrom('/direction nope')).toBeNull();
  });
});
