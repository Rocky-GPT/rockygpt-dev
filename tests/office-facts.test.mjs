import assert from 'node:assert/strict';
import test from 'node:test';
import { countFacts, readFacts } from '../lib/office-facts.ts';

const facts = {
  entity: { id: 'a', kind: 'office', name: 'Admissions' },
  properties: [
    { key: 'phone', status: 'known', values: [], assertions: [] },
    { key: 'email', status: 'unknown', values: [], assertions: [] },
    { key: 'fax', status: 'unknown', values: [], assertions: [] },
    { key: 'hours', status: 'conflicting', values: [], assertions: [] },
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

test('counts known properties, several-valued ones and stale sources from the payload', () => {
  assert.deepEqual(countFacts(facts), {
    total: 4,
    known: 1,
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
