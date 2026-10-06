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

test("an answered turn says when it ran and keeps the Brain's trace and metrics as sent", () => {
  const trace = [
    {
      tool: 'office_facts',
      arguments: { query: 'Registrar', fields: ['offices'] },
      status: 'ok',
      result_count: 1,
      office: 'Registrar',
    },
  ];
  const metrics = { decidedBy: 'model', modelCalls: 2, finish: [], officesListed: 34 };
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
    raw: {
      answer: 'The Registrar is in D-224.',
      datasetVersion: 'dev-offices-20261001-v2',
      trace,
      metrics,
    },
  });
  assert.equal(exported.sentAt, '2026-09-28T21:40:00.000Z');
  assert.equal(exported.finishedAt, '2026-09-28T21:40:06.400Z');
  assert.deepEqual(exported.timing, {
    firstAnswerTextMs: 6_400,
    firstAnswerText: 'answer',
    totalMs: 6_400,
  });
  assert.deepEqual(exported.brain, { datasetVersion: 'dev-offices-20261001-v2' });
  assert.deepEqual(exported.response.trace, trace);
  assert.deepEqual(exported.response.metrics, metrics);
  // Nothing from the retired pipeline is invented for a Brain that does not send it.
  for (const key of ['steps', 'timeline', 'decisions', 'draftPreview', 'safety']) {
    assert.equal(key in exported, false, key);
  }
});

test("a refusal's emergency help is its first text", () => {
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
    },
  });
  assert.equal(exported.timing.firstAnswerText, 'emergency_help');
  assert.equal(exported.timing.firstAnswerTextMs, 900);
  assert.equal(exported.brain.datasetVersion, null);
});

test('the conversation lists each message once, however many turns carry it', () => {
  const asked = (localId, question, history) => {
    const messages = [...history, { role: 'user', content: question }];
    return {
      localId,
      question,
      request: { messages },
      requestText: JSON.stringify({ messages }),
      status: 'ok',
      httpStatus: 200,
      startedAt,
      raw: { answer: `Answer to ${question}` },
    };
  };
  const first = asked('a', 'Where is the Registrar?', []);
  const second = asked('b', 'And their email?', [
    { role: 'user', content: 'Where is the Registrar?' },
    { role: 'assistant', content: 'Answer to Where is the Registrar?' },
  ]);
  const exported = JSON.parse(exportConversation([first, second], new Date(startedAt)));
  assert.deepEqual(
    exported.messages.map((message) => message.content),
    ['Where is the Registrar?', 'Answer to Where is the Registrar?', 'And their email?']
  );
  assert.deepEqual(exported.turns[0].request.messages, [0]);
  assert.deepEqual(exported.turns[1].request.messages, [0, 1, 2]);
});

test('a not-ready turn exports as not built, not failed', () => {
  const exported = exportTurn({
    localId: 'n',
    question: 'Hi',
    request,
    requestText: '',
    status: 'failed',
    httpStatus: 503,
    startedAt,
    raw: { reason: 'not_ready', upstreamResponse: { reason: 'not_ready' } },
  });
  assert.equal(exported.status, 'not_built');
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

test('one earlier question with no answer reads "1 earlier message"', () => {
  const exported = exportTurn({
    localId: 'follow-up',
    question: 'What about tomorrow?',
    request: {
      messages: [
        { role: 'user', content: "What's the next shuttle?" },
        { role: 'user', content: 'What about tomorrow?' },
      ],
    },
    requestText: '',
    status: 'ok',
    startedAt,
  });
  assert.equal(exported.sentWith, '1 earlier message');
});
