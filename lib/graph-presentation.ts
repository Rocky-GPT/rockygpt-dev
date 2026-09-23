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
  return node.status === 'conflicting' || node.status === 'multiple' || values.some(({ assertion, source }) =>
    assertion.publication_status === 'not_published' || assertion.limitations.length > 0 ||
    !source || source.limitations.length > 0 || source.freshness === 'stale');
}

export function fieldLabel(node: AttachmentNode): string {
  if (node.kind === 'property') return node.label;
  const label = node.label.replaceAll('_', ' ');
  return label ? label[0].toUpperCase() + label.slice(1) : label;
}

export interface DetailCard {
  field: AttachmentNode;
}
export interface DetailSection {
  label: string;
  cards: DetailCard[];
}

/** Layout follows the backend's fact categories; source schemas do not decide
 * field meaning, contact normalization, or which facts belong together. */
export function detailSections(owner: AttachmentNode, fields: AttachmentNode[]): DetailSection[] {
  if (owner.kind === 'property' || owner.kind === 'value') return [{ label: 'Values', cards: fields.map(field => ({ field })) }];
  const sections: DetailSection[] = [];
  const labels = { contact: 'Contact', academic: 'Academic profile', links: 'Links', details: 'Details' };
  for (const field of fields) {
    const label = labels[field.category ?? 'details'];
    let section = sections.find(section => section.label === label);
    if (!section) { section = { label, cards: [] }; sections.push(section); }
    section.cards.push({ field });
  }
  const order = ['Contact', 'Academic profile', 'Details', 'Links'];
  return sections.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
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
    } else if (child.status === 'unknown' && !child.children.length && child.factValues?.length && child.factValues.every(value => isEmptyValue(value.value))) {
      result.empty.push(child);
    } else if ((node.kind === 'entity' || node.kind === 'record') &&
      child.kind === 'property' && child.propertyKey === 'name' &&
      child.factValues?.length === 1 && child.factValues[0].value === node.label) {
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
  if (node.factValues?.length) return node.factValues.map(value => valueText(value.value)).join(' / ');
  if (node.pending) return 'Loading records…';
  return node.children.length ? `${node.children.length.toLocaleString()} details` : 'No published details';
}
