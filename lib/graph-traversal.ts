import type { GraphFilters, GraphScope, JsonPath } from './campus-graph';
import type { IdentityKind } from './identities';

export type RecordFrame = { label: string; offset: number } & (
  | { kind: 'collections' }
  | { kind: 'browse'; collection: string; filters: GraphFilters; entityId?: string }
  | { kind: 'record'; collection: string; recordId?: string; reference?: GraphScope['reference']; entityId?: string }
  | { kind: 'value'; value: unknown; path: JsonPath; provenance?: Record<string, unknown> }
  | { kind: 'remote'; collection: string; recordId: string; path: JsonPath }
);
export type CampusFrame =
  | { kind: 'campus'; label: string }
  | { kind: 'category'; label: string; category: IdentityKind; query: string; page: number }
  | { kind: 'identity'; label: string; entityId: string };
export type GraphFrame = CampusFrame | RecordFrame;
export const campusFrame: CampusFrame = { kind: 'campus', label: 'Ramapo College' };

export function isRecordFrame(frame: GraphFrame): frame is RecordFrame {
  return frame.kind !== 'campus' && frame.kind !== 'category' && frame.kind !== 'identity';
}

export function initialRecordFrame(scope: GraphScope): RecordFrame {
  if (scope.collection === 'artifacts' && scope.recordId) return { kind: 'remote', collection: 'artifacts', recordId: scope.recordId, path: [], label: scope.label ?? scope.recordId, offset: 0 };
  if (scope.collection && scope.reference) return { kind: 'record', collection: scope.collection, reference: scope.reference, label: scope.label ?? scope.reference.source_record_key, offset: 0 };
  if (scope.collection) return { kind: 'browse', collection: scope.collection, entityId: scope.entityId, filters: {}, label: scope.label ?? scope.collection, offset: 0 };
  return { kind: 'collections', label: 'All source data', offset: 0 };
}

/** Ancestors retain their exact filters, page and source scope when returning. */
export function visitAncestor(path: GraphFrame[], index: number): GraphFrame[] {
  return path.slice(0, Math.max(1, Math.min(index + 1, path.length)));
}

export function appendFrame(path: GraphFrame[], frame: GraphFrame): GraphFrame[] {
  // Focusing an identity already in this traversal returns to it rather than creating a cycle.
  const existing = frame.kind === 'identity'
    ? path.findIndex(item => item.kind === 'identity' && item.entityId === frame.entityId) : -1;
  return existing < 0 ? [...path, frame] : visitAncestor(path, existing);
}

export function replaceCurrent(path: GraphFrame[], frame: GraphFrame): GraphFrame[] {
  return [...path.slice(0, -1), frame];
}
