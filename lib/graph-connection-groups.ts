import type { AttachmentNode } from './graph-projection.ts';
import { relationshipLabel } from './knowledge-graph.ts';

export interface ConnectionGroup {
  key: string;
  label: string;
  nodes: AttachmentNode[];
}

/** Group presentation by exact relationship semantics, retaining every edge,
 * target and evidence object in its original node. Labels never establish identity. */
export function groupConnections(nodes: readonly AttachmentNode[]): ConnectionGroup[] {
  const groups = new Map<string, ConnectionGroup>();
  nodes.forEach((node, index) => {
    if (node.kind !== 'relationship') return;
    const relationship = node.relationship;
    const key = relationship
      ? JSON.stringify(['relationship', relationship.predicate, relationship.direction])
      // Even repeated IDs without metadata must not imply equivalent edges.
      : JSON.stringify(['unclassified-relationship', node.id, index]);
    const group = groups.get(key);
    if (group) {
      group.nodes.push(node);
    } else {
      groups.set(key, {
        key,
        label: node.subtitle ?? (relationship ? relationshipLabel(relationship.predicate, relationship.direction === 'incoming') : 'Relationship'),
        nodes: [node],
      });
    }
  });
  return [...groups.values()];
}
