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

export interface FactProperty {
  key: string;
  label: string;
  category: string;
  status: string;
  values: FactValue[];
  assertions: FactAssertion[];
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
    several: status('multiple') + status('conflicting'),
    sources: facts.sources.length,
    stale: freshness('stale'),
    freshnessUnknown: facts.sources.filter((s) => s.freshness !== 'fresh' && s.freshness !== 'stale')
      .length,
  };
}

/** The weekdays of an hours value as published, with runs of identical hours as one span. */
export function formatHours(value: unknown): string | null {
  if (!isObject(value) || !Array.isArray(value.days)) return null;
  const runs: Array<{ first: string; last: string; hours: string; count: number }> = [];
  for (const entry of value.days) {
    if (!isObject(entry) || typeof entry.day !== 'string' || typeof entry.hours !== 'string') return null;
    const run = runs[runs.length - 1];
    if (run && run.hours === entry.hours) {
      run.last = entry.day;
      run.count += 1;
    } else {
      runs.push({ first: entry.day, last: entry.day, hours: entry.hours, count: 1 });
    }
  }
  const span = (run: (typeof runs)[number]) =>
    run.count === 1 ? run.first : run.count === 2 ? `${run.first} and ${run.last}` : `${run.first} to ${run.last}`;
  const name = typeof value.schedule === 'string' && value.schedule ? `${value.schedule}. ` : '';
  const notes = Array.isArray(value.notes) ? value.notes.filter((n): n is string => typeof n === 'string') : [];
  return `${name}${runs.map((run) => `${span(run)}: ${run.hours}`).join('; ')}${
    notes.length ? `. Published note: ${notes.join(' ')}` : ''
  }`;
}
