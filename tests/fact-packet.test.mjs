import assert from 'node:assert/strict';
import test from 'node:test';
import { factPacketOf, packetReasons, packetSummary, valueLines } from '../lib/fact-packet.ts';
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

test('a preview reads phones as numbers and hours by day, and keeps any other object whole', () => {
  const fact = (value, id = 'f1', predicate = 'phones') => ({ ...packet().facts[0], id, predicate, value });
  assert.equal(
    packetSummary(packet({ facts: [fact([{ number: '+12016846666' }, { number: '+12016840000' }])] })),
    'Registrar: phones +12016846666, +12016840000'
  );
  const hours = { schedule: 'Registrar', days: [{ day: 'Monday', hours: '8:30am-4:30pm' }, { day: 'Sunday', hours: 'Hours unavailable' }] };
  assert.equal(
    packetSummary(packet({ facts: [fact(hours, 'f2', 'hours')] })),
    'Registrar: hours Registrar, Monday 8:30am-4:30pm, Sunday Hours unavailable'
  );
  assert.equal(
    packetSummary(packet({ facts: [fact({ number: '+1201', extension: '12' })] })),
    'Registrar: phones {"number":"+1201","extension":"12"}'
  );
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

test('values read as lines: strings as sent, phone objects as numbers, hours by day, anything else whole', () => {
  assert.deepEqual(valueLines('D-224'), ['D-224']);
  assert.deepEqual(valueLines([{ number: '+12016847695' }, { number: '+12016840000' }]), ['+12016847695', '+12016840000']);
  assert.deepEqual(valueLines(['D-224', 'D-225']), ['D-224', 'D-225']);
  assert.deepEqual(
    valueLines({ schedule: 'Registrar', days: [{ day: 'Monday', hours: '8:30am-4:30pm' }, { day: 'Sunday', hours: 'Hours unavailable' }], notes: 'Fall hours' }),
    ['Registrar', 'Monday  8:30am-4:30pm', 'Sunday  Hours unavailable', 'notes: Fall hours']
  );
  // An object with more than a number keeps every key.
  assert.deepEqual(valueLines({ number: '+1201', extension: '12' }), ['{"number":"+1201","extension":"12"}']);
  assert.deepEqual(valueLines(7), ['7']);
});

test('the reasons for a status are only what the packet holds, and a clean packet has none', () => {
  assert.deepEqual(packetReasons(packet()), []);
  const reasons = packetReasons(
    packet({
      facts: [
        { ...packet().facts[0], current: false },
        { ...packet().facts[0], id: 'f2', predicate: 'phones', status: 'conflicting' },
        { ...packet().facts[0], id: 'f3', predicate: 'offices', status: 'multiple' },
        { ...packet().facts[0], id: 'f4', predicate: 'phones', purpose: 'emergency_contact', current: false },
      ],
      missing: [{ subject: registrar, predicate: 'hours', reason: 'not_published' }],
      ambiguities: [{ query: 'student', truncated: false, candidates: [] }],
      unresolved: [{ query: 'Cafeteria', reason: 'no_matching_office' }],
      notices: [
        { type: 'incomplete', code: 'provider_unavailable' },
        { type: 'unsupported', afterLookup: false },
        { type: 'greeting' },
      ],
    })
  );
  assert.deepEqual(reasons, [
    'Registrar email is not current',
    'Registrar phones has conflicting values',
    'Registrar offices has more than one value',
    'Registrar hours is not published',
    '"student" matches more than one office',
    'no office matched "Cafeteria"',
    'the turn was cut short (provider unavailable)',
    "part of the question can't be answered (unsupported)",
  ]);
});
