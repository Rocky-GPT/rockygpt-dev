/**
 * @module lib/office-facts
 * The shape of `GET /v1/entities/{id}/facts` as the Offices page reads it, and the counts the page
 * shows beside the Brain's own `complete` flag.
 */

export interface FactValue {
  value: unknown;
  assertion_ids: string[];
  source_ids: string[];
}

export interface FactAssertion {
  id: string;
  source_id: string;
  field: string;
  raw_value: unknown;
  value: unknown;
  caveats: string[];
}

/** The proof behind a property whose status is `not_published`: the pages read and when. */
export interface FactAbsence {
  source_ids: string[];
  checks: Array<{ url: string; section: string; checked_at: string; text_sha256?: string; html_sha256?: string }>;
  checked_at: string;
  current: boolean;
  scope?: string;
  reason?: string;
}

export interface FactProperty {
  key: string;
  label: string;
  category: string;
  status: string;
  values: FactValue[];
  assertions: FactAssertion[];
  /** Present when the office's own pages were read and do not publish this property. */
  absence?: FactAbsence;
  /** The shared reader's explanation of missing or conflicting schedule evidence. */
  issues?: Array<{
    schedule: string;
    season?: string;
    status: string;
    reason: string;
    source_statements: string[];
    days: string[];
    source_ids: string[];
  }>;
}

export interface FactSource {
  id: string;
  collection: string;
  source_key: string;
  source_record_key: string;
  url: string | null;
  citation_urls: string[];
  collected_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  freshness: string;
  validity: string;
  freshness_sla_hours: number | null;
  caveats?: string[];
  season?: string;
}

export interface OfficeFacts {
  entity: { id: string; kind: string; name: string };
  properties: FactProperty[];
  sources: FactSource[];
  evidence_count: number;
  caveats: string[];
  complete: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The body as facts, or null when it is not an object with the lists the page reads. */
export function readFacts(body: unknown): OfficeFacts | null {
  if (!isObject(body) || !isObject(body.entity)) return null;
  if (!Array.isArray(body.properties) || !Array.isArray(body.sources)) return null;
  if (!Array.isArray(body.caveats) || typeof body.complete !== 'boolean') return null;
  if (typeof body.evidence_count !== 'number') return null;
  const propertiesOk = body.properties.every(
    (p) => isObject(p) && Array.isArray(p.values) && Array.isArray(p.assertions)
  );
  const sourcesOk = body.sources.every((s) => isObject(s) && Array.isArray(s.citation_urls));
  if (!propertiesOk || !sourcesOk) return null;
  return body as unknown as OfficeFacts;
}

export interface FactCounts {
  total: number;
  known: number;
  /** Properties the office's own pages were read for and do not publish: answered, with no value. */
  notPublished: number;
  /** Properties with several values: status `multiple` or `conflicting`. */
  several: number;
  sources: number;
  stale: number;
  /** Sources whose freshness the Brain could not work out. */
  freshnessUnknown: number;
}

export function countFacts(facts: OfficeFacts): FactCounts {
  const status = (name: string) => facts.properties.filter((p) => p.status === name).length;
  const freshness = (name: string) => facts.sources.filter((s) => s.freshness === name).length;
  return {
    total: facts.properties.length,
    known: status('known'),
    notPublished: status('not_published'),
    several: status('multiple') + status('conflicting'),
    sources: facts.sources.length,
    stale: freshness('stale'),
    freshnessUnknown: facts.sources.filter((s) => s.freshness !== 'fresh' && s.freshness !== 'stale')
      .length,
  };
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The supplied scope and reason for an absence; no conclusion is made from an empty value. */
export function absenceText(value: unknown): string {
  if (!isObject(value)) return '';
  return [typeof value.scope === 'string' ? `Scope: ${value.scope.replaceAll('_', ' ')}` : '',
    typeof value.reason === 'string' ? value.reason : '',
    value.current === false ? 'Review is not current' : ''].filter(Boolean).join('. ');
}

/** Explicit date omissions and weekday review scope retained by the shared reader. */
export function scheduleAbsenceLines(value: unknown): string[] {
  if (!isObject(value)) return [];
  const lines: string[] = [];
  if (isObject(value.validity_absence)) {
    for (const [bound, proof] of Object.entries(value.validity_absence)) {
      if (!['valid_from', 'valid_until'].includes(bound) || !isObject(proof) || proof.status !== 'not_published') continue;
      lines.push(`${bound === 'valid_from' ? 'Start' : 'End'} date: Not published${absenceText(proof) ? `. ${absenceText(proof)}` : ''}`);
    }
  }
  for (const day of Array.isArray(value.days) ? value.days : []) {
    if (isObject(day) && day.status === 'not_published') {
      const text = absenceText(day.absence);
      if (text && !lines.includes(text)) lines.push(text);
    }
  }
  return lines;
}

/** The weekdays of an hours value as published. Next weekdays with the same hours share a span; a day with no record is never inside one. */
export function formatHours(value: unknown): string | null {
  if (!isObject(value) || !Array.isArray(value.days)) return null;
  const runs: Array<{ first: string; last: string; hours: string; count: number; index: number }> = [];
  for (const entry of value.days) {
    if (!isObject(entry) || typeof entry.day !== 'string' ||
      (typeof entry.hours !== 'string' && entry.hours !== null)) return null;
    const hours = entry.hours ?? (entry.status === 'not_published' ? 'Not published' : 'Hours unavailable');
    const index = WEEKDAYS.indexOf(entry.day);
    const run = runs[runs.length - 1];
    if (run && run.hours === hours && index >= 0 && run.index >= 0 && index === run.index + 1) {
      run.last = entry.day;
      run.index = index;
      run.count += 1;
    } else {
      runs.push({ first: entry.day, last: entry.day, hours, count: 1, index });
    }
  }
  const span = (run: (typeof runs)[number]) =>
    run.count === 1 ? run.first : run.count === 2 ? `${run.first} and ${run.last}` : `${run.first} to ${run.last}`;
  const name = typeof value.schedule === 'string' && value.schedule ? `${value.schedule}. ` : '';
  const season = typeof value.season === 'string' && value.season ? `Season: ${value.season}. ` : '';
  const notes = Array.isArray(value.notes) ? value.notes.filter((n): n is string => typeof n === 'string') : [];
  return `${name}${season}${runs.map((run) => `${span(run)}: ${run.hours}`).join('; ')}${
    notes.length ? `. Published note: ${notes.join(' ')}` : ''
  }${scheduleAbsenceLines(value).map((line) => `. ${line}`).join('')}`;
}
