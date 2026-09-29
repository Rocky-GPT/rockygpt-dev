import assert from 'node:assert/strict';
import test from 'node:test';
import { workedSteps } from '../lib/chat-stream.ts';

const shares = (step) => Object.fromEntries(step.work.map((share) => [share.who, share.ms]));

test('each step says who did its work, from the calls the Brain timed', () => {
  const worked = workedSteps({
    steps: [
      { stage: 'connecting', subjects: [], atMs: 0 },
      { stage: 'understanding', subjects: [], atMs: 300 },
      // Round 0 repeats the stage: it merges into the row above, as it did live.
      { stage: 'understanding', subjects: [], atMs: 1_250 },
      { stage: 'retrieving', subjects: [{ topic: 'shuttle' }], atMs: 4_400 },
      { stage: 'composing', subjects: [{ topic: 'shuttle' }], atMs: 4_900 },
      { stage: 'reviewing', subjects: [{ topic: 'shuttle' }], atMs: 9_900 },
    ],
    calls: [
      { who: 'jev', what: 'routing', step: 1, startMs: 350, ms: 900 },
      { who: 'gpt', what: 'draft', step: 2, startMs: 1_260, ms: 3_100 },
      { who: 'gpt', what: 'draft', step: 4, startMs: 4_910, ms: 4_980 },
      { who: 'gpt', what: 'review', step: 5, startMs: 9_910, ms: 4_000, failed: true },
    ],
    endMs: 13_950,
  });
  assert.deepEqual(
    worked.steps.map((step) => [step.stage, step.ms]),
    [
      ['connecting', 300],
      ['understanding', 4_100],
      ['retrieving', 500],
      ['composing', 5_000],
      ['reviewing', 4_050],
    ]
  );
  assert.deepEqual(shares(worked.steps[0]), { code: 300 });
  assert.deepEqual(shares(worked.steps[1]), { jev: 900, gpt: 3_100, code: 100 });
  assert.deepEqual(worked.steps[1].work.map((share) => share.calls), [['routing'], ['draft'], []]);
  assert.deepEqual(shares(worked.steps[2]), { code: 500 });
  assert.deepEqual(shares(worked.steps[3]), { gpt: 4_980, code: 20 });
  assert.deepEqual(worked.steps[4].work[0].calls, ['review (failed)']);
  assert.equal(worked.endMs, 13_950);
});

test('overlapping calls count once, and a step with no time is still code', () => {
  const worked = workedSteps({
    steps: [
      { stage: 'retrieving', subjects: [], atMs: 0 },
      { stage: 'calculating', subjects: [], operation: 'departures', atMs: 1_000 },
    ],
    calls: [
      { who: 'jev', what: 'filter', step: 0, startMs: 100, ms: 500 },
      { who: 'jev', what: 'filter', step: 0, startMs: 300, ms: 500 },
    ],
    endMs: 1_000,
  });
  assert.deepEqual(worked.steps[0].work, [
    { who: 'jev', ms: 700, calls: ['record check ×2'] },
    { who: 'code', ms: 300, calls: [] },
  ]);
  assert.deepEqual(worked.steps[1].work, [{ who: 'code', ms: 0, calls: [] }]);
});

test('an answer without a work record keeps the live timeline', () => {
  assert.equal(workedSteps(undefined), undefined);
  assert.equal(workedSteps({ steps: [], calls: [], endMs: 0 }), undefined);
  assert.equal(workedSteps({ steps: [{ stage: 'connecting' }], endMs: 5 }), undefined);
});
