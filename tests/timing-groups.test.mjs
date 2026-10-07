import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TINY_SHARE,
  categoryOf,
  formatDuration,
  percent,
  summarizeTiming,
} from '../lib/timing-groups.ts';

// Every label the Brain and the Dev UI can produce, with the category a person would expect.
const LABELS = {
  'Prepare browser request': 'network',
  'Brain request handling': 'brain',
  'Read request body': 'brain',
  'Prepare turn and check safety boundary': 'brain',
  'Prepare conversation and root': 'brain',
  'Model call 1 · coordination': 'brain',
  'Model call 1 · Reserve model allowance': 'ledger',
  'Model call 1 · Provider request · network and model': 'model',
  'Model call 2 · Release unused model allowance': 'ledger',
  'Model call 1 · Record uncertain model charge': 'ledger',
  'Model call 1 · Pause model spending': 'ledger',
  'Model call 1 · Validate model usage': 'brain',
  'Model call 1 · Settle model usage': 'ledger',
  'Model call 1 · Decode model decision': 'brain',
  'Validate model decision and tool arguments': 'brain',
  'Lookup 1 · coordination': 'lookup',
  'Lookup 1 · Open root · Ramapo': 'lookup',
  'Lookup 1 · Open Offices · read published directory': 'lookup',
  'Lookup 1 · Match office name or service': 'lookup',
  'Lookup 1 · Open matched office · read published records · shared entity facts': 'lookup',
  'Lookup 1 · Render verified evidence': 'lookup',
  'Look up emergency contacts': 'lookup',
  'Look up emergency contacts · Read emergency contact evidence': 'lookup',
  'Prepare lookup output for model': 'brain',
  'Compose final response': 'brain',
  'Compose safety response': 'brain',
  'Compose partial or failed response': 'brain',
  'Prepare failure response': 'brain',
  'Finalize timing and encode Brain response': 'brain',
  'Transport, Dev UI proxy and browser wait': 'network',
  'Read response body in browser': 'network',
  'Decode response and prepare display': 'network',
  'Request until failure or cancellation · breakdown unavailable': 'unrecorded',
  'Wait for response · Brain timing unavailable': 'unrecorded',
  'Read response until failure': 'unrecorded',
};

test('every known step label lands in the category a person would expect', () => {
  for (const [label, category] of Object.entries(LABELS)) {
    assert.equal(categoryOf(label), category, label);
  }
  assert.equal(categoryOf('A step nobody has named yet'), 'brain');
});

// The steps of the real Financial Aid turn from the Dev UI (durations in microseconds).
const TURN = [
  ['Prepare browser request', 400], ['Brain request handling', 107], ['Prepare conversation and root', 226],
  ['Model call 1 · Reserve model allowance', 1_414_816], ['Model call 1 · coordination', 78],
  ['Model call 1 · Provider request · network and model', 3_411_438],
  ['Model call 1 · Settle model usage', 618_226], ['Validate model decision and tool arguments', 103],
  ['Lookup 1 · Open Offices · read published directory', 63_519],
  ['Lookup 1 · Match office name or service', 33_862],
  ['Lookup 1 · Open matched office · read published records · shared entity facts', 28_888],
  ['Model call 2 · Reserve model allowance', 1_077_471],
  ['Model call 2 · Provider request · network and model', 1_717_873],
  ['Model call 2 · Settle model usage', 640_102], ['Compose final response', 94],
  ['Transport, Dev UI proxy and browser wait', 50_430],
].map(([label, durationUs]) => ({ label, durationUs }));

test('the category totals add up to the sum of the steps, and nothing is dropped', () => {
  const summary = summarizeTiming(TURN);
  const sum = TURN.reduce((total, step) => total + step.durationUs, 0);
  assert.equal(summary.totalUs, sum);
  assert.equal(summary.totals.reduce((total, row) => total + row.durationUs, 0), sum);
  assert.equal(summary.segments.reduce((total, segment) => total + segment.durationUs, 0), sum);
  assert.ok(Math.abs(summary.totals.reduce((total, row) => total + row.share, 0) - 1) < 1e-9);
});

test('the turn reads as AI model, then ledger, with the campus lookup a small part', () => {
  const summary = summarizeTiming(TURN);
  assert.deepEqual(summary.totals.map(row => row.category), ['model', 'ledger', 'lookup', 'network', 'brain']);
  const by = Object.fromEntries(summary.totals.map(row => [row.category, row.durationUs]));
  assert.equal(by.model, 3_411_438 + 1_717_873);
  assert.equal(by.ledger, 1_414_816 + 618_226 + 1_077_471 + 640_102);
  assert.equal(by.lookup, 63_519 + 33_862 + 28_888);
  assert.ok(by.lookup / summary.totalUs < 0.02);
});

test('the timeline keeps the order things happened in and joins neighbours of one category', () => {
  const summary = summarizeTiming([
    { label: 'Lookup 1 · Open root · Ramapo', durationUs: 1_000 },
    { label: 'Lookup 1 · coordination', durationUs: 1_000 },
    { label: 'Model call 1 · Provider request · network and model', durationUs: 8_000 },
    { label: 'Lookup 2 · Match office name or service', durationUs: 90_000 },
  ]);
  assert.deepEqual(summary.segments.map(s => [s.category, s.durationUs, s.steps]),
    [['lookup', 2_000, 2], ['model', 8_000, 1], ['lookup', 90_000, 1]]);
});

test('a segment under half a percent of the turn is flagged as a hairline', () => {
  const summary = summarizeTiming([
    { label: 'Model call 1 · Provider request · network and model', durationUs: 1_000_000 },
    { label: 'Compose final response', durationUs: 1_000_000 * TINY_SHARE / 2 },
    { label: 'Model call 2 · Provider request · network and model', durationUs: 1_000_000 },
  ]);
  assert.deepEqual(summary.segments.map(s => s.tiny), [false, true, false]);
});

test('the slowest steps are the biggest ones, without empty steps', () => {
  const slow = summarizeTiming([...TURN, { label: 'Nothing happened', durationUs: 0 }], 3).slowest;
  assert.deepEqual(slow.map(s => s.label), [
    'Model call 1 · Provider request · network and model',
    'Model call 2 · Provider request · network and model',
    'Model call 1 · Reserve model allowance',
  ]);
  assert.equal(slow[0].category, 'model');
});

test('an unrecorded interval is its own category and an empty turn does not divide by zero', () => {
  const summary = summarizeTiming([
    { label: 'Prepare browser request', durationUs: 500 },
    { label: 'Wait for response · Brain timing unavailable', durationUs: 9_500 },
  ]);
  assert.equal(summary.totals[0].category, 'unrecorded');
  assert.equal(summarizeTiming([]).totalUs, 0);
  assert.deepEqual(summarizeTiming([]).totals, []);
  assert.equal(summarizeTiming([{ label: 'Compose final response', durationUs: 0 }]).totals[0].share, 0);
});

test('durations read in the unit that suits their size', () => {
  assert.equal(formatDuration(9_065_900), '9.07 s');
  assert.equal(formatDuration(63_519), '63.5 ms');
  assert.equal(formatDuration(1_414), '1.41 ms');
  assert.equal(formatDuration(226), '0.226 ms');
  assert.equal(percent(0.376), '38%');
  assert.equal(percent(0.0149), '1.5%');
  assert.equal(percent(0.00004), '<0.1%');
});
