import { describe, expect, it } from 'vitest';
import { explainClaudeError } from '../src/system/claude';
import { explainElevenError } from '../src/system/eleven';
import { costOf } from '@truecut/shared/models';

describe('Claude errors people can act on', () => {
  const cases: [any, string, boolean][] = [
    [{ status: 401, message: 'invalid x-api-key' }, 'invalid_key', false],
    [{ status: 400, message: 'Your credit balance is too low to access the Anthropic API.' }, 'no_credit', false],
    [{ status: 404, message: 'model: claude-nope-1' }, 'model_unavailable', false],
    [{ status: 429, message: 'rate' }, 'rate_limited', true],
    [{ status: 529, message: 'Overloaded' }, 'overloaded', true],
    [{ status: 500, message: 'x' }, 'provider_error', true],
    [{ message: 'fetch failed' }, 'network', true],
    [{ status: 400, message: 'prompt is too long: 1200000 tokens' }, 'too_large', false],
  ];
  for (const [e, code, retry] of cases) it(code, () => { const x = explainClaudeError(e); expect(x.code).toBe(code); expect(x.retryable).toBe(retry); expect(x.message).not.toMatch(/undefined/); });
  it('ElevenLabs', () => {
    expect(explainElevenError(401, '').code).toBe('invalid_key');
    expect(explainElevenError(400, '{"detail":{"status":"quota_exceeded"}}').code).toBe('no_credit');
    expect(explainElevenError(429, '').retryable).toBe(true);
  });
});

describe('cost estimates', () => {
  it('prices Opus 5.5 at $4 / $20 per million', () => { expect(costOf('claude-opus-5-5', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(24); });
  it('counts cache reads and writes', () => { expect(costOf('claude-opus-5-5', { input: 0, output: 0, cacheWrite: 1_000_000, cacheRead: 1_000_000 })).toBeCloseTo(5.2); });
  it('uses the long-prompt tier for Haiku 5.5 above 100K', () => {
    expect(costOf('claude-haiku-5-5', { input: 50_000, output: 0 })).toBeCloseTo(0.005);
    expect(costOf('claude-haiku-5-5', { input: 200_000, output: 0 })).toBeCloseTo(0.1);
  });
  it('never prices an unknown model at zero', () => { expect(costOf('claude-future-9', { input: 1_000_000, output: 0 })).toBeGreaterThan(0); });
});
