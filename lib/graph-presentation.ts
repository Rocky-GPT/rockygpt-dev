import { valueText, type AttachmentNode, type SourceRecord } from './graph-projection.ts';
import { PHOTO_ORIGINS } from './security-headers.ts';

const FACULTY_DERIVATION_NOTE = 'Derived from the linked faculty profile; these records are not independent corroboration.';

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
    !source || source.limitations.some(text => text !== FACULTY_DERIVATION_NOTE || !source.derived_from_source_id) || source.freshness === 'stale');
}

/** Record-wide caveats remain above both primary and collapsed field sections. */
export function sourceCaveats(node: AttachmentNode): string[] {
  return [...new Set(node.children.flatMap(child => child.values?.flatMap(value => value.source?.limitations ?? []) ?? []))];
}

/** Format the backend's phone representation without parsing or changing it.
 * Extension-only and unparsed numbers remain exactly the supplied strings. */
export function canonicalPhonePreview(node: AttachmentNode, value: unknown): string | undefined {
  if (node.propertyKey !== 'phones' || !Array.isArray(value) || !value.length) return;
  const lines: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.entries(entry).some(([key, part]) => !['number', 'extension', 'type'].includes(key) || (part !== null && typeof part !== 'string'))) return;
    const { number, extension, type } = entry as { number?: string | null; extension?: string | null; type?: string | null };
    if (!number && !extension) return;
    lines.push([number, extension ? `ext. ${extension}` : undefined, type ? `(${type})` : undefined].filter(Boolean).join(' '));
  }
  return lines.join('\n');
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

/** Where each fact goes on an entity or record overview. Presentation only:
 * the original nodes are returned, so assertions, sources and caveats stay intact. */
export interface OverviewFields {
  /** Role facts under the heading: title, and school (or department without one). */
  headline: AttachmentNode[];
  /** Contact facts and links, shown as one strip under the heading. */
  contact: AttachmentNode[];
  /** Every other published fact: general details first, then academic ones. */
  main: AttachmentNode[];
  /** Folded away with the reason: no published value, record metadata, or a repeat. */
  hidden: { field: AttachmentNode; reason: string }[];
  /** The published photo, when it comes from a site the page may load images from. */
  photo?: string;
}

/** A single published image URL on an allowed photo site, or nothing. */
export function photoUrl(field: AttachmentNode): string | undefined {
  const value = single(field);
  if (field.propertyKey !== 'image_url' || field.status !== 'known' || typeof value !== 'string') return;
  try {
    return PHOTO_ORIGINS.includes(new URL(value).origin) ? value : undefined;
  } catch {
    return undefined;
  }
}

const single = (field: AttachmentNode | undefined): unknown =>
  field?.factValues?.length === 1 ? field.factValues[0].value : undefined;

/** A fact with no published value asserts nothing, so it folds away with its
 * caveats; values that disagree across sources or periods always stay visible. */
export function overviewFields(node: AttachmentNode): OverviewFields {
  const fields = node.children.filter(child => child.kind === 'property' || child.kind === 'value');
  const result: OverviewFields = { headline: [], contact: [], main: [], hidden: [] };
  const school = fields.find(field => field.propertyKey === 'school' && field.status !== 'unknown');
  for (const field of fields) {
    const disputed = field.status === 'conflicting' || field.status === 'multiple';
    const values = field.factValues ?? [];
    if (!disputed && (field.status === 'unknown' || values.every(value => isEmptyValue(value.value)))) {
      result.hidden.push({ field, reason: 'Not published' });
    } else if (!disputed && single(field) === node.label) {
      result.hidden.push({ field, reason: 'Shown as the heading' });
    } else if (node.kind === 'entity' && !result.photo && photoUrl(field)) {
      result.photo = photoUrl(field);
      result.hidden.push({ field, reason: 'Shown as the photo' });
    } else if (!disputed && field.propertyKey === 'type' && field.category === 'details') {
      result.hidden.push({ field, reason: 'Record metadata' });
    } else if (!disputed && field.propertyKey === 'department' && school && single(field) === single(school)) {
      result.hidden.push({ field, reason: 'Same as school' });
    } else if (node.kind === 'entity' && (field.propertyKey === 'title' || field.propertyKey === 'school'
      || (field.propertyKey === 'department' && !school))) {
      result.headline.push(field);
    } else if (field.category === 'contact' || field.category === 'links') {
      result.contact.push(field);
    } else {
      result.main.push(field);
    }
  }
  const rank = (field: AttachmentNode) => (field.category === 'academic' ? 1 : 0);
  result.main.sort((a, b) => rank(a) - rank(b));
  return result;
}

const SOURCE_LABELS: Record<string, string> = {
  contacts: 'Directory entry', faculty: 'Faculty profile', programs: 'Catalog program', courses: 'Catalog course',
  clubs: 'Archway group', events: 'Archway event', buildings: 'Campus map', schools: 'Schools page',
  subjects: 'Catalog subjects', campus_hours: 'Campus hours', dining_hours: 'Dining hours', menu: 'Dining menu',
};
export const sourceLabel = (collection: string): string => SOURCE_LABELS[collection] ?? collection.replaceAll('_', ' ');

export interface OverviewSource { source: SourceRecord; label: string; derivedFrom?: string }

/** Each source record behind the overview's facts, once, in first-use order. */
export function overviewSources(node: AttachmentNode): OverviewSource[] {
  const found = new Map<string, SourceRecord>();
  for (const child of node.children) for (const { source } of child.values ?? []) if (source && !found.has(source.id)) found.set(source.id, source);
  return [...found.values()].map(source => {
    const origin = source.derived_from_source_id;
    const derivedFrom = origin ? (found.get(origin) ? sourceLabel(found.get(origin)!.collection) : origin) : undefined;
    return { source, label: sourceLabel(source.collection), ...(derivedFrom ? { derivedFrom } : {}) };
  });
}

export function initials(name: string): string {
  const letters = name.split(/\s+/).map(word => word.replace(/[^\p{L}]/gu, '')).filter(Boolean).map(word => word[0]);
  return (letters.length > 1 ? letters[0] + letters[letters.length - 1] : letters[0] ?? '?').toUpperCase();
}

/** A URL without its scheme and trailing slash, for display next to the full link. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}
