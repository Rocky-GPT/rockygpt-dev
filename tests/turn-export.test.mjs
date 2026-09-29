import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExportTables,
  exportConversation,
  exportTurn,
  exportedEvidence,
} from '../lib/turn-export.ts';

const request = { messages: [{ role: 'user', content: 'Where is the Registrar?' }] };
const startedAt = Date.parse('2026-09-28T21:40:00.000Z');

test('an answered turn says when it ran, which Brain answered and what it read', () => {
  const brain = {
    revision: 'a'.repeat(40),
    release: 'gpt-6-luna-dev',
    configurationHash: 'c'.repeat(64),
  };
  const exported = exportTurn({
    localId: 'one',
    question: 'Where is the Registrar?',
    request,
    requestText: JSON.stringify(request),
    status: 'ok',
    httpStatus: 200,
    startedAt,
    finishedAt: startedAt + 6_400,
    latencyMs: 6_400,
    firstProgressMs: 40,
    steps: [{ stage: 'connecting', subjects: [], atMs: 40 }],
    draftPreview: { text: 'The Registrar is in D-224.', atMs: 4_100 },
    raw: {
      answer: 'The Registrar is in D-224.',
      datasetVersion: 'dev-profiles-names-20260928',
      elapsedMs: 6_300,
      diagnostics: {
        brain,
        startedAt: '2026-09-28T17:40:00-04:00',
        evidence: [{ id: 'contacts:registrar' }],
        drafts: [{ draftCall: 1, outcome: 'accepted', review: [] }],
      },
    },
  });
  assert.equal(exported.sentAt, '2026-09-28T21:40:00.000Z');
  assert.equal(exported.finishedAt, '2026-09-28T21:40:06.400Z');
  assert.deepEqual(exported.timing, {
    firstProgressMs: 40,
    firstAnswerTextMs: 4_100,
    firstAnswerText: 'draft_preview',
    totalMs: 6_400,
    brainElapsedMs: 6_300,
  });
  assert.deepEqual(exported.brain, {
    ...brain,
    datasetVersion: 'dev-profiles-names-20260928',
    startedAt: '2026-09-28T17:40:00-04:00',
  });
  assert.equal(exported.draftPreview, 'The Registrar is in D-224.');
  assert.deepEqual(exported.response.diagnostics.evidenceIds, ['contacts:registrar']);
  // No work record from this Brain: the steps as they arrived are the only timing.
  assert.deepEqual(exported.steps, [{ stage: 'connecting', subjects: [], atMs: 40 }]);
  assert.equal(exported.timeline, undefined);
});

test("a refusal's emergency help is its first text, and its diagnostics are still read", () => {
  const exported = exportTurn({
    localId: 'two',
    question: 'Someone passed out',
    request,
    requestText: JSON.stringify(request),
    status: 'failed',
    httpStatus: 429,
    startedAt,
    finishedAt: startedAt + 900,
    latencyMs: 900,
    raw: {
      error: 'RockyGPT is currently unavailable.',
      emergency: { text: 'Call 911.' },
      upstreamResponse: { diagnostics: { brain: { revision: 'b'.repeat(40) } } },
    },
  });
  assert.equal(exported.timing.firstAnswerText, 'emergency_help');
  assert.equal(exported.timing.firstAnswerTextMs, 900);
  assert.equal(exported.brain.revision, 'b'.repeat(40));
  assert.equal(exported.brain.datasetVersion, null);
});

test('the conversation lists its messages and evidence once, and each turn its timeline', () => {
  const registrar = { id: 'contacts:registrar', title: 'Registrar', content: 'Office: D-224' };
  const work = {
    steps: [
      { stage: 'connecting', subjects: [], atMs: 0 },
      {
        stage: 'understanding',
        subjects: [],
        atMs: 200,
        routing: { route: 'unresolved', confidence: 0.36, fallbackReason: 'uncertain_route' },
      },
      {
        stage: 'understanding',
        subjects: [],
        atMs: 500,
        draft: {
          by: 'gpt',
          call: 1,
          asked: [{ tool: 'lookup_contact', arguments: { entity: 'Registrar' } }],
        },
      },
      {
        stage: 'retrieving',
        subjects: [{ topic: 'contacts' }],
        atMs: 3_000,
        lookups: [
          {
            tool: 'lookup_contact',
            arguments: { entity: 'Registrar' },
            status: 'ok',
            matched: 1,
            fetched: 1,
            delivered: 1,
          },
        ],
      },
      { stage: 'composing', subjects: [], atMs: 3_100, draft: { by: 'gpt', call: 2, asked: [] } },
      { stage: 'reviewing', subjects: [], atMs: 6_000 },
    ],
    calls: [
      { who: 'jev', what: 'routing', step: 1, startMs: 250, ms: 240 },
      { who: 'gpt', what: 'draft', step: 2, startMs: 520, ms: 2_400 },
      { who: 'gpt', what: 'draft', step: 4, startMs: 3_150, ms: 2_800 },
      { who: 'gpt', what: 'review', step: 5, startMs: 6_050, ms: 2_900 },
    ],
    endMs: 9_000,
  };
  const turn = (question, messages) => ({
    localId: question,
    question,
    request: { messages },
    requestText: JSON.stringify({ messages }),
    status: 'ok',
    httpStatus: 200,
    startedAt,
    finishedAt: startedAt + 9_200,
    latencyMs: 9_200,
    steps: [{ stage: 'connecting', subjects: [], atMs: 40 }],
    raw: {
      answer: 'D-224.',
      trace: [{ tool: 'lookup_contact', arguments: { entity: 'Registrar' } }],
      metrics: { draftCalls: 2, toolResults: [{ tool: 'lookup_contact' }] },
      diagnostics: { evidence: [registrar], drafts: [], work },
    },
  });
  const first = { role: 'user', content: 'Where is the Registrar?' };
  const answer = { role: 'assistant', content: 'D-224.' };
  const second = { role: 'user', content: 'And its phone?' };
  const text = exportConversation(
    [turn('Where is the Registrar?', [first]), turn('And its phone?', [first, answer, second])],
    new Date(startedAt)
  );
  assert.ok(!text.includes('\n  '), 'compact JSON');
  const exported = JSON.parse(text);
  // History is written once and named by index.
  assert.deepEqual(exported.messages, [first, answer, second]);
  assert.deepEqual(
    exported.turns.map((turn) => turn.request.messages),
    [[0], [0, 1, 2]]
  );
  // Evidence is written once and named by ID.
  assert.deepEqual(exported.evidence, { 'contacts:registrar': registrar });
  assert.deepEqual(exported.evidenceVersions, {});
  assert.deepEqual(exported.turns[1].response.diagnostics.evidenceIds, ['contacts:registrar']);
  // `trace` keeps its arguments; its copy without them is gone.
  const [one] = exported.turns;
  assert.equal(one.response.metrics.toolResults, undefined);
  assert.equal(one.response.metrics.draftCalls, 2);
  assert.deepEqual(one.response.trace[0].arguments, { entity: 'Registrar' });
  // The Brain's own timings replace the steps as they arrived.
  assert.equal(one.steps, undefined);
  assert.equal(one.response.diagnostics.work.endMs, 9_000);
  // The Timeline as the panel shows it.
  assert.deepEqual(
    one.timeline.summary.map(({ who, calls }) => [who, calls]),
    [
      ['gpt', 3],
      ['code', 0],
      ['jev', 1],
    ]
  );
  const understanding = one.timeline.steps[1];
  assert.equal(understanding.step, 'Understanding the question');
  assert.deepEqual(understanding.why, [
    'Jev unsure (36%) → GPT plans',
    'GPT planned: Registrar contact',
  ]);
  assert.deepEqual(one.timeline.steps[2].found, ['Registrar contact: 1 record']);
  assert.deepEqual(one.timeline.steps[3].why, ['GPT wrote the answer']);
});

test('a single turn can still be exported on its own', () => {
  const tables = new ExportTables();
  const exported = exportTurn(
    {
      localId: 'x',
      question: 'Hi',
      request: { messages: [{ role: 'user', content: 'Hi' }] },
      requestText: '',
      status: 'ok',
      startedAt,
    },
    tables
  );
  assert.deepEqual(exported.request.messages, [0]);
  assert.deepEqual(tables.messages, [{ role: 'user', content: 'Hi' }]);
});

/** Turns that each received `evidence`, exported together and parsed back. */
function exportEvidence(...perTurn) {
  const turns = perTurn.map((evidence, index) => ({
    localId: String(index),
    question: `Question ${index + 1}`,
    request,
    requestText: JSON.stringify(request),
    status: 'ok',
    httpStatus: 200,
    startedAt,
    raw: { answer: 'An answer.', diagnostics: { evidence } },
  }));
  const exported = JSON.parse(exportConversation(turns, new Date(startedAt)));
  const received = exported.turns.map((turn) =>
    turn.response.diagnostics.evidenceIds.map((ref) => exportedEvidence(exported, ref))
  );
  return { exported, received };
}

test('the same record received twice is stored once, whatever its key order', () => {
  const office = { id: 'contacts:registrar', title: 'Registrar', content: 'Office: D-224' };
  const reordered = { content: 'Office: D-224', title: 'Registrar', id: 'contacts:registrar' };
  const { exported, received } = exportEvidence([office], [reordered]);
  assert.deepEqual(exported.evidence, { 'contacts:registrar': office });
  assert.deepEqual(exported.evidenceVersions, {});
  assert.deepEqual(
    exported.turns.map((turn) => turn.response.diagnostics.evidenceIds),
    [['contacts:registrar'], ['contacts:registrar']]
  );
  assert.deepEqual(received, [[office], [office]]);
});

test('each turn reconstructs the exact representation it received (09-29)', () => {
  // Q7/Q8 of the 09-28 replay: a profile lookup and a search returned the same
  // Birch hours ID with different identity, scope and limitations.
  const id = 'dining_hours:823a0076-7cab-41e8-9757-cc92d491ed27:2026-09-28';
  const profile = {
    id,
    canonical_entity_id: 'c98a4db7-9948-4e2c-98b5-4fe3f73ae488',
    related_to_entity_id: null,
    fields: { name: 'Birch Tree Inn', day: 'Monday', availability_scope: 'dining_service' },
    limitations: ['Published operating schedule; it does not establish staff availability.'],
    source_record_key: 'Birch Tree Inn:Monday',
  };
  const search = {
    id,
    canonical_entity_id: null,
    related_to_entity_id: 'c98a4db7-9948-4e2c-98b5-4fe3f73ae488',
    fields: { name: 'Birch Tree Inn', day: 'Monday' },
    limitations: [],
    source_record_key: null,
  };
  const other = { id: 'menu:birch', title: 'Birch menu' };
  const { exported, received } = exportEvidence([profile, other], [other, search], [profile]);
  assert.deepEqual(received, [[profile, other], [other, search], [profile]]);
  // The first representation stays under its ID; the other is a version.
  assert.deepEqual(exported.evidence[id], profile);
  assert.deepEqual(exported.evidenceVersions, { [id]: [search] });
  assert.deepEqual(exported.turns[1].response.diagnostics.evidenceIds, [
    'menu:birch',
    { id, version: 1 },
  ]);
  assert.deepEqual(exported.turns[2].response.diagnostics.evidenceIds, [id]);
});

test('a later release of the same record is not replaced by the first (client audit C04)', () => {
  const release1 = { id: 'contacts:office', release: 'release-1', fields: { room: 'D-221' } };
  const release2 = { id: 'contacts:office', release: 'release-2', fields: { room: 'D-222' } };
  const { received } = exportEvidence([release1], [release2], [release2]);
  assert.equal(received[0][0].fields.room, 'D-221');
  assert.equal(received[1][0].fields.room, 'D-222');
  assert.equal(received[1][0].release, 'release-2');
  assert.deepEqual(received[2], [release2]);
});

test('a turn sent without older messages says how many were left out', () => {
  const exported = exportTurn({
    localId: 'late',
    question: 'What did you tell me the first shuttle was?',
    request: {
      messages: [
        { role: 'user', content: 'Where is the Registrar?' },
        { role: 'assistant', content: 'D-224.' },
        { role: 'user', content: 'What did you tell me the first shuttle was?' },
      ],
      omittedMessages: 56,
    },
    requestText: '',
    status: 'ok',
    startedAt,
  });
  assert.equal(exported.sentWith, '2 earlier messages (56 older not sent)');
  assert.equal(exported.request.omittedMessages, 56);
});

test('early emergency guidance is the first text the student read', () => {
  const exported = exportTurn({
    localId: 'danger',
    question: "Someone passed out and isn't waking up.",
    request,
    requestText: '',
    status: 'ok',
    httpStatus: 200,
    startedAt,
    latencyMs: 19_000,
    safety: { answer: "If you're in danger right now, call 911.", atMs: 900 },
    draftPreview: { text: 'Call emergency services.', atMs: 12_000 },
    raw: { answer: "If you're in danger right now, call 911." },
  });
  assert.equal(exported.timing.firstAnswerText, 'safety');
  assert.equal(exported.timing.firstAnswerTextMs, 900);
});
