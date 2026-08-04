/**
 * Launch-time sibling-awareness flag persistence (recoder-i499) — a taskGroup
 * launch defaults `metadata.siblingAwareness` to TRUE (the whole point of 2+
 * parallel agents), an explicit `false` opts out, and an ungrouped launch stays
 * byte-identical (no flag invented).
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';

describe('conductor launch sibling-awareness flag', () => {
  it('defaults the flag TRUE on a taskGroup launch (persisted on metadata)', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const result = await module.createWorkspace(
      makeCreateInput({ metadata: { taskGroup: 'grp_1' } }),
      makePrincipal(),
    );
    expect(result.ok).toBe(true);
    expect(result.value?.metadata).toMatchObject({
      taskGroup: 'grp_1',
      siblingAwareness: true,
    });
  });

  it('an explicit siblingAwareness:false opts the grouped launch out', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const result = await module.createWorkspace(
      makeCreateInput({ metadata: { taskGroup: 'grp_1' }, siblingAwareness: false }),
      makePrincipal(),
    );
    expect(result.ok).toBe(true);
    expect(result.value?.metadata).toMatchObject({
      taskGroup: 'grp_1',
      siblingAwareness: false,
    });
  });

  it('an ungrouped launch invents no flag (byte-identical metadata)', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(result.ok).toBe(true);
    expect(result.value?.metadata ?? {}).not.toHaveProperty('siblingAwareness');
  });

  it('an explicit siblingAwareness:true persists even without a taskGroup', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const result = await module.createWorkspace(
      makeCreateInput({ siblingAwareness: true }),
      makePrincipal(),
    );
    expect(result.ok).toBe(true);
    expect(result.value?.metadata).toMatchObject({ siblingAwareness: true });
  });
});
