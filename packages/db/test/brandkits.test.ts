import { afterAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { saveBrandKit, findBrandKit, listBrandKits, brandKey } from '../src/brandkits';
import { DEFAULT_WORKSPACE_ID } from '../src/workspaces';
import { closeDb } from '../src/client';

describe('brand key', () => {
  it('normalises hosts and names', () => {
    expect(brandKey('https://www.Acme.com/pricing?x=1')).toBe('acme.com');
    expect(brandKey('  Acme  Labs ')).toBe('acme labs');
  });
});

describe.skipIf(!dbReady)('brand kits', () => {
  afterAll(() => closeDb());
  it('saves once per company and finds it by site or name, updating in place', async () => {
    const key = `kit-${Date.now()}.test`;
    await saveBrandKit(DEFAULT_WORKSPACE_ID, [`https://www.${key}/`, 'Kit Co ' + key], 'Kit Co', { mood: 'warm' });
    expect((await findBrandKit(DEFAULT_WORKSPACE_ID, [key]))?.name).toBe('Kit Co');
    expect((await findBrandKit(DEFAULT_WORKSPACE_ID, ['kit co ' + key]))?.language).toEqual({ mood: 'warm' });
    await saveBrandKit(DEFAULT_WORKSPACE_ID, [key], 'Kit Co', { mood: 'sharp' });
    expect((await findBrandKit(DEFAULT_WORKSPACE_ID, [key]))?.language).toEqual({ mood: 'sharp' });
    expect((await listBrandKits(DEFAULT_WORKSPACE_ID)).filter((k) => k.key === key)).toHaveLength(1);
    expect(await findBrandKit('ws_other', [key])).toBeNull();
  });
});
