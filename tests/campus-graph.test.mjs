import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRAPH_PAGE_SIZE, childCount, graphUrl, nextGroupField, valueAtPath,
  valueChildren, valueKind, valuePreview,
} from '../lib/campus-graph.ts';

test('graph request roundtrips release, arbitrary source keys, and JSON filters without query injection', () => {
  const reference = {
    source_key: 'source & / ? # + 100%',
    source_record_key: 'Thu:Adler / Lecture + "Q" & meal=Lunch',
    source_record_id: 'row-2',
  };
  const filters = { date: null, meal: 'Late Night & Lite Lunch', station: 'Sauté + Grill', enabled: false, index: 0 };
  const url = new URL(graphUrl('records', 'release a/b?x=1#y', {
    collection: 'menu', entity_id: 'entity & foo=bar', reference,
    filters, offset: 0, limit: GRAPH_PAGE_SIZE, absent: undefined,
  }), 'http://localhost:3100');
  assert.equal(url.pathname, '/api/brain/graph/records');
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.get('dataset_version'), 'release a/b?x=1#y');
  assert.equal(url.searchParams.get('entity_id'), 'entity & foo=bar');
  assert.deepEqual(JSON.parse(url.searchParams.get('reference')), reference);
  assert.deepEqual(JSON.parse(url.searchParams.get('filters')), filters);
  assert.equal(url.searchParams.get('offset'), '0');
  assert.equal(url.searchParams.has('absent'), false);
  assert.equal(url.searchParams.has('foo'), false);
  assert.equal(url.searchParams.has('meal'), false);
});

test('request parameters retain null, false, zero and empty strings', () => {
  const params = new URL(graphUrl('browse', 'v1', {
    missing: null, published: false, count: 0, text: '', path: ['items', 0, 'a/b~c'],
  }), 'http://localhost').searchParams;
  assert.equal(params.get('missing'), 'null');
  assert.equal(params.get('published'), 'false');
  assert.equal(params.get('count'), '0');
  assert.equal(params.get('text'), '');
  assert.deepEqual(JSON.parse(params.get('path')), ['items', 0, 'a/b~c']);
});

test('JSON kinds and visible values distinguish unknown, explicit false, zero and empty containers', () => {
  const samples = [
    [null, 'null', 'null · no value stored'],
    [false, 'boolean', 'false'],
    [0, 'number', '0'],
    ['', 'string', '"" · empty text'],
    [[], 'array', '0 items'],
    [{}, 'object', '0 fields'],
  ];
  for (const [value, kind, preview] of samples) {
    assert.equal(valueKind(value), kind);
    assert.equal(valuePreview(value), preview);
    assert.equal(childCount(value), 0);
    assert.deepEqual(valueChildren(value), []);
  }
});

test('leaf text is not silently truncated or interpreted as HTML', () => {
  const text = '<script>example source text</script>\n' + 'full document '.repeat(2000);
  assert.equal(valuePreview(text), text);
  assert.deepEqual(valueChildren(text), []);
  assert.deepEqual(valueAtPath({ content: text }, ['content']), { found: true, value: text });
});

test('paths distinguish absent properties from stored null and falsy values', () => {
  const record = { nil: null, nope: false, zero: 0, empty: '', list: [], object: {} };
  for (const [key, value] of Object.entries(record)) {
    assert.deepEqual(valueAtPath(record, [key]), { found: true, value });
  }
  assert.deepEqual(valueAtPath(record, ['absent']), { found: false, value: undefined });
  for (const key of ['nil', 'nope', 'zero', 'empty']) {
    assert.deepEqual(valueAtPath(record, [key, 'child']), { found: false, value: undefined });
  }
  assert.deepEqual(valueAtPath(null, []), { found: true, value: null });
});

test('nested arbitrary field names and array positions remain exactly navigable', () => {
  const record = JSON.parse('{"a.b":{"a/b":{"~":{"0":[{"":"value"}]}}},"__proto__":{"stored":"safe"}}');
  assert.deepEqual(valueAtPath(record, ['a.b', 'a/b', '~', '0', 0, '']), { found: true, value: 'value' });
  assert.deepEqual(valueAtPath(record, ['__proto__', 'stored']), { found: true, value: 'safe' });
  assert.deepEqual(valueAtPath(record, ['constructor']), { found: false, value: undefined });
  assert.deepEqual(valueAtPath(record, ['toString']), { found: false, value: undefined });
  assert.deepEqual(valueAtPath({ items: [1, 2] }, ['items', 2]), { found: false, value: undefined });
});

test('deep stored paths can be followed without hiding nested source fields', () => {
  let record = 'deep value';
  const path = [];
  for (let index = 0; index < 80; index += 1) {
    const key = `field/${index}`;
    record = { [key]: record };
    path.unshift(key);
  }
  assert.deepEqual(valueAtPath(record, path), { found: true, value: 'deep value' });
  assert.deepEqual(valueAtPath(record, [...path, 'missing']), { found: false, value: undefined });
});

test('array pagination reaches every record, including repeated identical display names', () => {
  const records = Array.from({ length: GRAPH_PAGE_SIZE * 3 + 1 }, (_, index) => ({
    name: 'Repeated offering', source_record_key: 'duplicate:key', id: `original-row-${index}`,
  }));
  const children = [];
  for (let offset = 0; offset < childCount(records); offset += GRAPH_PAGE_SIZE) {
    const page = valueChildren(records, offset);
    assert.ok(page.length <= GRAPH_PAGE_SIZE);
    children.push(...page);
  }
  assert.equal(children.length, records.length);
  assert.equal(new Set(children.map(child => child.key)).size, records.length);
  assert.equal(new Set(children.map(child => child.label)).size, records.length);
  assert.deepEqual(children.map(child => child.value.id), records.map(record => record.id));
  for (const child of children) assert.equal(valueAtPath(records, [child.key]).value, child.value);
  assert.deepEqual(valueChildren(records, records.length), []);
});

test('object pagination retains every original key and handles empty final pages', () => {
  const record = Object.fromEntries(Array.from({ length: 19 }, (_, index) => [`field/${index}`, index]));
  const children = [0, 8, 16].flatMap(offset => valueChildren(record, offset));
  assert.equal(childCount(record), 19);
  assert.deepEqual(children.map(child => child.key), Object.keys(record));
  assert.deepEqual(children.map(child => child.value), Object.values(record));
  assert.deepEqual(valueChildren(record, 19), []);
  assert.deepEqual(valueChildren(record, 0, 0), []);
});

test('array children without published names remain reachable by position', () => {
  const records = [null, false, 0, '', [], {}, { name: ' ', code: 'CMPS 101' }];
  const children = valueChildren(records);
  assert.deepEqual(children.map(child => child.key), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(children.map(child => child.label), ['[0]', '[1]', '[2]', '[3]', '[4]', '[5]', '[6] CMPS 101']);
  assert.deepEqual(children.map(child => child.value), records);
});

test('next group keeps published order and treats explicit unknown/falsy filters as selected', () => {
  const collection = { group_fields: [{ key: 'date' }, { key: 'meal' }, { key: 'station' }] };
  assert.equal(nextGroupField(collection, {}), 'date');
  assert.equal(nextGroupField(collection, { date: null }), 'meal');
  assert.equal(nextGroupField(collection, { date: null, meal: '' }), 'station');
  assert.equal(nextGroupField(collection, { date: null, meal: false, station: 0 }), undefined);
  assert.equal(nextGroupField(undefined, {}), undefined);
  assert.equal(nextGroupField({ group_fields: [] }, {}), undefined);
  assert.equal(nextGroupField(collection, Object.create({ date: 'inherited' })), 'date');
});
