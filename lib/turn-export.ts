/**
 * @module lib/turn-export
 * The Ask & Inspect conversation as the export writes it.
 *
 * The export is read by whoever debugs a turn later, often an AI with only the
 * file: it has to say when each turn ran, which dataset answered, how long the student
 * waited, and what the Brain did. A development Brain sends its lookups (`trace`) and its
 * decisions (`metrics`) only to this app; both stay inside `response`, as sent.
 *
 * Nothing is written twice: the conversation's messages and the evidence records
 * are listed once, and each turn names them. A 30-turn export on 09-28 was 445 KB,
 * about 72% of it repeats: every turn's history (40%), indentation (27%), and
 * `metrics.toolResults`, which is `trace` without its arguments (10%).
 *
 * Evidence is listed once per distinct representation, not once per ID: a profile
 * lookup and a search can return the same record ID with different identity, scope
 * and limitations, and the first-wins table made Q8 of 09-28 read Q7's copy (09-29):
 * - `evidence[id]` is the first representation seen (version 0);
 * - `evidenceVersions[id]` lists each later, different one (version 1 is `[0]`);
 * - a turn's `diagnostics.evidenceIds` names each record as `"id"` for version 0 or
 *   `{ "id": id, "version": n }` for a later one, so each turn reconstructs exactly
 *   the objects it received (`exportedEvidence` below).
 */

import { currentOutcome, type Turn } from '../components/ask/types.ts';
import type { ChatMessageInput } from './chat-request.ts';

type Json = Record<string, unknown>;

function record(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** The Brain's diagnostics: at the top of an answer, inside the Brain's own body on a refusal. */
export function turnDiagnostics(raw: Json | undefined): Json | undefined {
  return record(raw?.diagnostics) ?? record(record(raw?.upstreamResponse)?.diagnostics);
}

/** What the student would first read as an answer, and when: the answer, else a failure's emergency help. */
function firstAnswerText(turn: Turn): { kind: string | null; atMs: number | null } {
  const atMs = turn.latencyMs ?? null;
  if (turn.status === 'pending') return { kind: null, atMs: null };
  if (text(turn.raw?.answer)) return { kind: 'answer', atMs };
  if (turn.raw?.emergency) return { kind: 'emergency_help', atMs };
  return { kind: null, atMs: null };
}

/** How a turn names one evidence record: its ID, or its ID and a later version. */
export type EvidenceRef = string | { id: string; version: number };

/** The same JSON whatever the key order, to tell representations apart. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Json).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : item
  );
}

/** What the conversation's turns share: each message and evidence record, once. */
export class ExportTables {
  messages: ChatMessageInput[] = [];
  evidence: Record<string, unknown> = {};
  evidenceVersions: Record<string, unknown[]> = {};
  private seen = new Map<string, number>();
  /** Each ID's representations so far, canonical, in version order. */
  private shapes = new Map<string, string[]>();

  /** A message's place in `messages`, adding it the first time it is seen. */
  message(message: ChatMessageInput): number {
    const key = JSON.stringify([message.role, message.content]);
    let index = this.seen.get(key);
    if (index === undefined) {
      index = this.messages.push(message) - 1;
      this.seen.set(key, index);
    }
    return index;
  }

  /** Records keyed by ID and version; the references, in order, for the turn to name them by. */
  records(value: unknown): EvidenceRef[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const refs: EvidenceRef[] = [];
    for (const item of value) {
      const id = record(item)?.id;
      if (typeof id !== 'string') continue;
      const shape = canonical(item);
      const shapes = this.shapes.get(id);
      if (!shapes) {
        this.shapes.set(id, [shape]);
        this.evidence[id] = item;
        refs.push(id);
        continue;
      }
      let version = shapes.indexOf(shape);
      if (version === -1) {
        version = shapes.push(shape) - 1;
        (this.evidenceVersions[id] ??= []).push(item);
      }
      refs.push(version === 0 ? id : { id, version });
    }
    return refs;
  }
}

/** The record a turn's evidence reference names, from a parsed export. */
export function exportedEvidence(
  exported: { evidence: Record<string, unknown>; evidenceVersions?: Record<string, unknown[]> },
  ref: EvidenceRef
): unknown {
  if (typeof ref === 'string') return exported.evidence[ref];
  return ref.version === 0
    ? exported.evidence[ref.id]
    : exported.evidenceVersions?.[ref.id]?.[ref.version - 1];
}

/** The response without the evidence records the export keeps once in its table. */
function slimResponse(raw: Json | undefined, tables: ExportTables): Json | undefined {
  if (!raw) return raw;
  const slim = (body: Json): Json => {
    const diagnostics = record(body.diagnostics);
    const out: Json = { ...body };
    if (diagnostics) {
      const { evidence, ...rest } = diagnostics;
      const evidenceIds = tables.records(evidence);
      out.diagnostics = evidenceIds ? { ...rest, evidenceIds } : rest;
    }
    return out;
  };
  const out = slim(raw);
  const upstream = record(raw.upstreamResponse);
  if (upstream) out.upstreamResponse = slim(upstream);
  return out;
}

export function exportTurn(turn: Turn, tables: ExportTables = new ExportTables()) {
  const first = firstAnswerText(turn);
  return {
    question: turn.question,
    // A bulk run sends each question alone unless history was kept; say so, since a
    // follow-up graded without its history read as the bot forgetting (09-28).
    sentWith:
      turn.request.messages.length > 1 || turn.request.omittedMessages
        ? `${turn.request.messages.length - 1} earlier message${
            turn.request.messages.length === 2 ? '' : 's'
          }` +
          (turn.request.omittedMessages ? ` (${turn.request.omittedMessages} older not sent)` : '')
        : turn.bulk
          ? 'no history (bulk run, each question on its own)'
          : 'no history (first question)',
    // As the inspector reads it now: a not-ready turn exports as `not_built`, not `failed`.
    status: currentOutcome(turn).status,
    httpStatus: turn.httpStatus,
    sentAt: new Date(turn.startedAt).toISOString(),
    finishedAt: turn.finishedAt === undefined ? null : new Date(turn.finishedAt).toISOString(),
    timing: {
      firstAnswerTextMs: first.atMs,
      firstAnswerText: first.kind,
      totalMs: turn.latencyMs ?? null,
      browser: turn.timing ?? null,
    },
    brain: { datasetVersion: text(turn.raw?.datasetVersion) },
    requestId: turn.requestId,
    // Indexes into the export's `messages`, oldest first; the last is this question.
    request: { ...turn.request, messages: turn.request.messages.map((m) => tables.message(m)) },
    // The Brain's reply as sent, with its `trace` (each office lookup) and `metrics` (who
    // decided, model calls, spend) when a development Brain was asked for them.
    response: slimResponse(turn.raw, tables),
  };
}

/** Every turn, with the messages and evidence they share listed once. Compact JSON. */
export function exportConversation(turns: Turn[], exportedAt: Date = new Date()): string {
  const tables = new ExportTables();
  const exported = turns.map((turn) => exportTurn(turn, tables));
  return JSON.stringify({
    exportedAt: exportedAt.toISOString(),
    // Each turn's `request.messages` are indexes into `messages`; each entry of a
    // turn's `diagnostics.evidenceIds` is a key of `evidence` or, as `{id, version}`,
    // an entry of `evidenceVersions[id]` (version n is index n - 1).
    messages: tables.messages,
    evidence: tables.evidence,
    evidenceVersions: tables.evidenceVersions,
    turns: exported,
  });
}
