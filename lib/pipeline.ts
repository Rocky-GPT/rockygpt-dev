/**
 * @module lib/pipeline
 * The stages a turn went through, read from what the Brain sent back for it: who did each one (the
 * AI model or plain code), what it produced and how long it took. Every line is a field of the
 * response; this only reads, it decides nothing. The details of a stage stay in their own tab, and
 * each stage says which.
 */

import { brainMetrics, brainTrace } from './brain-metrics.ts';
import { derivedText, factPacketOf, replacedFactIds, writerInputOf } from './fact-packet.ts';
import type { InspectorTab } from './inspector-tabs.ts';

export type StageId = 'question' | 'model' | 'lookup' | 'worked_out' | 'packet' | 'writer_input' | 'writer';
export type Doer = 'student' | 'AI model' | 'plain code' | 'not built';
/** `not_built` is a stage the design has and the Brain does not run yet. */
export type StageState = 'done' | 'skipped' | 'failed' | 'not_built';

export interface PipelineStage {
  id: StageId;
  title: string;
  doer: Doer;
  state: StageState;
  summary: string;
  details: Array<{ label: string; value: string }>;
  /** The tab that holds this stage in full. */
  open?: InspectorTab;
}

export interface PipelineInput {
  raw: Record<string, unknown> | undefined;
  question: string;
  /** Messages sent before the question. */
  earlierMessages: number;
  failed: boolean;
  failure?: string;
  /** Microseconds per kind of work, when the turn was timed. */
  totalsUs?: Partial<Record<'model' | 'ledger' | 'lookup' | 'brain' | 'network' | 'unrecorded', number>>;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const size = (value: unknown): number => JSON.stringify(value).length;

/** A time as a person reads it: 117 ms, 5.57 s. */
export function pipelineTime(us: number): string {
  return us >= 1_000_000 ? `${(us / 1_000_000).toFixed(2)} s` : `${Math.max(1, Math.round(us / 1_000))} ms`;
}

function clip(text: string, length: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > length ? `${line.slice(0, length - 1)}…` : line;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The order the model wrote for one lookup: what, of which office, for which day. */
function orderText(call: Json): string {
  const args = isRecord(call.arguments) ? call.arguments : {};
  const fields = Array.isArray(args.fields) ? args.fields.filter((f): f is string => typeof f === 'string') : [];
  const query = typeof args.query === 'string' ? args.query : '';
  const day = typeof args.day === 'string' ? `, day ${args.day}` : '';
  return `${fields.join(', ') || 'details'} of “${query}”${day}`;
}

function pathText(call: Json): string {
  const path = Array.isArray(call.path) ? call.path.filter(isRecord) : [];
  const labels = path.map((node) => (typeof node.label === 'string' ? node.label : String(node.id)));
  const status = typeof call.status === 'string' ? call.status.replaceAll('_', ' ') : 'unknown';
  if (call.status === 'ambiguous' && Array.isArray(call.candidates)) {
    return `${labels.join(' → ') || 'Ramapo'}, ambiguous: ${call.candidates.map(String).join(' or ')}`;
  }
  return `${labels.join(' → ') || 'no path recorded'}, ${status}`;
}

/** The stages of one turn, in the order they ran. */
export function pipelineStages(input: PipelineInput): PipelineStage[] {
  const { raw, totalsUs } = input;
  const metrics = brainMetrics(raw);
  const calls = (brainTrace(raw) ?? []).filter(isRecord);
  const orders = calls.filter((call) => isRecord(call.arguments) && call.tool !== 'emergency_contacts');
  const packet = factPacketOf(raw);
  const writerInput = writerInputOf(raw);
  const answer = typeof raw?.answer === 'string' ? raw.answer : '';
  const phraseFloor = metrics?.decidedBy === 'phrase_floor';
  const errorCode = typeof metrics?.errorCode === 'string' ? metrics.errorCode.replaceAll('_', ' ') : undefined;
  const stages: PipelineStage[] = [];

  stages.push({
    id: 'question',
    title: 'Question',
    doer: 'student',
    state: 'done',
    summary: `“${clip(input.question, 90)}”`,
    details: input.earlierMessages > 0 ? [{ label: 'earlier messages sent with it', value: String(input.earlierMessages) }] : [],
    open: 'raw',
  });

  // The model reads the message and fills in an order slip: what to look up, and nothing more.
  const model: PipelineStage = {
    id: 'model',
    title: 'Order slip',
    doer: phraseFloor ? 'plain code' : 'AI model',
    state: 'done',
    summary: '',
    details: [],
    open: 'timing',
  };
  if (phraseFloor) {
    model.summary = 'The danger phrase list decided this reply, with no model call.';
  } else if (input.failed && calls.length === 0 && !packet) {
    model.state = 'failed';
    model.summary = input.failure ? clip(input.failure, 140) : 'The turn failed before the model finished.';
  } else if (orders.length > 0) {
    model.summary = `Asked for ${orders.map(orderText).join('; ')}`;
  } else {
    model.summary = 'Answered without looking anything up.';
  }
  if (typeof metrics?.modelCalls === 'number') {
    model.details.push({ label: 'model calls', value: String(metrics.modelCalls) });
  }
  if (typeof metrics?.committedNusd === 'number' && metrics.committedNusd > 0) {
    model.details.push({ label: 'spend', value: `$${(metrics.committedNusd / 1e9).toFixed(4)}` });
  }
  if (totalsUs?.model) model.details.push({ label: 'AI model time', value: pipelineTime(totalsUs.model) });
  if (totalsUs?.ledger) model.details.push({ label: 'spending ledger time', value: pipelineTime(totalsUs.ledger) });
  stages.push(model);

  // Code walks Ramapo → Offices → the office and reads its published records.
  const lookup: PipelineStage = {
    id: 'lookup',
    title: 'Lookup',
    doer: 'plain code',
    state: calls.length > 0 ? 'done' : 'skipped',
    summary: calls.length > 0 ? calls.map(pathText).join('; ') : 'Nothing to look up.',
    details: [],
    open: 'lookups',
  };
  const dataset = calls.find((call) => typeof call.dataset_version === 'string')?.dataset_version;
  if (typeof dataset === 'string') lookup.details.push({ label: 'dataset', value: dataset });
  if (calls.length > 0 && totalsUs?.lookup) lookup.details.push({ label: 'lookup time', value: pipelineTime(totalsUs.lookup) });
  stages.push(lookup);

  // Code works out what the writer would otherwise have to: today the day that was asked.
  const worked: PipelineStage = {
    id: 'worked_out',
    title: 'Worked out',
    doer: 'plain code',
    state: packet && packet.derived_facts.length > 0 ? 'done' : 'skipped',
    summary: !packet
      ? 'No Fact Packet, so nothing is worked out.'
      : packet.derived_facts.length > 0
        ? packet.derived_facts.map(derivedText).join('; ')
        : 'Nothing to work out: no day was asked.',
    details: [],
    open: 'packet',
  };
  stages.push(worked);

  // Code builds the Fact Packet and checks it before anything may be written from it.
  const counts = packet
    ? [
        [packet.facts.filter((fact) => !fact.purpose).length, 'fact', 'facts'],
        [packet.not_published.filter((entry) => !entry.purpose).length, 'confirmed not published', 'confirmed not published'],
        [packet.missing.length, 'unknown', 'unknown'],
        [packet.ambiguities.length, 'question to ask', 'questions to ask'],
        [packet.notices.length, 'notice', 'notices'],
      ]
        .filter(([count]) => (count as number) > 0)
        .map(([count, one, many]) => plural(count as number, one as string, many as string))
    : [];
  const built: PipelineStage = {
    id: 'packet',
    title: 'Fact Packet',
    doer: 'plain code',
    state: packet ? 'done' : 'skipped',
    summary: packet
      ? `Status ${packet.status.replaceAll('_', ' ')}${counts.length ? `: ${counts.join(', ')}` : ''}.`
      : answer
        ? 'This Brain wrote the answer itself, so it sent no Fact Packet.'
        : 'No Fact Packet in this response.',
    details: [],
    open: 'packet',
  };
  if (packet) {
    built.details.push({ label: 'checked', value: 'yes, before anything is written' });
    built.details.push({ label: 'size', value: `${size(packet)} B` });
  }
  if (packet && totalsUs?.brain) built.details.push({ label: 'Brain code time, all code stages', value: pipelineTime(totalsUs.brain) });
  stages.push(built);

  // Code cuts the packet down to what a writer needs to say.
  const cut: PipelineStage = {
    id: 'writer_input',
    title: 'Writer input',
    doer: 'plain code',
    state: packet && writerInput ? 'done' : 'skipped',
    summary: '',
    details: [],
    open: 'answer',
  };
  if (packet && writerInput) {
    const full = size(packet);
    const small = size(writerInput);
    cut.summary = `Cut down to ${small} of ${full} B, ${Math.max(0, Math.round(100 - (100 * small) / full))}% smaller.`;
    const sent = Array.isArray(writerInput.sources) ? writerInput.sources.length : 0;
    const dropped = packet.sources.length - sent;
    cut.details.push({ label: 'left out', value: 'ids and the dataset hash' });
    if (dropped > 0) cut.details.push({ label: 'sources nothing cites', value: String(dropped) });
    const replaced = replacedFactIds(packet).size;
    if (replaced > 0) cut.details.push({ label: 'full-week facts replaced by a day', value: String(replaced) });
  } else {
    cut.summary = packet ? 'This Brain sent no writer input.' : 'No Fact Packet to cut down.';
  }
  stages.push(cut);

  // A writer, a template or an LLM, turns that into words. It is not built: today's text answers
  // come from the older renderer, which does not read the packet.
  const writer: PipelineStage =
    answer !== ''
      ? {
          id: 'writer',
          title: 'Writer',
          doer: 'plain code',
          state: 'done',
          summary: 'The current text renderer wrote this answer. It does not read the Fact Packet.',
          details: [],
          open: 'answer',
        }
      : packet
        ? {
            id: 'writer',
            title: 'Writer',
            doer: 'not built',
            state: 'not_built',
            summary: 'Nothing turns the writer input into words yet, so the answer is empty. A template or an LLM goes here.',
            details: [],
            open: 'answer',
          }
        : {
            id: 'writer',
            title: 'Writer',
            doer: 'plain code',
            state: input.failed ? 'failed' : 'skipped',
            summary: input.failed ? `No answer.${errorCode ? ` The Brain said ${errorCode}.` : ''}` : 'No answer text in this response.',
            details: [],
            open: 'raw',
          };
  stages.push(writer);
  return stages;
}
