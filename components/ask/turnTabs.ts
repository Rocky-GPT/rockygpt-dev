import { factPacketOf } from '@/lib/fact-packet';
import { inspectorTabs, type InspectorTabInfo } from '@/lib/inspector-tabs';
import type { Turn } from './types';

/** The inspector tabs this turn has: shown by the inspector, and stepped through by the arrow keys. */
export function turnTabs(turn: Turn): InspectorTabInfo[] {
  const citations = Array.isArray(turn.raw?.citations) ? turn.raw.citations : [];
  return inspectorTabs({
    live: turn.status === 'pending',
    packet: factPacketOf(turn.raw) !== undefined,
    sources: citations.length,
  });
}
