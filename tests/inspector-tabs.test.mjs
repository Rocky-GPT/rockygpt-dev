import assert from 'node:assert/strict';
import test from 'node:test';
import { INSPECTOR_TABS, inspectorTabs, neighborTab, restoredTab, shownTab } from '../lib/inspector-tabs.ts';

const packetTurn = { live: false, packet: true, sources: 2, lookups: 1 };
const textTurn = { live: false, packet: false, sources: 2, lookups: 1 };
const ids = (turn) => inspectorTabs(turn).map((tab) => tab.id);

test('a packet turn has Answer (the JSON), Pipeline, Fact Packet, Lookups, Timing and Raw: the packet holds its sources', () => {
  assert.deepEqual(ids(packetTurn), ['answer', 'pipeline', 'packet', 'lookups', 'timing', 'raw']);
});

test('a written answer keeps its Sources tab', () => {
  assert.deepEqual(ids(textTurn), ['answer', 'pipeline', 'sources', 'lookups', 'timing', 'raw']);
});

test('a turn in flight shows no counts it does not have yet', () => {
  const tabs = inspectorTabs({ live: true, packet: false, sources: 0, lookups: 0 });
  assert.equal(tabs[0].id, 'answer');
  assert.equal(tabs.find((tab) => tab.id === 'sources')?.count, undefined);
  assert.equal(tabs.find((tab) => tab.id === 'lookups')?.count, undefined);
  assert.equal(inspectorTabs(textTurn).find((tab) => tab.id === 'lookups')?.count, 1);
  assert.equal(inspectorTabs(textTurn).find((tab) => tab.id === 'sources')?.count, 2);
});

test('the chosen tab stays when this turn has it, otherwise the first tab shows', () => {
  assert.equal(shownTab(inspectorTabs(packetTurn), 'timing'), 'timing');
  assert.equal(shownTab(inspectorTabs(packetTurn), 'sources'), 'answer');
  assert.equal(shownTab(inspectorTabs(textTurn), 'packet'), 'answer');
});

test('a saved tab is restored; Trace became the Fact Packet tab and Request joined Raw', () => {
  assert.equal(restoredTab('raw'), 'raw');
  assert.equal(restoredTab('trace'), 'packet');
  assert.equal(restoredTab('request'), 'raw');
  assert.equal(restoredTab('nonsense'), undefined);
  assert.equal(restoredTab(undefined), undefined);
  assert.equal(INSPECTOR_TABS.length, 7);
});

test('the arrow keys step to the next tab and wrap round at the ends', () => {
  const tabs = inspectorTabs(textTurn); // answer, pipeline, sources, lookups, timing, raw
  assert.equal(neighborTab(tabs, 'answer', 1), 'pipeline');
  assert.equal(neighborTab(tabs, 'pipeline', 1), 'sources');
  assert.equal(neighborTab(tabs, 'timing', -1), 'lookups');
  assert.equal(neighborTab(tabs, 'raw', 1), 'answer');
  assert.equal(neighborTab(tabs, 'answer', -1), 'raw');
  // A tab this turn does not have counts as the first one.
  assert.equal(neighborTab(tabs, 'packet', 1), 'pipeline');
});
