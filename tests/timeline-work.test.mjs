import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupCounts, stepReasons, workTotals, workedSteps } from '../lib/chat-stream.ts';

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
  assert.deepEqual(
    worked.steps[1].work.map((share) => share.calls),
    [['routing'], ['draft'], []]
  );
  assert.deepEqual(shares(worked.steps[2]), { code: 500 });
  assert.deepEqual(shares(worked.steps[3]), { gpt: 4_980, code: 20 });
  assert.deepEqual(worked.steps[4].work[0].calls, ['review (failed)']);
  assert.equal(worked.endMs, 13_950);

  // The bar: each step's time in the order it happened, adding up to the step.
  assert.deepEqual(worked.steps[1].segments, [
    { who: 'code', ms: 50 },
    { who: 'jev', ms: 900, call: 'routing' },
    { who: 'code', ms: 10 },
    { who: 'gpt', ms: 3_100, call: 'draft' },
    { who: 'code', ms: 40 },
  ]);
  for (const step of worked.steps) {
    assert.equal(
      step.segments.reduce((sum, segment) => sum + segment.ms, 0),
      step.ms
    );
  }

  // The line on top: the whole turn by who did the work, largest first.
  assert.deepEqual(
    workTotals(worked).map(({ who, ms, calls }) => [who, ms, calls]),
    [
      ['gpt', 12_080, 3],
      ['code', 970, 0],
      ['jev', 900, 1],
    ]
  );
  assert.equal(Math.round(workTotals(worked)[0].share * 100), 87);
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
  // An overlapping record check adds only its time past the earlier one, and still
  // counts as a call.
  assert.deepEqual(worked.steps[0].segments, [
    { who: 'code', ms: 100 },
    { who: 'jev', ms: 500, call: 'record check' },
    { who: 'jev', ms: 200, call: 'record check' },
    { who: 'code', ms: 200 },
  ]);
  assert.deepEqual(worked.calls, { jev: 2, gpt: 0 });
});

test('an answer without a work record keeps the live timeline', () => {
  assert.equal(workedSteps(undefined), undefined);
  assert.equal(workedSteps({ steps: [], calls: [], endMs: 0 }), undefined);
  assert.equal(workedSteps({ steps: [{ stage: 'connecting' }], endMs: 5 }), undefined);
});

test('each step says why it ran and what its lookups got back, as the Brain recorded', () => {
  // The shape of the 20.6 s "eat right now" turn on 09-28: Jev's reply didn't check
  // out, GPT planned three searches, asked for one more lookup, then wrote.
  const menuSearch = { collection: 'menu', query: '', filters: { meal: null }, limit: 100 };
  const profile = { entity: 'Birch Tree Inn', include: ['menu', 'hours'], meal: 'Late Night' };
  const worked = workedSteps({
    steps: [
      { stage: 'connecting', subjects: [], atMs: 0 },
      {
        stage: 'understanding',
        subjects: [],
        atMs: 100,
        routing: {
          mode: 'active',
          route: 'unresolved',
          confidence: null,
          directRetrieval: false,
          fallbackReason: 'routing_invalid_response',
        },
      },
      {
        stage: 'understanding',
        subjects: [],
        atMs: 400,
        draft: {
          by: 'gpt',
          call: 1,
          asked: [
            { tool: 'search_campus', arguments: menuSearch },
            { tool: 'search_campus', arguments: { collection: 'dining_hours', query: '' } },
          ],
        },
      },
      {
        stage: 'retrieving',
        subjects: [{ topic: 'menu' }],
        atMs: 4_000,
        lookups: [
          {
            tool: 'search_campus',
            arguments: menuSearch,
            status: 'ok',
            matched: 141,
            fetched: 100,
            delivered: 19,
            truncated: true,
            reason: 'retrieval_delivery_limit',
          },
        ],
      },
      {
        stage: 'retrieving',
        subjects: [{ topic: 'dining_hours' }],
        atMs: 4_700,
        lookups: [
          {
            tool: 'search_campus',
            arguments: { collection: 'dining_hours', query: '' },
            status: 'ok',
            matched: 9,
            fetched: 9,
            delivered: 4,
            truncated: false,
            reason: null,
            filtered: { records: 9, dropped: 5 },
          },
        ],
      },
      {
        stage: 'composing',
        subjects: [],
        atMs: 5_200,
        draft: { by: 'gpt', call: 2, asked: [{ tool: 'lookup_profile', arguments: profile }] },
      },
      {
        stage: 'retrieving',
        subjects: [{ topic: 'menu' }, { topic: 'dining_hours' }],
        atMs: 9_000,
        lookups: [
          {
            tool: 'lookup_profile',
            arguments: profile,
            status: 'ok',
            matched: 34,
            fetched: 13,
            delivered: 13,
            truncated: true,
            sections: {
              menu: {
                status: 'partial',
                total_matches: 33,
                returned_count: 12,
                omitted_count: 21,
                reason: 'menu_item_limit',
              },
              hours: { status: 'available', total_matches: 1, returned_count: 1, omitted_count: 0 },
            },
          },
        ],
      },
      {
        stage: 'composing',
        subjects: [],
        atMs: 9_200,
        draft: { by: 'gpt', call: 3, answerOnly: true, asked: [] },
      },
      { stage: 'reviewing', subjects: [], atMs: 14_300 },
    ],
    calls: [],
    endMs: 20_300,
  });
  const [, understanding, menu, hours, firstWrite, lookup, secondWrite, checking] = worked.steps;
  // The two understanding reports merged into one row, keeping both facts.
  assert.deepEqual(stepReasons(understanding, 0), [
    "Jev's reply didn't check out → GPT plans",
    'GPT planned: menu search; dining hours search',
  ]);
  assert.deepEqual(lookupCounts(menu), [
    'menu search: 19 of 141 menu items · 100 fetched, no room in the prompt for the rest',
  ]);
  assert.deepEqual(lookupCounts(hours), [
    'dining hours search: 4 of 9 dining hours records · Jev kept 4 of 9',
  ]);
  assert.deepEqual(stepReasons(firstWrite, 1), [
    'no answer yet, GPT asked for Birch Tree Inn menu, hours · Late Night',
  ]);
  assert.deepEqual(lookupCounts(lookup), [
    'Birch Tree Inn menu, hours · Late Night: 12 of 33 menu items (menu limit) · 1 hours record',
  ]);
  assert.deepEqual(stepReasons(secondWrite, 2), [
    '2nd try: GPT wrote the answer (no lookups left)',
  ]);
  assert.deepEqual([stepReasons(checking, 2), lookupCounts(checking)], [[], []]);
});

test('Jev handoffs read as one line', () => {
  const reasons = (routing) =>
    stepReasons(
      workedSteps({
        steps: [{ stage: 'understanding', subjects: [], atMs: 0, routing }],
        endMs: 1,
      }).steps[0],
      0
    );
  assert.deepEqual(
    reasons({ route: 'unresolved', confidence: 0.36, fallbackReason: 'uncertain_route' }),
    ['Jev unsure (36%) → GPT plans']
  );
  assert.deepEqual(
    reasons({ route: 'search', confidence: 0.76, directRetrieval: true, fallbackReason: null }),
    ['Jev picked search (76%) and looked it up itself']
  );
  // A request for the student's own account, which code answers itself.
  assert.deepEqual(reasons({ route: 'own_account', confidence: 0.98, fallbackReason: null }), [
    "Jev read it as a request for the student's own account (98%)",
  ]);
  const accessLimit = workedSteps({
    steps: [
      { stage: 'composing', subjects: [], atMs: 0, written: { by: 'code', mode: 'access_limit' } },
    ],
    endMs: 1,
  }).steps[0];
  assert.deepEqual(stepReasons(accessLimit, 1), [
    'Code wrote what RockyGPT can’t reach, with no GPT call',
  ]);
  // Several lookups, like today's hours and the meal on now, and no one route.
  assert.deepEqual(
    reasons({ route: 'unresolved', confidence: 0.77, directRetrieval: true, parts: 2 }),
    ['Jev ran 2 lookups itself (77%)']
  );
  assert.deepEqual(
    reasons({ route: 'profile', confidence: 0.98, fallbackReason: 'arguments_unresolved' }),
    ['Jev picked profile (98%) → GPT fills in the lookup']
  );
});
