/**
 * @module lib/brain-metrics
 * What a development Brain reports about a turn: its `metrics` and its `trace` of office lookups.
 *
 * A failed turn keeps the Brain's own body under `upstreamResponse`, so both readers look there too.
 */

type Json = Record<string, unknown>;

function record(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;
}

export function brainMetrics(raw: Json | undefined): Json | undefined {
  return record(raw?.metrics) ?? record(record(raw?.upstreamResponse)?.metrics);
}

/** The office lookups a development Brain reports, or undefined when it sent none. */
export function brainTrace(raw: Json | undefined): unknown[] | undefined {
  if (Array.isArray(raw?.trace)) return raw.trace;
  const wrapped = record(raw?.upstreamResponse)?.trace;
  return Array.isArray(wrapped) ? wrapped : undefined;
}
