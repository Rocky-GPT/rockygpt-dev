import assert from 'node:assert/strict';
import test from 'node:test';
import { factPacketOf, packetSummary } from '../lib/fact-packet.ts';
import { historyOf } from '../components/ask/types.ts';
import { exportTurn } from '../lib/turn-export.ts';

const registrar = { id: 'registrar', name: 'Registrar', kind: 'office' };

function packet(changes = {}) {
  return {
    version: '1.0',
    request: {
      intent: 'contact',
      entities: [{ ...registrar, query: 'Registrar' }],
      fields: ['email'],
      asOf: '2026-10-06T13:05:00-04:00',
      dataset: { version: 'release-1', identityHash: 'identities-1' },
    },
    status: 'complete',
    facts: [
      {
        id: 'f1',
        subject: registrar,
        predicate: 'email',
        value: 'registrar@ramapo.edu',
        status: 'known',
        current: true,
        source_ids: ['s1'],
      },
    ],
    derived_facts: [],
    missing: [],
    ambiguities: [],
    unresolved: [],
    notices: [],
    sources: [],
    ...changes,
  };
}

test('a response with a Fact Packet is recognised, and one without is not', () => {
  assert.deepEqual(factPacketOf({ answer: '', facts: packet() })?.status, 'complete');
  assert.equal(factPacketOf(undefined), undefined);
  assert.equal(factPacketOf({ answer: 'Text mode.' }), undefined);
  assert.equal(factPacketOf({ facts: 'nope' }), undefined);
  assert.equal(factPacketOf({ facts: { ...packet(), version: 1 } }), undefined);
  assert.equal(factPacketOf({ facts: { ...packet(), notices: undefined } }), undefined);
  assert.equal(factPacketOf({ facts: { ...packet(), request: undefined } }), undefined);
});

test('a summary repeats the facts by office and flags what is not current or conflicts', () => {
  assert.equal(packetSummary(packet()), 'Registrar: email registrar@ramapo.edu');
  const stale = packet({
    facts: [
      { ...packet().facts[0], current: false },
      { ...packet().facts[0], id: 'f2', predicate: 'phones', value: ['+12015550100'], status: 'conflicting' },
    ],
  });
  assert.equal(
    packetSummary(stale),
    'Registrar: email registrar@ramapo.edu (not current); phones +12015550100 (conflicting)'
  );
});

test('missing facts, ambiguous names and unmatched names are said, in that order after the facts', () => {
  const summary = packetSummary(
    packet({
      missing: [{ subject: registrar, predicate: 'hours', reason: 'not_published' }],
      ambiguities: [
        {
          query: 'student',
          truncated: false,
          candidates: [
            { id: 'a', name: 'Student Accounts', match: 'exact' },
            { id: 'b', name: 'Student Conduct', match: 'exact' },
          ],
        },
      ],
      unresolved: [{ query: 'Cafeteria', reason: 'no_matching_office' }],
    })
  );
  assert.equal(
    summary,
    'Registrar: email registrar@ramapo.edu · Not published: Registrar hours · "student" could be ' +
      'Student Accounts or Student Conduct · No office matched "Cafeteria"'
  );
});

test('an emergency leads with its approved wording and then lists the campus numbers', () => {
  const summary = packetSummary(
    packet({
      status: 'emergency',
      facts: [
        {
          id: 'f1',
          subject: { id: 'ps', name: 'Public Safety (Emergency)', kind: 'office' },
          predicate: 'phones',
          value: '+12015550911',
          status: 'known',
          current: true,
          source_ids: ['s1'],
          purpose: 'emergency_contact',
        },
      ],
      notices: [{ type: 'safety', situation: 'medical', contacts: ['ps'], approved_text: 'Call 911 right now.' }],
    })
  );
  assert.equal(summary, 'Call 911 right now. · Campus numbers: Public Safety (Emergency) +12015550911');
});

test('notices that carry wording, a quote or a clock are summarised, and an empty packet shows its status', () => {
  assert.equal(
    packetSummary(packet({ status: 'no_facts_needed', facts: [], notices: [{ type: 'greeting', approved_text: 'Hi!' }] })),
    'Hi!'
  );
  assert.equal(
    packetSummary(
      packet({ facts: [], notices: [{ type: 'recall', text: 'hello there' }, { type: 'clock', campusNow: '2026-10-06T13:05:00-04:00' }] })
    ),
    'hello there · 2026-10-06T13:05:00-04:00'
  );
  assert.equal(packetSummary(packet({ status: 'not_found', facts: [] })), 'not_found');
});

test('a value that is an object is shown whole on one line, as the reader returned it', () => {
  const phones = packet({
    facts: [{ ...packet().facts[0], predicate: 'phones', value: { number: '+12016846666' } }],
  });
  assert.equal(packetSummary(phones), 'Registrar: phones {"number":"+12016846666"}');
});

test('a summary adds no word the packet does not hold', () => {
  const held = JSON.stringify(packet());
  for (const word of packetSummary(packet()).split(/[\s:;]+/)) assert.ok(held.includes(word), word);
});

test('a turn with a packet and no written answer keeps its question and facts in the history', () => {
  const turn = { localId: 'a', question: 'Registrar email?', status: 'ok', httpStatus: 200, raw: { answer: '', status: 'answered', facts: packet() } };
  assert.deepEqual(historyOf(turn), [
    { role: 'user', content: 'Registrar email?' },
    { role: 'assistant', content: 'Registrar: email registrar@ramapo.edu' },
  ]);
  const written = { ...turn, raw: { answer: 'It is registrar@ramapo.edu.', status: 'answered' } };
  assert.equal(historyOf(written)[1].content, 'It is registrar@ramapo.edu.');
  assert.deepEqual(historyOf({ ...turn, raw: { answer: '', status: 'answered' } }), []);
});

test('an export names a packet as the first thing the student could read', () => {
  const request = { messages: [{ role: 'user', content: 'Registrar email?' }] };
  const exported = exportTurn({
    localId: 'p',
    question: 'Registrar email?',
    request,
    requestText: JSON.stringify(request),
    status: 'ok',
    httpStatus: 200,
    startedAt: Date.parse('2026-10-06T17:00:00.000Z'),
    finishedAt: Date.parse('2026-10-06T17:00:03.000Z'),
    latencyMs: 3_000,
    raw: { answer: '', status: 'answered', facts: packet() },
  });
  assert.equal(exported.timing.firstAnswerText, 'fact_packet');
  assert.equal(exported.timing.firstAnswerTextMs, 3_000);
});
