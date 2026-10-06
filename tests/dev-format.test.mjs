import assert from 'node:assert/strict';
import test from 'node:test';
import { dollarsPerMillionTokens, formatSpend } from '../lib/dev-format.ts';

test('a price per token becomes dollars per million tokens using the Brain\'s scale', () => {
  assert.equal(dollarsPerMillionTokens(1500, 1e9), '$1.5');
  assert.equal(dollarsPerMillionTokens(250, 1e9), '$0.25');
  assert.equal(dollarsPerMillionTokens(1500, 1e6), '$1,500');
});

test('a spend cap in nanodollars becomes dollars with every digit', () => {
  assert.equal(formatSpend(50_000_000, 1e9), '$0.05');
  assert.equal(formatSpend(1, 1e9), '$0.000000001');
  assert.equal(formatSpend(2_500_000_000, 1e9), '$2.5');
});

test('without a usable scale nothing is invented', () => {
  for (const scale of [undefined, null, 0, -1, Number.NaN, Infinity]) {
    assert.equal(dollarsPerMillionTokens(1500, scale), null);
    assert.equal(formatSpend(1500, scale), null);
  }
});
