/**
 * @module lib/turn-export
 * The Ask & Inspect conversation as the export writes it.
 *
 * The export is read by whoever debugs a turn later, often an AI with only the
 * file: it has to say when each turn ran, which Brain and release answered, what
 * evidence and drafts were behind the answer, how long the student waited before
 * seeing anything, and where the time went, as the Timeline panel shows it. The
 * Brain sends the evidence, drafts and work record only to this app
 * (`diagnostics`, development only); everything else is timed here.
 *
 * Nothing is written twice: the conversation's messages and the evidence records
 * are listed once, and each turn names them. A 30-turn export on 09-28 was 445 KB,
 * about 72% of it repeats: every turn's history (40%), indentation (27%), and
 * `metrics.toolResults`, which is `trace` without its arguments (10%).
 */

import type { Turn } from '@/components/ask/types';
import type { ChatMessageInput } from './chat-request.ts';
import {
  describeStep,
  lookupCounts,
  stepReasons,
  workTotals,
  workedSteps,
} from './chat-stream.ts';

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

/**
 * What the student would first read as an answer, and when: the draft shown while
 * it is checked, else the final answer, else a failure's emergency help.
 */
function firstAnswerText(turn: Turn): { kind: string | null; atMs: number | null } {
  if (turn.draftPreview) return { kind: 'draft_preview', atMs: turn.draftPreview.atMs };
  const atMs = turn.latencyMs ?? null;
  if (turn.status === 'pending') return { kind: null, atMs: null };
  if (text(turn.raw?.answer)) return { kind: 'answer', atMs };
  if (turn.raw?.emergency) return { kind: 'emergency_help', atMs };
  return { kind: null, atMs: null };
}

/** What the conversation's turns share: each message and evidence record, once. */
export class ExportTables {
  messages: ChatMessageInput[] = [];
  evidence: Record<string, unknown> = {};
  private seen = new Map<string, number>();

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

  /** Records keyed by ID; the IDs, in order, for the turn to name them by. */
  records(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const ids: string[] = [];
    for (const item of value) {
      const id = record(item)?.id;
      if (typeof id !== 'string') continue;
      this.evidence[id] ??= item;
      ids.push(id);
    }
    return ids;
  }
}

/**
 * What the Timeline panel shows for a turn a development Brain timed: the line on
 * top, then each step with who worked in it, why it ran and what its lookups got
 * back. Null when the Brain sent no work record.
 */
export function exportTimeline(raw: Json | undefined) {
  const worked = workedSteps(turnDiagnostics(raw)?.work);
  if (!worked) return null;
  return {
    brainMs: worked.endMs,
    summary: workTotals(worked).map(({ who, ms, share, calls }) => ({
      who,
      ms,
      share: Math.round(share * 100) / 100,
      calls,
    })),
    steps: worked.steps.map((step, index, steps) => {
      const { label, detail } = describeStep(step);
      const tries = steps.slice(0, index + 1).filter((earlier) => earlier.stage === 'composing');
      return {
        step: label,
        ...(detail ? { detail } : {}),
        atMs: step.atMs,
        ms: step.ms,
        work: step.work.map(({ who, ms, calls }) =>
          calls.length ? { who, ms, calls } : { who, ms }
        ),
        why: stepReasons(step, tries.length),
        found: lookupCounts(step),
      };
    }),
  };
}

/** The response without what the export keeps elsewhere or doesn't need twice. */
function slimResponse(raw: Json | undefined, tables: ExportTables): Json | undefined {
  if (!raw) return raw;
  const slim = (body: Json): Json => {
    const metrics = record(body.metrics);
    const diagnostics = record(body.diagnostics);
    const out: Json = { ...body };
    if (metrics) {
      // A copy of `trace` without its arguments.
      const rest = { ...metrics };
      delete rest.toolResults;
      out.metrics = rest;
    }
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
  const diagnostics = turnDiagnostics(turn.raw);
  const brain = record(diagnostics?.brain);
  const first = firstAnswerText(turn);
  const timeline = exportTimeline(turn.raw);
  return {
    question: turn.question,
    // A bulk run sends each question alone unless history was kept; say so, since a
    // follow-up graded without its history read as the bot forgetting (09-28).
    sentWith:
      turn.request.messages.length > 1
        ? `${turn.request.messages.length - 1} earlier messages`
        : turn.bulk
          ? 'no history (bulk run, each question on its own)'
          : 'no history (first question)',
    status: turn.status,
    httpStatus: turn.httpStatus,
    sentAt: new Date(turn.startedAt).toISOString(),
    finishedAt: turn.finishedAt === undefined ? null : new Date(turn.finishedAt).toISOString(),
    timing: {
      // The first status line the student sees ("Sending your question...").
      firstProgressMs: turn.firstProgressMs ?? null,
      firstAnswerTextMs: first.atMs,
      firstAnswerText: first.kind,
      totalMs: turn.latencyMs ?? null,
      brainElapsedMs: typeof turn.raw?.elapsedMs === 'number' ? turn.raw.elapsedMs : null,
    },
    // Null revision: the Brain wasn't started by the deploy script (run-local.sh's
    // working-tree Brain), or it predates diagnostics.
    brain: {
      revision: text(brain?.revision),
      release: text(brain?.release),
      configurationHash: text(brain?.configurationHash),
      datasetVersion: text(turn.raw?.datasetVersion),
      startedAt: text(diagnostics?.startedAt),
    },
    requestId: turn.requestId,
    // The Brain's own step timings are in `timeline` and `diagnostics.work`; the steps
    // as this app saw them arrive are kept only when the Brain sent no work record.
    ...(timeline ? { timeline } : { steps: turn.steps ?? [] }),
    draftPreview: turn.draftPreview?.text ?? null,
    // Indexes into the export's `messages`, oldest first; the last is this question.
    request: { ...turn.request, messages: turn.request.messages.map((m) => tables.message(m)) },
    // Carries `diagnostics.evidenceIds` (every record the writer and reviewer were
    // given, in the export's `evidence`), `diagnostics.drafts` (each draft as written,
    // with the reviewer's verdicts) and `diagnostics.work` (the Brain's step timings).
    response: slimResponse(turn.raw, tables),
  };
}

/** Every turn, with the messages and evidence they share listed once. Compact JSON. */
export function exportConversation(turns: Turn[], exportedAt: Date = new Date()): string {
  const tables = new ExportTables();
  const exported = turns.map((turn) => exportTurn(turn, tables));
  return JSON.stringify({
    exportedAt: exportedAt.toISOString(),
    // Each turn's `request.messages` are indexes into `messages`; each record ID in a
    // turn's `diagnostics.evidenceIds` is a key of `evidence`.
    messages: tables.messages,
    evidence: tables.evidence,
    turns: exported,
  });
}
