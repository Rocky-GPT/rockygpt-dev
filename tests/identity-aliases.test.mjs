import assert from 'node:assert/strict';
import test from 'node:test';
import { basisCounts, evidenceText, filterAliasRows, groupSources, parseAliasTable, rowBases } from '../lib/identity-aliases.ts';

const reviewed = { basis: 'human_reviewed', reviewed_at: '2026-09-23', note: 'Approved: campus language uses "Birch".' };
const hours = day => ({ basis: 'record_name', evidence: { collection: 'campus_hours', source_key: 'hours', source_record_key: `Center (CSI):${day}`, field: 'name' } });
function table() {
  return structuredClone({
    dataset_version: 'dev-release', campus_date: '2026-09-23', identity_hash: 'hash', sources_published: true, alias_count: 5,
    aliases: [
      { alias: 'Birch', lookup: 'single', matches: [{ id: 'venue', name: 'Birch Tree Inn', kind: 'venue', by_name: false, aliases: [{ alias: 'Birch', sources: [reviewed] }] }] },
      { alias: 'Center (CSI)', lookup: 'single', matches: [{ id: 'office', name: 'Center', kind: 'office', by_name: false, aliases: [{ alias: 'Center (CSI)', sources: [{ basis: 'identity_map' }, hours('Monday'), hours('Tuesday')] }] }] },
      { alias: 'Public Safety', lookup: 'ambiguous', matches: [
        { id: 'emergency', name: 'Public Safety (Emergency)', kind: 'office', by_name: false, aliases: [{ alias: 'Public Safety', sources: [{ basis: 'department', evidence: { collection: 'contacts', source_key: 'directory', source_record_key: 'office:ps-emergency', field: 'department' } }] }] },
        { id: 'non-emergency', name: 'Public Safety (Non-Emergency)', kind: 'office', status: 'retired', by_name: false, aliases: [{ alias: 'Public Safety', sources: [{ basis: 'department', evidence: { collection: 'contacts', source_key: 'directory', source_record_key: 'office:ps-non-emergency', field: 'department' } }] }] },
      ] },
      { alias: 'Yoga', lookup: 'event_dates', matches: [
        { id: 'yoga-1', name: 'Yoga (2026-09-21)', kind: 'event', by_name: false, aliases: [{ alias: 'Yoga', sources: [{ basis: 'event_title' }] }] },
        { id: 'yoga-2', name: 'Yoga (2026-09-28)', kind: 'event', by_name: false, aliases: [{ alias: 'Yoga', sources: [{ basis: 'event_title' }] }] },
      ] },
    ],
  });
}

test('the alias table is accepted only in the shape the brain publishes', () => {
  assert.equal(parseAliasTable(table()).aliases.length, 4);
  const unpublished = { ...table(), sources_published: false };
  unpublished.aliases[0].matches[0].aliases[0].sources = [];
  assert.equal(parseAliasTable(unpublished).sources_published, false);
  for (const change of [
    value => { value.aliases[0].lookup = 'fuzzy'; },
    value => { value.aliases[0].matches = []; },
    value => { value.aliases[0].matches[0].aliases[0].sources[0].basis = 'name_similarity'; },
    value => { value.aliases[2].matches[0].aliases[0].sources[0].evidence.field = ''; },
    value => { delete value.sources_published; },
  ]) {
    const invalid = table(); change(invalid);
    assert.throws(() => parseAliasTable(invalid), /does not recognize/);
  }
});

test('filters find an alias by its own text or by an entity it finds, and by reason, kind and lookup', () => {
  const rows = table().aliases;
  const names = filter => filterAliasRows(rows, { query: '', basis: 'all', kind: 'all', lookup: 'all', events: true, ...filter }).map(row => row.alias);
  assert.deepEqual(names({ query: 'birch' }), ['Birch']);
  assert.deepEqual(names({ query: '  tree   INN ' }), ['Birch']);
  assert.deepEqual(names({ query: 'non-emergency' }), ['Public Safety']);
  assert.deepEqual(names({ basis: 'human_reviewed' }), ['Birch']);
  assert.deepEqual(names({ basis: 'department' }), ['Public Safety']);
  assert.deepEqual(names({ kind: 'event' }), ['Yoga']);
  assert.deepEqual(names({ lookup: 'ambiguous' }), ['Public Safety']);
  assert.deepEqual(names({ lookup: 'single', kind: 'office' }), ['Center (CSI)']);
  assert.deepEqual([...rowBases(rows[1])].sort(), ['identity_map', 'record_name']);
  // Names only events answer to are left out unless asked for.
  assert.deepEqual(names({ events: false }), ['Birch', 'Center (CSI)', 'Public Safety']);
  assert.deepEqual(names({ events: false, basis: 'event_title' }), ['Yoga']);
  assert.deepEqual(names({ events: false, kind: 'event' }), ['Yoga']);
  assert.deepEqual(names({ events: false, query: 'yoga' }), ['Yoga']);
});

test('each alias counts once under each of its reasons, and repeated record evidence reads as one reason', () => {
  assert.deepEqual(Object.fromEntries(basisCounts(table().aliases)), { human_reviewed: 1, identity_map: 1, record_name: 1, department: 2, event_title: 2 });
  const groups = groupSources(table().aliases[1].matches[0].aliases[0].sources);
  assert.deepEqual(groups.map(group => [group.basis, group.sources.length]), [['identity_map', 1], ['record_name', 2]]);
  assert.equal(evidenceText(groups[1].sources[0].evidence), 'campus_hours · Center (CSI):Monday · name');
});
