import { valueText, type AttachmentNode } from './graph-projection.ts';

/** Empty values may be summarized, but false/zero and structured records are
 * still facts. An array containing null is not the same as an empty array. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

function needsAttention(node: AttachmentNode): boolean {
  const values = node.values ?? [];
  // Keep even agreeing assertions visible: they may have different evidence.
  return values.length > 1 || values.some(({ assertion, source }) =>
    assertion.publication_status === 'not_published' || assertion.limitations.length > 0 ||
    !source || source.limitations.length > 0 || source.freshness === 'stale');
}

function isContactRecordType(node: AttachmentNode): boolean {
  return node.kind === 'property' && node.label.toLowerCase() === 'type' && !!node.values?.length &&
    node.values.every(({ assertion, source }) => source?.collection === 'contacts' &&
      assertion.field_path.length === 1 && assertion.field_path[0] === 'type');
}

export function fieldLabel(node: AttachmentNode): string {
  if (isContactRecordType(node)) return 'Source record type';
  const label = node.label.replaceAll('_', ' ');
  return label ? label[0].toUpperCase() + label.slice(1) : label;
}

/** Partition presentation only. Return the original nodes so assertion IDs,
 * distinct sources, caveats and navigation paths cannot be lost in a summary. */
export function partitionFields(node: AttachmentNode): {
  details: AttachmentNode[]; empty: AttachmentNode[]; sourceFields: AttachmentNode[];
} {
  const result = { details: [] as AttachmentNode[], empty: [] as AttachmentNode[], sourceFields: [] as AttachmentNode[] };
  for (const child of node.children) {
    if (child.kind !== 'property' && child.kind !== 'value') continue;
    if (needsAttention(child)) {
      result.details.push(child);
    } else if (!child.children.length && (child.values ?? []).every(value => isEmptyValue(value.value))) {
      result.empty.push(child);
    } else if ((node.kind === 'entity' || node.kind === 'record') &&
      (isContactRecordType(child) || (child.kind === 'property' && child.label.toLowerCase() === 'name' &&
        child.values?.length === 1 && child.values[0].value === node.label))) {
      result.sourceFields.push(child);
    } else {
      result.details.push(child);
    }
  }
  return result;
}

/** Explain the units without treating repeated record labels as duplicates. */
export function collectionDescription(node: AttachmentNode): string {
  if (node.kind === 'group' && node.label === 'Menu offerings') {
    return 'Entries across dates, meals and stations; dishes may repeat.';
  }
  if (node.kind === 'group' && node.label === 'Dining hours') {
    return 'Schedule records across meals, weekdays and validity periods. Open a record to check applicability.';
  }
  return 'Open to explore individual records and their sources.';
}

export function nodeSummary(node: AttachmentNode): string {
  // The projection supplies the denominator; a finished cursor can still have
  // unavailable records, so loaded children alone never establish completeness.
  if (node.kind === 'group') return `${node.subtitle || `${node.children.length.toLocaleString()} loaded ${node.children.length === 1 ? 'record' : 'records'}`}${node.pending ? ' · Loading more records…' : ''}`;
  if (node.subtitle) return node.subtitle;
  if (node.values?.length) return node.values.map(value => valueText(value.value)).join(' / ');
  if (node.pending) return 'Loading records…';
  return node.children.length ? `${node.children.length.toLocaleString()} details` : 'No published details';
}
