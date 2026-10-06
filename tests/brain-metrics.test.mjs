import assert from 'node:assert/strict';
import test from 'node:test';
import { brainMetrics, brainTrace } from '../lib/brain-metrics.ts';

test("the Brain's trace is read from a good turn, a failed turn, and absent when none was sent", () => {
  const lookup = { tool: 'office_facts', status: 'ok' };
  assert.deepEqual(brainTrace({ answer: 'x', trace: [lookup] }), [lookup]);
  assert.deepEqual(brainTrace({ answer: 'x', trace: [] }), []);
  assert.deepEqual(brainTrace({ reason: 'x', upstreamResponse: { trace: [lookup] } }), [lookup]);
  assert.equal(brainTrace({ reason: 'x', upstreamResponse: { metrics: {} } }), undefined);
  assert.equal(brainTrace({ answer: 'x' }), undefined);
  assert.equal(brainTrace(undefined), undefined);
});

test('metrics are read from a good turn and from a failed turn, and absent when none were sent', () => {
  const metrics = { decidedBy: 'model', modelCalls: 2 };
  assert.deepEqual(brainMetrics({ answer: 'x', metrics }), metrics);
  assert.deepEqual(brainMetrics({ reason: 'x', upstreamResponse: { metrics } }), metrics);
  assert.equal(brainMetrics({ answer: 'x' }), undefined);
  assert.equal(brainMetrics(undefined), undefined);
});
