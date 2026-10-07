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
  derived_facts: unknown[];
  missing: Array<{ subject: PacketSubject; predicate: string; reason: string }>;
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
  return packet as unknown as FactPacket;
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(valueText).join(', ');
  return JSON.stringify(value);
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
  for (const fact of packet.facts.filter((item) => !item.purpose)) {
    byOffice.set(fact.subject.name, [...(byOffice.get(fact.subject.name) ?? []), factText(fact)]);
  }
  for (const [office, items] of byOffice) parts.push(`${office}: ${items.join('; ')}`);

  const emergency = packet.facts.filter((item) => item.purpose === 'emergency_contact');
  if (emergency.length) {
    parts.push(
      `Campus numbers: ${emergency.map((fact) => `${fact.subject.name} ${valueText(fact.value)}`).join('; ')}`
    );
  }
  if (packet.missing.length) {
    parts.push(
      `Not published: ${packet.missing.map((entry) => `${entry.subject.name} ${entry.predicate}`).join(', ')}`
    );
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
  if (days.length > 0 && days.every((day) => day && typeof day.day === 'string' && typeof day.hours === 'string')) {
    const lines = typeof object.schedule === 'string' ? [object.schedule] : [];
    lines.push(...days.map((day) => `${day?.day}  ${day?.hours}`));
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
  for (const fact of packet.facts.filter((item) => !item.purpose)) {
    const name = `${fact.subject.name} ${fact.predicate}`;
    if (!fact.current) reasons.push(`${name} is not current`);
    if (fact.status === 'conflicting') reasons.push(`${name} has conflicting values`);
    else if (fact.status !== 'known') reasons.push(`${name} has more than one value`);
  }
  for (const entry of packet.missing) reasons.push(`${entry.subject.name} ${entry.predicate} is not published`);
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
