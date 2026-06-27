import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PI_PRINT_DESCRIPTOR, PI_RPC_DESCRIPTOR } from '../../../../src/drivers/pi/pi-descriptor';
import { createPiDrivers } from '../../../../src/drivers/pi';
import { defaultModeOf, supportsMode, supportsSurface } from '../../../../src/registry/driver-descriptor';

test('pi descriptors present the recoder_code surface with a pi CLI', () => {
  for (const d of [PI_PRINT_DESCRIPTOR, PI_RPC_DESCRIPTOR]) {
    assert.equal(d.kind, 'recoder_code');
    assert.ok(supportsSurface(d, 'recoder_code'));
    assert.equal(d.cli?.binary, 'pi');
    assert.ok(d.modes.length > 0);
  }
});

test('print default mode is json; rpc default mode is rpc', () => {
  assert.equal(defaultModeOf(PI_PRINT_DESCRIPTOR), 'json');
  assert.ok(supportsMode(PI_PRINT_DESCRIPTOR, 'in_process'));
  assert.equal(defaultModeOf(PI_RPC_DESCRIPTOR), 'rpc');
});

test('createPiDrivers returns both variants with distinct ids', () => {
  const drivers = createPiDrivers();
  const ids = drivers.map((d) => d.descriptor.id).sort();
  assert.deepEqual(ids, ['pi-print', 'pi-rpc']);
});
