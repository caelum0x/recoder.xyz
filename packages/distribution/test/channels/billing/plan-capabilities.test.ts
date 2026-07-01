import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  seatsForPlan,
  canAddSeat,
} from '../../../src/channels/billing/plan-capabilities';

// Product decision (docs/PLAN-MODEL.md): Free/Pro are individual (single-seat);
// Team is a seat-billed pool; Enterprise is unlimited. Seats meter org
// membership, NOT parallel agents (local agents are unlimited on every tier).

test('seatsForPlan: free and pro are single-seat individual plans', () => {
  assert.equal(seatsForPlan('free'), 1);
  assert.equal(seatsForPlan('pro'), 1);
});

test('seatsForPlan: team grants a real pool, enterprise is unlimited', () => {
  assert.equal(seatsForPlan('team'), 25);
  assert.equal(seatsForPlan('enterprise'), Number.POSITIVE_INFINITY);
});

test('canAddSeat: free/pro allow only the owner seat', () => {
  assert.equal(canAddSeat(0, 'free'), true);
  assert.equal(canAddSeat(1, 'free'), false);
  assert.equal(canAddSeat(0, 'pro'), true);
  assert.equal(canAddSeat(1, 'pro'), false);
});

test('canAddSeat: team allows up to the pool and denies beyond', () => {
  assert.equal(canAddSeat(24, 'team'), true);
  assert.equal(canAddSeat(25, 'team'), false);
  assert.equal(canAddSeat(100, 'team'), false);
});

test('canAddSeat: enterprise always allows (unlimited pool)', () => {
  assert.equal(canAddSeat(9999, 'enterprise'), true);
});

test('canAddSeat: deny-safe — negative/garbage occupied clamps to 0', () => {
  assert.equal(canAddSeat(-5, 'free'), true);
  assert.equal(canAddSeat(Number.NaN, 'free'), true);
});
