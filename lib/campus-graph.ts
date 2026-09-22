/** Navigation over published records. These nodes do not create identity relationships. */
export const GRAPH_PAGE_SIZE = 8;
export type GraphFilters = Record<string, unknown>;
export type JsonPath = (string | number)[];
export interface GraphCollection {
  id: string;
  label: string;
  total: number;
  status?: 'available' | 'unavailable';
  diagnostics?: unknown[];
  group_fields: { key: string; label: string }[];
}
export interface GraphSnapshot { dataset_version: string; identity_hash: string }
export interface GraphRecordSummary {
  id: string;
  title: string;
  source_key?: string;
  source_record_key?: string;
  source_record_id?: string;
  [key: string]: unknown;
}
export interface GraphBrowse extends GraphSnapshot {
  mode: 'groups' | 'records';
  total: number;
  returned: number;
  next_offset: number | null;
  groups?: { value: unknown; label: string; count: number }[];
  records?: GraphRecordSummary[];
  diagnostics?: unknown[];
}
export type GraphScope = { recordId?: string; label?: string; collection?: string; entityId?: string; ownerName?: string; reference?: { source_key: string; source_record_key: string; source_record_id?: string } };

export function graphUrl(operation: string, version: string, params: Record<string, unknown> = {}): string {
  const query = new URLSearchParams({ dataset_version: version });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return `/api/brain/graph/${operation}?${query}`;
}

export function valueKind(value: unknown): string {
  return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}

export function valuePreview(value: unknown): string {
  if (value === null) return 'null · no value stored';
  if (Array.isArray(value)) return `${value.length.toLocaleString()} items`;
  if (typeof value === 'object') return `${Object.keys(value as object).length.toLocaleString()} fields`;
  if (value === '') return '"" · empty text';
  return String(value);
}

export function valueAtPath(root: unknown, path: JsonPath): { found: boolean; value: unknown } {
  let value = root;
  for (const key of path) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return { found: false, value: undefined };
    value = (value as Record<string | number, unknown>)[key];
  }
  return { found: true, value };
}

export function valueChildren(value: unknown, offset = 0, limit = GRAPH_PAGE_SIZE): { key: string | number; label: string; value: unknown }[] {
  if (Array.isArray(value)) return value.slice(offset, offset + limit).map((item, index) => {
    const key = offset + index;
    const title = item && typeof item === 'object' && !Array.isArray(item)
      ? ['name', 'title', 'label', 'item', 'code'].map(field => (item as Record<string, unknown>)[field]).find(v => typeof v === 'string' && v.trim()) : undefined;
    return { key, label: title ? `[${key}] ${title}` : `[${key}]`, value: item };
  });
  if (value !== null && typeof value === 'object') return Object.entries(value).slice(offset, offset + limit).map(([key, item]) => ({ key, label: key, value: item }));
  return [];
}

export function childCount(value: unknown): number {
  return value !== null && typeof value === 'object' ? Object.keys(value).length : 0;
}

export function nextGroupField(collection: GraphCollection | undefined, filters: GraphFilters): string | undefined {
  return collection?.group_fields.find(field => !Object.prototype.hasOwnProperty.call(filters, field.key))?.key;
}
