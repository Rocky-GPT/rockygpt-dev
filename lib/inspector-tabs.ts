/**
 * @module lib/inspector-tabs
 * The tabs of a turn's inspector. The Pipeline tab holds how the turn ran: each stage, who did it,
 * what it produced, the lookups and where the time went. Each fact is shown in one place: the Answer tab holds what the
 * Brain returned (its written answer, or the Fact Packet as JSON when it writes none), the Fact
 * Packet tab explains that packet step by step and lists its sources, so Sources is left out for a
 * packet; the request is the first half of the Raw tab.
 */

export type InspectorTab = 'answer' | 'pipeline' | 'sources' | 'packet' | 'raw';

export const INSPECTOR_TABS: InspectorTab[] = ['answer', 'pipeline', 'sources', 'packet', 'raw'];

export interface InspectorTabInfo {
  id: InspectorTab;
  label: string;
  /** A small number beside the label, when the tab lists things. */
  count?: number;
}

/** The tabs this turn has, in reading order. */
export function inspectorTabs(turn: {
  live: boolean;
  /** The Brain sent a Fact Packet. */
  packet: boolean;
  sources: number;
}): InspectorTabInfo[] {
  const tabs: InspectorTabInfo[] = [
    { id: 'answer', label: 'Answer' },
    { id: 'pipeline', label: 'Pipeline' },
  ];
  // The packet lists its own sources.
  if (!turn.packet) tabs.push({ id: 'sources', label: 'Sources', ...(turn.live ? {} : { count: turn.sources }) });
  if (turn.packet) tabs.push({ id: 'packet', label: 'Fact Packet' });
  tabs.push({ id: 'raw', label: 'Raw' });
  return tabs;
}

/** The tab to show: the chosen one when this turn has it, otherwise the turn's first tab. */
export function shownTab(tabs: InspectorTabInfo[], chosen: InspectorTab): InspectorTab {
  return tabs.some((tab) => tab.id === chosen) ? chosen : tabs[0].id;
}

/**
 * A tab saved by an earlier page load. Trace became the Fact Packet tab, Request joined Raw, and
 * Lookups and Timing joined Pipeline.
 */
export function restoredTab(saved: unknown): InspectorTab | undefined {
  if (saved === 'trace') return 'packet';
  if (saved === 'request') return 'raw';
  if (saved === 'lookups' || saved === 'timing') return 'pipeline';
  return INSPECTOR_TABS.find((tab) => tab === saved);
}

/** The tab one step left (-1) or right (1) of the current one, wrapping round at the ends. */
export function neighborTab(tabs: InspectorTabInfo[], current: InspectorTab, step: 1 | -1): InspectorTab {
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === current));
  return tabs[(index + step + tabs.length) % tabs.length].id;
}
