import assert from 'node:assert/strict';
import test from 'node:test';
import { countFacts, formatHours, readFacts } from '../lib/office-facts.ts';

const facts = {
  entity: { id: 'a', kind: 'office', name: 'Admissions' },
  properties: [
    { key: 'phone', status: 'known', values: [], assertions: [] },
    { key: 'email', status: 'unknown', values: [], assertions: [] },
    { key: 'fax', status: 'unknown', values: [], assertions: [] },
    { key: 'hours', status: 'conflicting', values: [], assertions: [] },
    { key: 'offices', status: 'not_published', values: [], assertions: [] },
  ],
  sources: [
    { freshness: 'fresh', citation_urls: [] },
    { freshness: 'stale', citation_urls: [] },
    { freshness: 'unknown', citation_urls: [] },
  ],
  evidence_count: 1,
  caveats: [],
  complete: true,
};

test('counts known, confirmed-not-published and several-valued properties and stale sources from the payload', () => {
  assert.deepEqual(countFacts(facts), {
    total: 5,
    known: 1,
    notPublished: 1,
    several: 1,
    sources: 3,
    stale: 1,
    freshnessUnknown: 1,
  });
});

test('a body that is not facts is not read', () => {
  assert.equal(readFacts(null), null);
  assert.equal(readFacts('text'), null);
  assert.equal(readFacts([]), null);
  assert.equal(readFacts({ ...facts, properties: undefined }), null);
  assert.equal(readFacts({ ...facts, entity: null }), null);
  assert.equal(readFacts(facts), facts);
});

test('hours read as weekday spans with the published note, and anything else falls back', () => {
  const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({ day, hours: '8:30am-4:30pm' }))
    .concat([{ day: 'Saturday', hours: 'Hours unavailable' }, { day: 'Sunday', hours: 'Hours unavailable' }]);
  assert.equal(
    formatHours({ schedule: 'Registrar', days: week, notes: ['Fall/Spring Hours: 8:30 A.M. - 4:30 P.M.'] }),
    'Registrar. Monday to Friday: 8:30am-4:30pm; Saturday and Sunday: Hours unavailable. Published note: Fall/Spring Hours: 8:30 A.M. - 4:30 P.M.',
  );
  assert.equal(formatHours({ days: [{ day: 'Monday', hours: '24 hours' }] }), 'Monday: 24 hours');
  assert.equal(formatHours('8:30'), null);
  assert.equal(formatHours({ days: [{ day: 'Monday' }] }), null);
});

test('a weekday with no record is never inside an hours span', () => {
  const days = [['Monday', '9am-5pm'], ['Tuesday', '9am-5pm'], ['Thursday', '9am-5pm']].map(([day, hours]) => ({ day, hours }));
  assert.equal(formatHours({ days }), 'Monday and Tuesday: 9am-5pm; Thursday: 9am-5pm');
  const gap = [['Monday', 'x'], ['Wednesday', 'x'], ['Friday', 'x']].map(([day, hours]) => ({ day, hours }));
  assert.equal(formatHours({ days: gap }), 'Monday: x; Wednesday: x; Friday: x');
});
