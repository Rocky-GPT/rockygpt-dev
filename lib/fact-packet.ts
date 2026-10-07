/**
 * @module lib/fact-packet
 * Reads the Brain's Fact Packet (version 1.0) out of a response body, and gives a one-line
 * plain-text summary of it for places that have room for one line: the turn list, and the
 * history sent with a follow-up.
 *
 * The Brain in JSON mode sends no written answer; the packet is the answer. This file only
 * recognises it and repeats what it holds. It never decides, merges, ranks or adds a fact:
 * every word of a summary comes from a field of the packet.
 */

export interface PacketSubject {
  id: string;
  name: string;
  kind: string;
}

export interface PacketFact {
  id: string;
  subject: PacketSubject;
  predicate: string;
  value: unknown;
  status: string;
  current: boolean;
  source_ids: string[];
  purpose?: string;
}

export interface PacketSource {
  id: string;
  title: string;
  collection: string;
  urls: string[];
  captured_at: string | null;
  freshness: string;
  validity: string;
  current: boolean;
  limitations: string[];
}

/** A field the office's own pages were read for and do not publish: an answer, with its proof. */
export interface PacketNotPublished {
  subject: PacketSubject;
  predicate: string;
  checked_at: string;
  current: boolean;
  checks: Array<{ url: string; section: string; checked_at: string }>;
  source_ids: string[];
  purpose?: string;
}

/** A value the Brain worked out so a writer never has to: the hours of the one weekday asked about. */
export interface PacketDerived {
  id: string;
  subject: PacketSubject;
  predicate: string;
  day: string;
  date: string;
  value: { schedule?: string; season?: string; hours: string | null; notes?: string[]; window?: { from?: string; until?: string } };
  /** False when outside published dates or when applicability cannot be verified. */
  applies: boolean;
  status?: string;
  applicability?: 'unverified';
  applicability_reason?: string;
  current: boolean;
  /** The ids of the full-week facts it was read from. */
  from: string[];
  source_ids: string[];
}

export interface PacketNotice {
  type: string;
  approved_text?: string;
  [key: string]: unknown;
}

export interface FactPacket {
  version: string;
  request: {
    intent: string;
    entities: Array<{ id: string; name: string; kind: string; query: string }>;
    fields: string[];
    asOf: string;
    dataset: { version: string | null; identityHash: string | null } | null;
  };
  status: string;
  facts: PacketFact[];
  derived_facts: PacketDerived[];
  /** Missing or disputed facts, with any explanation supplied by the shared reader. */
  missing: Array<{
    subject: PacketSubject; predicate: string; reason: string;
    schedule?: string; status?: string; details?: string; days?: string[];
    source_statements?: string[]; source_ids?: string[];
  }>;
  not_published: PacketNotPublished[];
  ambiguities: Array<{
    query: string;
    truncated: boolean;
    candidates: Array<{ id: string; name: string; match: string }>;
  }>;
  unresolved: Array<{ query: string; reason: string }>;
  notices: PacketNotice[];
  sources: PacketSource[];
}

const LISTS = ['facts', 'derived_facts', 'missing', 'ambiguities', 'unresolved', 'notices', 'sources'];

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The packet a response body carries, or undefined when it carries none (text mode, errors). */
export function factPacketOf(raw: Record<string, unknown> | undefined): FactPacket | undefined {
  const packet = record(raw?.facts);
  if (!packet || typeof packet.version !== 'string' || typeof packet.status !== 'string') return undefined;
  if (!record(packet.request) || !LISTS.every((key) => Array.isArray(packet[key]))) return undefined;
  if (!(packet.derived_facts as unknown[]).every(derivedOk)) return undefined;
  // A packet from before confirmed absences existed has no such list: none were confirmed.
  if (packet.not_published !== undefined && !(Array.isArray(packet.not_published) && packet.not_published.every(absenceOk))) {
    return undefined;
  }
  return { ...packet, not_published: packet.not_published ?? [] } as unknown as FactPacket;
}

/** A derived entry the views can read: what day, what it says, and whether it holds. */
function derivedOk(entry: unknown): boolean {
  const item = record(entry);
  const subject = record(item?.subject);
  const value = record(item?.value);
  return (
    !!item &&
    !!subject &&
    typeof subject.name === 'string' &&
    typeof item.predicate === 'string' &&
    typeof item.day === 'string' &&
    typeof item.date === 'string' &&
    !!value &&
    (value.hours === null || typeof value.hours === 'string') &&
    typeof item.applies === 'boolean' &&
    typeof item.current === 'boolean' &&
    Array.isArray(item.from) &&
    item.from.every((id) => typeof id === 'string')
  );
}

/** An absence entry the views can read: a subject, a predicate, a date and the pages that were read. */
function absenceOk(entry: unknown): boolean {
  const item = record(entry);
  const subject = record(item?.subject);
  return (
    !!item &&
    !!subject &&
    typeof subject.id === 'string' &&
    typeof subject.name === 'string' &&
    typeof item.predicate === 'string' &&
    typeof item.checked_at === 'string' &&
    typeof item.current === 'boolean' &&
    Array.isArray(item.checks) &&
    item.checks.every((check) => {
      const page = record(check);
      return !!page && typeof page.url === 'string' && typeof page.section === 'string';
    })
  );
}

/** What a writer would be handed for this turn, when the Brain sends it beside the packet. */
export function writerInputOf(raw: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return record(raw?.writerInput);
}

/** The ids of full-week facts a derived fact stands in for: the writer is told the day, not these. */
export function replacedFactIds(packet: FactPacket): Set<string> {
  return new Set(packet.derived_facts.flatMap((entry) => entry.from));
}

/** A worked-out day on one line: "hours on Saturday 2026-10-10: Hours unavailable". */
export function derivedText(entry: PacketDerived): string {
  const label = entry.predicate === 'hours_on' ? 'hours' : entry.predicate.replaceAll('_', ' ');
  const when = `${entry.day} ${entry.date}`;
  if (entry.applicability === 'unverified') {
    return `${label} on ${when}: ${entry.applicability_reason ?? 'schedule applicability is unverified'}`;
  }
  if (!entry.applies) {
    const window = entry.value.window;
    const range = window ? [window.from, window.until].filter(Boolean).join(' to ') : '';
    return `${label} on ${when}: outside the dates it was published for${range ? ` (${range})` : ''}`;
  }
  return `${label} on ${when}: ${entry.value.hours ?? 'not listed for that day'}${entry.status === 'conflicting' ? ' (conflicting)' : ''}${entry.current ? '' : ' (not current)'}`;
}

/** A value on one line, for previews: the same readable form the Trace view shows. */
function valueText(value: unknown): string {
  return valueLines(value).join(', ').replace(/\s+/g, ' ');
}

/** A fact's value with the two things a reader must not miss: it is not current, or it conflicts. */
function factText(fact: PacketFact): string {
  const flags = [fact.current ? '' : 'not current', fact.status === 'conflicting' ? 'conflicting' : '']
    .filter(Boolean)
    .join(', ');
  return `${fact.predicate} ${valueText(fact.value)}${flags ? ` (${flags})` : ''}`;
}

/**
 * One paragraph of what the packet holds, most urgent first: the emergency wording, then the
 * facts by office, then what is missing, ambiguous or unmatched, then any other approved wording.
 */
export function packetSummary(packet: FactPacket): string {
  const parts: string[] = [];
  const safety = packet.notices.filter((notice) => notice.type === 'safety' && notice.approved_text);
  parts.push(...safety.map((notice) => notice.approved_text as string));

  const byOffice = new Map<string, string[]>();
  const add = (office: string, text: string) => byOffice.set(office, [...(byOffice.get(office) ?? []), text]);
  const replaced = replacedFactIds(packet);
  for (const fact of packet.facts.filter((item) => !item.purpose && !replaced.has(item.id))) {
    add(fact.subject.name, factText(fact));
  }
  for (const entry of packet.derived_facts) add(entry.subject.name, derivedText(entry));
  for (const entry of packet.not_published.filter((item) => !item.purpose)) {
    add(entry.subject.name, `${entry.predicate} not published (checked ${entry.checked_at.slice(0, 10)}${entry.current ? '' : ', not current'})`);
  }
  for (const [office, items] of byOffice) parts.push(`${office}: ${items.join('; ')}`);

  const emergency = packet.facts.filter((item) => item.purpose === 'emergency_contact');
  if (emergency.length) {
    parts.push(
      `Campus numbers: ${emergency.map((fact) => `${fact.subject.name} ${valueText(fact.value)}`).join('; ')}`
    );
  }
  if (packet.missing.length) {
    parts.push(`Unknown: ${packet.missing.map((entry) => `${entry.subject.name} ${entry.predicate}`).join(', ')}`);
  }
  for (const entry of packet.ambiguities) {
    parts.push(`"${entry.query}" could be ${entry.candidates.map((candidate) => candidate.name).join(' or ')}`);
  }
  if (packet.unresolved.length) {
    parts.push(`No office matched ${packet.unresolved.map((entry) => `"${entry.query}"`).join(', ')}`);
  }
  for (const notice of packet.notices) {
    if (notice.type === 'safety') continue;
    if (notice.type === 'recall' && typeof notice.text === 'string') parts.push(notice.text);
    else if (notice.approved_text) parts.push(notice.approved_text);
    else if (notice.type === 'clock' && typeof notice.campusNow === 'string') parts.push(notice.campusNow);
  }
  return parts.join(' · ') || packet.status;
}

/** A fact value as lines a person can read. Strings stay as sent; nothing is dropped. */
export function valueLines(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(valueLines);
  const object = record(value);
  if (!object) return [JSON.stringify(value)];
  const keys = Object.keys(object);
  if (keys.length === 1 && typeof object.number === 'string') return [object.number];
  const days = Array.isArray(object.days) ? object.days.map(record) : [];
  if (days.length > 0 && days.every((day) => day && typeof day.day === 'string' &&
    (typeof day.hours === 'string' || day.hours === null))) {
    const lines = typeof object.schedule === 'string' ? [object.schedule] : [];
    lines.push(...days.map((day) => `${day?.day}  ${day?.hours ?? 'Hours unavailable'}`));
    for (const [key, extra] of Object.entries(object)) {
      if (key !== 'schedule' && key !== 'days') lines.push(`${key}: ${valueLines(extra).join('; ')}`);
    }
    return lines;
  }
  return [JSON.stringify(value)];
}

/**
 * Why the packet's status is not a plain "complete": every reason is a field the packet holds.
 * Mirrors what makes the Brain call a packet `partial`; it only reads, it decides nothing.
 */
export function packetReasons(packet: FactPacket): string[] {
  const reasons: string[] = [];
  for (const entry of packet.derived_facts) {
    const name = `${entry.subject.name} ${entry.predicate === 'hours_on' ? 'hours' : entry.predicate} on ${entry.day} ${entry.date}`;
    if (entry.applicability === 'unverified') reasons.push(`${name}: ${entry.applicability_reason ?? 'schedule applicability is unverified'}`);
    else if (!entry.applies) reasons.push(`${name} is outside the dates the schedule was published for`);
    else if (!entry.current) reasons.push(`${name} is not current`);
    if (entry.status === 'conflicting') reasons.push(`${name} has conflicting values`);
  }
  const replaced = replacedFactIds(packet);
  for (const fact of packet.facts.filter((item) => !item.purpose && !replaced.has(item.id))) {
    const name = `${fact.subject.name} ${fact.predicate}`;
    if (!fact.current) reasons.push(`${name} is not current`);
    if (fact.status === 'conflicting') reasons.push(`${name} has conflicting values`);
    else if (fact.status !== 'known') reasons.push(`${name} has more than one value`);
  }
  for (const entry of packet.not_published.filter((item) => !item.purpose && !item.current)) {
    reasons.push(`${entry.subject.name} ${entry.predicate}: the "not published" check is not current`);
  }
  for (const entry of packet.missing) reasons.push(`${entry.subject.name} ${entry.predicate}${entry.schedule ? ` (${entry.schedule})` : ''}: ${entry.details ?? entry.reason.replaceAll('_', ' ')}`);
  for (const entry of packet.ambiguities) reasons.push(`"${entry.query}" matches more than one office`);
  for (const entry of packet.unresolved) reasons.push(`no office matched "${entry.query}"`);
  for (const notice of packet.notices) {
    if (notice.type === 'evidence_incomplete') reasons.push('some of the evidence is incomplete');
    else if (notice.type === 'incomplete') {
      reasons.push(`the turn was cut short${typeof notice.code === 'string' ? ` (${notice.code.replaceAll('_', ' ')})` : ''}`);
    } else if (['unsupported', 'account_limit', 'clarification'].includes(notice.type)) {
      reasons.push(`part of the question can't be answered (${notice.type.replaceAll('_', ' ')})`);
    }
  }
  return reasons;
}
