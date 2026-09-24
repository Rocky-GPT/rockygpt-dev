import { valueText, type AttachmentNode, type SourceRecord } from './graph-projection.ts';
import { PHOTO_ORIGINS } from './security-headers.ts';

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
  // Source keys read as words: transFat is "Trans fat" and vitaminA is "Vitamin A".
  const label = node.label.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ').map(word => word.length > 1 ? word.toLowerCase() : word).join(' ');
  return label ? label[0].toUpperCase() + label.slice(1) : label;
}

/** Explain the units without treating repeated record labels as duplicates. */
export function collectionDescription(node: AttachmentNode): string {
  if (node.kind === 'group' && node.label === 'Menu offerings') {
    return 'Entries across dates, meals and stations; dishes may repeat.';
  }
  if (node.kind === 'group' && (node.label === 'Dining hours' || node.label === 'Operating hours')) {
    return 'Schedule records grouped by validity periods, then by weekday. Open a record to check applicability.';
  }
  return '';
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

/** A fact the backend marks unknown asserts nothing, so it folds away with its
 * caveats. A known empty list, false or zero is a published fact and stays, and
 * values that disagree across sources or periods are never folded. */
export function overviewFields(node: AttachmentNode): OverviewFields {
  const fields = node.children.filter(child => child.kind === 'property' || child.kind === 'value');
  const result: OverviewFields = { headline: [], contact: [], main: [], hidden: [] };
  const school = fields.find(field => field.propertyKey === 'school' && field.status !== 'unknown');
  for (const field of fields) {
    const disputed = field.status === 'conflicting' || field.status === 'multiple';
    if (field.status === 'unknown') {
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
  graduation_plans: 'Graduation plan',
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

/** A list of named links, such as a plan's PDF and document copies, or nothing. */
export function namedLinks(value: unknown): { name: string; url: string }[] | undefined {
  if (!Array.isArray(value) || !value.length) return;
  const links = value.filter((item): item is { name: string; url: string } => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    && typeof (item as { name?: unknown }).name === 'string' && typeof (item as { url?: unknown }).url === 'string'
    && Object.keys(item).every(key => key === 'name' || key === 'url'));
  return links.length === value.length ? links : undefined;
}

export function initials(name: string): string {
  const letters = name.split(/\s+/).map(word => word.replace(/[^\p{L}]/gu, '')).filter(Boolean).map(word => word[0]);
  return (letters.length > 1 ? letters[0] + letters[letters.length - 1] : letters[0] ?? '?').toUpperCase();
}

/** A URL without its scheme and trailing slash, for display next to the full link. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}
