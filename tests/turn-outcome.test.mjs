import assert from 'node:assert/strict';
import test from 'node:test';
import { currentOutcome, turnOutcome } from '../components/ask/types.ts';

// A Brain that is not ready answers 503 with this reason. Nothing broke.
const notReady = {
  error: "RockyGPT can't answer questions yet.",
  reason: 'not_ready',
  upstreamStatus: 503,
  upstreamResponse: { reason: 'not_ready' },
};

test('a not-ready turn is not built yet, not failed, and the Brain\'s own status decides the rest', () => {
  assert.equal(turnOutcome(503, notReady), 'not_built');
  assert.equal(turnOutcome(503, { reason: 'not_ready' }), 'not_built');
  assert.equal(turnOutcome(503, { reason: 'brain_error' }), 'failed');
  assert.equal(turnOutcome(200, { status: 'unavailable' }), 'declined');
  assert.equal(turnOutcome(200, { status: 'partial' }), 'ok');
});

test('a not-ready turn settled before the rule changed now reads not built', () => {
  const old = { localId: 'a', status: 'failed', httpStatus: 503, raw: notReady };
  assert.equal(currentOutcome(old).status, 'not_built');
  const broken = {
    localId: 'b',
    status: 'failed',
    httpStatus: 500,
    raw: { reason: 'brain_error' },
  };
  assert.equal(currentOutcome(broken), broken);
  const offline = { localId: 'c', status: 'failed', raw: { reason: 'client_network_error' } };
  assert.equal(currentOutcome(offline), offline);
});
