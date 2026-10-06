import assert from 'node:assert/strict';
import test from 'node:test';
import { brainTrace, readJevDecision, readJevRoute } from '../lib/jev-route.ts';
import { currentOutcome, turnOutcome } from '../components/ask/types.ts';

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
  assert.deepEqual(readJevRoute(phrases), {
    route: 'danger',
    label: 'danger → safety path',
    lowConfidence: [],
  });
  assert.equal(readJevRoute({ answer: 'hi' }), undefined);
  assert.equal(readJevRoute(undefined), undefined);
});

// "Where is Financial Aid?" on the new Brain (09-29), as a not-ready turn keeps it.
const financialAid = {
  reason: 'not_ready',
  upstreamResponse: {
    reason: 'not_ready',
    metrics: {
      responseMode: 'not_ready',
      dangerPhrase: null,
      handler: 'campus_fact',
      jev: {
        answers: {
          danger: { choice: 'none', probability: 0.97, confidence: 0.95 },
          own_account: { yes: 0.04 },
          own_account_only: { yes: 0.06 },
          needs_earlier: { yes: 0.12 },
          work: { choice: 'look_up', probability: 0.84, confidence: 0.7 },
          subject: { choice: 'money', probability: 0.93, confidence: 0.9 },
          named: { choice: 'office', probability: 0.95, confidence: 0.9 },
          needs: { choice: 'campus_info', probability: 0.96, confidence: 0.9 },
          multi_part: { yes: 0.02 },
        },
        decided: {
          reach: 'supported',
          handler: 'campus_fact',
          goesTo: 'retrieval',
          handlerPath: ['danger', 'ownAccount', 'multiPart', 'work'],
          lowConfidence: { work: 0.84 },
        },
        costNusd: 79758,
        elapsedMs: 272,
      },
    },
  },
};

test('the trace card says what Jev read, how sure, and what code did (09-29)', () => {
  const decision = readJevDecision(financialAid);
  assert.equal(decision.route.label, 'campus fact → retrieval');
  assert.equal(decision.routePercent, 84);
  assert.deepEqual(decision.readings.slice(0, 3), [
    { label: 'Kind of work', answer: 'look up a campus fact', percent: 84, low: true },
    { label: 'Needs earlier messages', answer: 'no', percent: 88, low: true },
    { label: 'Danger', answer: 'none', percent: 97, low: false },
  ]);
  assert.deepEqual(
    decision.readings.find((reading) => reading.label === 'What answering needs'),
    {
      label: 'What answering needs',
      answer: 'campus information (answerable)',
      percent: 96,
      low: false,
    }
  );
  assert.equal(decision.readings.length, 9);
  assert.match(decision.codeDid, /kind of work\) to campus fact → retrieval\./);
  assert.match(decision.codeDid, /isn't built yet/);
  assert.equal(decision.ms, 272);
  assert.equal(decision.costUsd, 0.000079758);
});

test('a turn without Jev says why', () => {
  const decision = readJevDecision({
    metrics: {
      responseMode: 'safety_net',
      dangerPhrase: 'danger',
      handler: 'danger',
      jev: { skipped: 'routing_timeout' },
    },
  });
  assert.equal(decision.skipped, 'Jev ran out of time');
  assert.equal(decision.route.label, 'danger → safety path');
  assert.match(decision.codeDid, /danger phrases heard danger/);
  assert.equal(readJevDecision({ answer: 'hi' }), undefined);
});

test('a not-ready turn settled before the rule changed now reads not built', () => {
  const old = { localId: 'a', status: 'failed', httpStatus: 503, raw: financialAid };
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

test('the Brain\'s trace is read from a good turn, a failed turn, and absent when none was sent', () => {
  const lookup = { tool: 'office_facts', status: 'ok' };
  assert.deepEqual(brainTrace({ answer: 'x', trace: [lookup] }), [lookup]);
  assert.deepEqual(brainTrace({ answer: 'x', trace: [] }), []);
  assert.deepEqual(brainTrace({ reason: 'x', upstreamResponse: { trace: [lookup] } }), [lookup]);
  assert.equal(brainTrace({ reason: 'x', upstreamResponse: { metrics: {} } }), undefined);
  assert.equal(brainTrace({ answer: 'x' }), undefined);
  assert.equal(brainTrace(undefined), undefined);
});
