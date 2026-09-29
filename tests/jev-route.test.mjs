import assert from 'node:assert/strict';
import test from 'node:test';
import { readJevRoute } from '../lib/jev-route.ts';
import { turnOutcome } from '../components/ask/types.ts';

// A development Brain's not-ready turn, as the page keeps it (09-29).
const notReady = {
  error: "RockyGPT's new Brain can't answer questions yet.",
  reason: 'not_ready',
  upstreamStatus: 503,
  upstreamResponse: {
    reason: 'not_ready',
    metrics: {
      responseMode: 'not_ready',
      handler: 'campus_fact',
      jev: {
        decided: {
          handler: 'campus_fact',
          goesTo: 'retrieval',
          lowConfidence: { work: 0.62, multiPart: 0.71 },
        },
      },
    },
  },
};

test("the new Brain's not-ready turns are not built yet, not failed (09-29)", () => {
  assert.equal(turnOutcome(503, notReady), 'not_built');
  assert.equal(turnOutcome(503, { reason: 'not_ready' }), 'not_built');
  assert.equal(turnOutcome(503, { reason: 'brain_error' }), 'failed');
  assert.equal(turnOutcome(200, { status: 'unavailable' }), 'declined');
  assert.equal(turnOutcome(200, { status: 'partial' }), 'ok');
});

test("each turn names Jev's route and the picks it wasn't sure of", () => {
  assert.deepEqual(readJevRoute(notReady), {
    route: 'campus_fact',
    label: 'campus fact → retrieval',
    lowConfidence: [
      { pick: 'kind of work', percent: 62 },
      { pick: 'several parts', percent: 71 },
    ],
  });
  const answered = {
    metrics: {
      jev: {
        decided: { handler: 'account_action', goesTo: 'capability limit', lowConfidence: {} },
      },
    },
  };
  assert.deepEqual(readJevRoute(answered), {
    route: 'account_action',
    label: 'account action → capability limit',
    lowConfidence: [],
  });
});

test('without Jev, the danger phrases still name the route; without metrics, nothing shows', () => {
  const phrases = { metrics: { handler: 'danger', jev: { skipped: 'routing_timeout' } } };
  assert.deepEqual(readJevRoute(phrases), { route: 'danger', label: 'danger', lowConfidence: [] });
  assert.equal(readJevRoute({ answer: 'hi' }), undefined);
  assert.equal(readJevRoute(undefined), undefined);
});
