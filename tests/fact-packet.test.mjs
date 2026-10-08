import assert from 'node:assert/strict';
import test from 'node:test';
import {
  derivedText,
  factPacketOf,
  packetReasons,
  packetSummary,
  replacedFactIds,
  valueLines,
  writerInputOf,
} from '../lib/fact-packet.ts';
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
    not_published: [],
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
    'Registrar: email registrar@ramapo.edu · Unknown: Registrar hours · "student" could be ' +
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
  // A gap says what the reader said about it, in its own words.
  assert.deepEqual(reasons, [
    'Registrar email is not current',
    'Registrar phones has conflicting values',
    'Registrar offices has more than one value',
    'Registrar hours: not published',
    '"student" matches more than one office',
    'no office matched "Cafeteria"',
    'the turn was cut short (provider unavailable)',
    "part of the question can't be answered (unsupported)",
  ]);
});

const nursing = { id: 'nursing', name: 'Nursing Programs Office', kind: 'office' };
const absence = (changes = {}) => ({
  subject: nursing,
  predicate: 'email',
  checked_at: '2026-10-05T08:00:00+00:00',
  current: true,
  checks: [{ url: 'https://www.ramapo.edu/nursing/', section: 'Contact Us', checked_at: '2026-10-05T08:00:00+00:00' }],
  source_ids: ['s1'],
  ...changes,
});

test('a confirmed "not published" reads differently from unknown in the preview, and old packets still load', () => {
  const confirmed = packet({ facts: [], not_published: [absence()] });
  assert.equal(packetSummary(confirmed), 'Nursing Programs Office: email not published (checked 2026-10-05)');
  assert.deepEqual(packetReasons(confirmed), []);
  const unknown = packet({ facts: [], missing: [{ subject: nursing, predicate: 'email', reason: 'unknown' }] });
  assert.equal(packetSummary(unknown), 'Unknown: Nursing Programs Office email');
  assert.deepEqual(packetReasons(unknown), ['Nursing Programs Office email: unknown']);
  // Beside facts, the absence joins its office's line.
  assert.equal(
    packetSummary(packet({ facts: [{ ...packet().facts[0], subject: nursing }], not_published: [absence({ predicate: 'hours' })] })),
    'Nursing Programs Office: email registrar@ramapo.edu; hours not published (checked 2026-10-05)'
  );
  // A confirmation that is no longer current is a reason the packet is not complete.
  assert.deepEqual(packetReasons(packet({ facts: [], not_published: [absence({ current: false })] })), [
    'Nursing Programs Office email: the "not published" check is not current',
  ]);
  // Emergency numbers' absences are not the question asked.
  assert.deepEqual(packetReasons(packet({ not_published: [absence({ current: false, purpose: 'emergency_contact' })] })), []);
  // A packet saved before the list existed has none; a malformed list is not a packet.
  const { not_published, ...old } = packet();
  assert.deepEqual(factPacketOf({ facts: old })?.not_published, []);
  assert.equal(not_published.length, 0);
  assert.equal(factPacketOf({ facts: { ...packet(), not_published: 'x' } }), undefined);
  // So is a list whose entries the Trace view could not draw.
  for (const broken of [
    null,
    absence({ checks: 'x' }),
    absence({ checks: [{ section: 'Contact Us' }] }),
    absence({ checked_at: undefined }),
    absence({ subject: null }),
    absence({ current: 'yes' }),
  ]) {
    assert.equal(factPacketOf({ facts: { ...packet(), not_published: [broken] } }), undefined);
  }
  assert.ok(factPacketOf({ facts: { ...packet(), not_published: [absence()] } }));
});

test('the writer input is read from the response when the Brain sends it, and only then', () => {
  assert.deepEqual(writerInputOf({ writerInput: { status: 'complete' } }), { status: 'complete' });
  assert.equal(writerInputOf({}), undefined);
  assert.equal(writerInputOf(undefined), undefined);
  assert.equal(writerInputOf({ writerInput: ['x'] }), undefined);
  assert.equal(writerInputOf({ writerInput: 'x' }), undefined);
});

const saturday = (changes = {}) => ({
  id: 'd1',
  subject: registrar,
  predicate: 'hours_on',
  day: 'Saturday',
  date: '2026-10-10',
  value: { schedule: 'Regular', hours: 'Hours unavailable', notes: ['Regular note'] },
  applies: true,
  current: true,
  from: ['f1'],
  source_ids: ['s1'],
  ...changes,
});

test('a worked-out day reads on one line, and says so when the date is outside the schedule', () => {
  assert.equal(derivedText(saturday()), 'hours on Saturday 2026-10-10: Hours unavailable');
  assert.equal(
    derivedText(saturday({ value: { hours: '8am-5pm' }, current: false })),
    'hours on Saturday 2026-10-10: 8am-5pm (not current)'
  );
  assert.equal(derivedText(saturday({ value: { hours: null } })), 'hours on Saturday 2026-10-10: Hours unavailable');
  assert.equal(
    derivedText(saturday({ applies: false, current: false, value: { hours: null, window: { from: '2026-08-26', until: '2026-12-16' } } })),
    'hours on Saturday 2026-10-10: outside the dates it was published for (2026-08-26 to 2026-12-16)'
  );
});

test('the preview and the reasons use the day that was asked, not the whole week it came from', () => {
  const week = { ...packet().facts[0], id: 'f1', predicate: 'hours', value: { days: [{ day: 'Monday', hours: '9-5' }] } };
  const asked = packet({ facts: [week], derived_facts: [saturday()] });
  assert.deepEqual([...replacedFactIds(asked)], ['f1']);
  assert.equal(packetSummary(asked), 'Registrar: hours on Saturday 2026-10-10: Hours unavailable');
  assert.deepEqual(packetReasons(asked), []);
  const outside = packet({ facts: [week], derived_facts: [saturday({ applies: false, current: false, value: { hours: null } })] });
  assert.deepEqual(packetReasons(outside), [
    'Registrar hours on Saturday 2026-10-10 is outside the dates the schedule was published for',
  ]);
  // A packet with no day asked still shows the whole week.
  assert.match(packetSummary(packet({ facts: [week] })), /Monday/);
});

test('a derived entry the views could not read makes the packet unreadable', () => {
  assert.ok(factPacketOf({ facts: packet({ derived_facts: [saturday()] }) }));
  for (const broken of [null, saturday({ day: undefined }), saturday({ value: 'x' }), saturday({ applies: 'yes' }), saturday({ from: 'f1' })]) {
    assert.equal(factPacketOf({ facts: packet({ derived_facts: [broken] }) }), undefined);
  }
});
