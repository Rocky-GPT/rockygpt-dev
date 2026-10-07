import assert from 'node:assert/strict';
import test from 'node:test';
import { pipelineStages, pipelineTime } from '../lib/pipeline.ts';

const office = { id: 'testing', name: 'Testing Center', kind: 'office' };
const source = { id: 's1', title: 'campus-hours', collection: 'campus_hours', urls: ['https://example.edu/'], captured_at: '2026-10-07T00:41:16-04:00', freshness: 'fresh', validity: 'current', current: true, limitations: [] };

function packet(changes = {}) {
  return {
    version: '1.0',
    request: { intent: 'hours', entities: [{ ...office, query: 'testing center' }], fields: ['hours'], asOf: '2026-10-07T12:00:00-04:00', dataset: { version: 'release-1', identityHash: 'h' } },
    status: 'complete',
    facts: [{ id: 'f1', subject: office, predicate: 'hours', value: { days: [{ day: 'Saturday', hours: 'Hours unavailable' }] }, status: 'known', current: true, source_ids: ['s1'] }],
    derived_facts: [],
    missing: [],
    not_published: [],
    ambiguities: [],
    unresolved: [],
    notices: [],
    sources: [source, { ...source, id: 's2' }],
    ...changes,
  };
}

const saturday = {
  id: 'd1', subject: office, predicate: 'hours_on', day: 'Saturday', date: '2026-10-10',
  value: { schedule: 'Testing Center', hours: 'Hours unavailable' }, applies: true, current: true, from: ['f1'], source_ids: ['s1'],
};

const call = (args = { query: 'testing center', fields: ['hours'], day: 'saturday' }) => ({
  tool: 'graph_lookup',
  arguments: args,
  status: 'ok',
  path: [{ id: 'ramapo', label: 'Ramapo' }, { id: 'offices', label: 'Offices' }, { id: 'testing', label: 'Testing Center' }],
  dataset_version: 'release-1',
});

const input = (raw, changes = {}) => ({ raw, question: 'is the testing center open on saturday?', earlierMessages: 0, failed: false, ...changes });
const byId = (stages) => Object.fromEntries(stages.map((s) => [s.id, s]));

test('a day question goes through every stage, and only the order slip is the AI model', () => {
  const full = packet({ derived_facts: [saturday] });
  const raw = {
    answer: '', status: 'answered', facts: full,
    writerInput: { asked: {}, status: 'complete', derived_facts: [{ day: 'Saturday' }], sources: [{ n: 1 }] },
    trace: [call()], metrics: { modelCalls: 2, committedNusd: 120_000 },
  };
  const stages = pipelineStages(input(raw, { totalsUs: { model: 2_330_000, ledger: 2_790_000, lookup: 103_000, brain: 4_700 } }));
  assert.deepEqual(stages.map((s) => s.id), ['question', 'model', 'lookup', 'worked_out', 'packet', 'writer_input', 'writer']);
  assert.deepEqual(stages.map((s) => s.doer), ['student', 'AI model', 'plain code', 'plain code', 'plain code', 'plain code', 'not built']);
  const s = byId(stages);
  assert.equal(s.model.summary, 'Asked for hours of “testing center”, day saturday');
  assert.deepEqual(s.model.details.map((d) => `${d.label}=${d.value}`), ['model calls=2', 'spend=$0.0001', 'AI model time=2.33 s', 'spending ledger time=2.79 s']);
  assert.equal(s.lookup.summary, 'Ramapo → Offices → Testing Center, ok');
  assert.deepEqual(s.lookup.details.map((d) => d.value), ['release-1', '103 ms']);
  assert.equal(s.worked_out.state, 'done');
  assert.equal(s.worked_out.summary, 'hours on Saturday 2026-10-10: Hours unavailable');
  assert.match(s.packet.summary, /^Status complete: 1 fact\./);
  assert.ok(s.packet.details.some((d) => d.label.startsWith('Brain code time')));
  assert.match(s.writer_input.summary, /^Cut down to \d+ of \d+ B, \d+% smaller\.$/);
  assert.ok(s.writer_input.details.some((d) => d.label === 'sources nothing cites' && d.value === '1'));
  assert.ok(s.writer_input.details.some((d) => d.label === 'full-week facts replaced by a day' && d.value === '1'));
  assert.equal(s.writer.state, 'not_built');
  assert.equal(s.writer.open, 'answer');
});

test('with no day asked there is nothing to work out, and no lookup skips the lookup', () => {
  const asked = pipelineStages(input({ answer: '', facts: packet(), writerInput: { status: 'complete' }, trace: [call({ query: 'testing center', fields: ['hours'], day: null })] }));
  assert.equal(byId(asked).worked_out.state, 'skipped');
  assert.equal(byId(asked).worked_out.summary, 'Nothing to work out: no day was asked.');
  assert.equal(byId(asked).model.summary, 'Asked for hours of “testing center”');
  const greeting = pipelineStages(input({ answer: '', facts: packet({ request: { ...packet().request, entities: [], fields: [], intent: 'greeting' }, facts: [], status: 'no_facts_needed' }), trace: [], metrics: { modelCalls: 1 } }, { question: 'hi' }));
  assert.equal(byId(greeting).lookup.state, 'skipped');
  assert.equal(byId(greeting).lookup.summary, 'Nothing to look up.');
  assert.equal(byId(greeting).model.summary, 'Answered without looking anything up.');
});

test('a text-mode answer has no packet, and the renderer, not a writer, wrote it', () => {
  const stages = byId(pipelineStages(input({ answer: 'Testing Center: hours …', status: 'answered', trace: [call()] })));
  assert.equal(stages.packet.state, 'skipped');
  assert.equal(stages.packet.summary, 'This Brain wrote the answer itself, so it sent no Fact Packet.');
  assert.equal(stages.worked_out.summary, 'No Fact Packet, so nothing is worked out.');
  assert.equal(stages.writer.state, 'done');
  assert.match(stages.writer.summary, /does not read the Fact Packet/);
});

test('a failed turn marks the model stage and the missing answer, and the danger list is code', () => {
  const failed = byId(pipelineStages(input({ upstreamResponse: { error: 'x' } }, { failed: true, failure: 'The Brain request failed.' })));
  assert.equal(failed.model.state, 'failed');
  assert.equal(failed.model.summary, 'The Brain request failed.');
  assert.equal(failed.writer.state, 'failed');
  const floor = byId(pipelineStages(input({ answer: 'Call 911.', metrics: { decidedBy: 'phrase_floor' }, trace: [] })));
  assert.equal(floor.model.doer, 'plain code');
  assert.match(floor.model.summary, /danger phrase list/);
});

test('an ambiguous lookup names its choices, and long questions are clipped', () => {
  const ambiguous = { ...call({ query: 'the center', fields: ['phones'], day: null }), status: 'ambiguous', candidates: ['A Center', 'B Center'] };
  const stages = byId(pipelineStages(input({ answer: '', facts: packet(), trace: [ambiguous] }, { question: 'x'.repeat(200), earlierMessages: 3 })));
  assert.equal(stages.lookup.summary, 'Ramapo → Offices → Testing Center, ambiguous: A Center or B Center');
  // 89 letters, an ellipsis and the two quotation marks around them.
  assert.equal(stages.question.summary.length, 92);
  assert.deepEqual(stages.question.details, [{ label: 'earlier messages sent with it', value: '3' }]);
});

test('times read as a person would say them', () => {
  assert.equal(pipelineTime(117_000), '117 ms');
  assert.equal(pipelineTime(5_570_000), '5.57 s');
  assert.equal(pipelineTime(200), '1 ms');
});
