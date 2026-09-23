import assert from 'node:assert/strict';
import test from 'node:test';
import { groupAttachedValues } from '../lib/graph-value-groups.ts';

const attached = (value, sourceId, overrides = {}) => ({
  value,
  assertion: { id: `assertion:${sourceId}`, value, source_id: sourceId, field_path: ['name'],
    publication_status: 'published', limitations: [], ...overrides },
  source: { id: sourceId, collection: 'contacts', row_id: sourceId, source_key: 'campus-directory',
    source_record_key: sourceId, source_url: 'https://example.edu/directory', collected_at: null,
    valid_from: null, valid_until: null, freshness: 'unknown', limitations: [] },
});

test('equal values appear once while all original assertions and source evidence remain available', () => {
  const first = attached('Birch Tree Inn', 'contacts:one');
  const second = attached('Birch Tree Inn', 'contacts:two', { publication_status: 'unspecified', limitations: ['Undated listing.'] });
  second.source.valid_until = '2026-10-01';
  second.source.limitations = ['Current applicability is uncertain.'];
  const groups = groupAttachedValues([first, second]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].value, 'Birch Tree Inn');
  assert.equal(groups[0].sourceCount, 2);
  assert.strictEqual(groups[0].assertions[0], first);
  assert.strictEqual(groups[0].assertions[1], second);
  assert.deepEqual(groups[0].assertions[1].assertion.limitations, ['Undated listing.']);
  assert.equal(groups[0].assertions[1].source.valid_until, '2026-10-01');
  assert.deepEqual(groups[0].assertions[1].source.limitations, ['Current applicability is uncertain.']);
});

test('source counts use unique assertion source IDs, including repeated assertions from one source', () => {
  const first = attached(null, 'contacts:one');
  const repeated = attached(null, 'contacts:one', { id: 'different-assertion', field_path: ['title'], publication_status: 'not_published' });
  const other = attached(null, 'contacts:two');
  other.source = undefined;
  const [group] = groupAttachedValues([first, repeated, other, first]);
  assert.equal(group.sourceCount, 2);
  assert.equal(group.assertions.length, 4);
  assert.strictEqual(group.assertions[1], repeated);
  assert.equal(group.assertions[1].assertion.publication_status, 'not_published');
  assert.strictEqual(group.assertions[2], other);
  assert.strictEqual(group.assertions[3], first);
});

test('null, empty values, primitive types and conflicting strings stay distinct without normalization', () => {
  const values = [null, undefined, '', [], {}, false, 0, '0', true, 'Birch', 'birch', ' Birch ',
    '(201) 684-7592', '201-684-7592'];
  const inputs = values.map((value, index) => attached(value, `source:${index}`));
  const groups = groupAttachedValues(inputs);
  assert.equal(groups.length, values.length);
  groups.forEach((group, index) => {
    assert.strictEqual(group.value, values[index]);
    assert.strictEqual(group.assertions[0], inputs[index]);
    assert.equal(group.sourceCount, 1);
  });
});

test('nested object key order is insignificant but array order, types and exact keys remain significant', () => {
  const value = { phone: [{ number: '201-684-7592', primary: false }], extra: { count: 0, note: null } };
  const reordered = { extra: { note: null, count: 0 }, phone: [{ primary: false, number: '201-684-7592' }] };
  const first = attached(value, 'source:one');
  const equivalent = attached(reordered, 'source:two');
  const differentValues = [{ phone: [{ number: '201-684-7592', primary: 0 }], extra: { count: 0, note: null } },
    { phone: [{ number: '201-684-7592', primary: false }], extra: { count: 0 } },
    ['one', 'two'], ['two', 'one'], [0], ['0'], [null], []];
  const groups = groupAttachedValues([first, equivalent, ...differentValues.map((item, i) => attached(item, `other:${i}`))]);
  assert.equal(groups.length, 1 + differentValues.length);
  assert.strictEqual(groups[0].value, value);
  assert.deepEqual(groups[0].assertions, [first, equivalent]);
  assert.equal(groups[0].sourceCount, 2);
});

test('grouping preserves first-seen order and never mutates inputs or shares output arrays across calls', () => {
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const values = freeze([attached('B', 'source:one'), attached('A', 'source:two'), attached('B', 'source:three')]);
  const groups = groupAttachedValues(values);
  assert.deepEqual(groups.map(group => group.value), ['B', 'A']);
  assert.deepEqual(groups[0].assertions, [values[0], values[2]]);
  assert.notStrictEqual(groups[0].assertions, values);
  assert.notStrictEqual(groupAttachedValues(values)[0].assertions, groups[0].assertions);
  assert.deepEqual(groupAttachedValues([]), []);
});
