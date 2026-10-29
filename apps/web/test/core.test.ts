import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orgFromClaims, workspaceRole, requireCoreAccess, clearCoreCache, CoreError } from '../lib/core';

const keep = { ...process.env };
beforeEach(() => { clearCoreCache(); process.env.AIX_CORE_API_URL = 'https://core.test/'; });
afterEach(() => { process.env = { ...keep }; });

const reply = (status: number, body?: any) => vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;
const code = async (p: Promise<any>) => p.then(() => 'ok', (e) => (e instanceof CoreError ? `${e.status}:${e.code}` : String(e)));

describe('the organisation in a Clerk session', () => {
  it('reads the compact and the full claim shapes', () => {
    expect(orgFromClaims({ o: { id: 'org_1', rol: 'admin' } })).toEqual({ orgId: 'org_1', role: 'admin' });
    expect(orgFromClaims({ org_id: 'org_2', org_role: 'org:owner' })).toEqual({ orgId: 'org_2', role: 'owner' });
  });
  it('has no role for an unknown one, and nothing without claims', () => {
    expect(orgFromClaims({ org_id: 'org_3', org_role: 'org:janitor' })).toEqual({ orgId: 'org_3', role: null });
    expect(orgFromClaims(null)).toEqual({ orgId: null, role: null });
  });
  it('makes Core owners and admins workspace owners', () => {
    expect(workspaceRole('owner')).toBe('owner'); expect(workspaceRole('admin')).toBe('owner'); expect(workspaceRole('platform_support')).toBe('owner');
    expect(workspaceRole('member')).toBe('member');
  });
});

describe('Core access gate', () => {
  it('lets in whoever Core says has access, asking Core with their token', async () => {
    const f = reply(200, { has_access: true, reason: 'owner_admin' });
    expect(await code(requireCoreAccess('u1', 'jwt-1', f))).toBe('ok');
    expect(f).toHaveBeenCalledWith('https://core.test/api/v1/agents/truecut/access', expect.objectContaining({ headers: { authorization: 'Bearer jwt-1' } }));
  });
  it('turns away someone Core says has no access (403)', async () => {
    expect(await code(requireCoreAccess('u2', 't', reply(200, { has_access: false, reason: 'agent_not_enabled_for_org' })))).toBe('403:no_agent_access');
  });
  it('fails closed when Core is down, errors or has no TrueCut entry (503)', async () => {
    expect(await code(requireCoreAccess('u3', 't', vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as any))).toBe('503:core_unavailable');
    expect(await code(requireCoreAccess('u3', 't', reply(502)))).toBe('503:core_unavailable');
    expect(await code(requireCoreAccess('u3', 't', reply(404)))).toBe('503:not_in_catalog');
  });
  it('passes a rejected token on as 401', async () => {
    expect(await code(requireCoreAccess('u4', 't', reply(401)))).toBe('401:core_rejected_token');
  });
  it('is not configured without AIX_CORE_API_URL', async () => {
    delete process.env.AIX_CORE_API_URL;
    expect(await code(requireCoreAccess('u5', 't', reply(200, { has_access: true })))).toBe('500:core_unconfigured');
  });
  it('remembers a definite answer, but never an error', async () => {
    const f = reply(200, { has_access: true });
    await requireCoreAccess('u6', 't', f); await requireCoreAccess('u6', 't', f);
    expect(f).toHaveBeenCalledTimes(1);
    const bad = reply(503);
    await code(requireCoreAccess('u7', 't', bad)); await code(requireCoreAccess('u7', 't', bad));
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
