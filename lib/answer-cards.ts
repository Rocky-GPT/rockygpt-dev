/**
 * @module lib/answer-cards
 * The how-to tasks a release holds, as the Brain's development routes list them
 * (`GET /v1/dev/answer-cards` and `GET /v1/dev/answer-cards/task`; see the Brain's
 * docs/contract.md, "Development routes").
 *
 * An answer card will be one task a student asks about, joined from every page that lists it.
 * That join is not built yet, so the Brain lists the tasks as each page gives them and says
 * `cards: null`. This module reads those replies and searches them; it decides nothing about
 * which page wins.
 */

export interface CardNode {
  entityId: string;
  name: string;
  kind: string;
  pages: number;
  tasks: number;
}

export interface CardTask {
  /** "e<n>": the task's place in its page's list, the key the meaning index gives it. */
  key: string;
  task: string;
  appliesTo: string | null;
  /** The office the page says handles it, when that is not the page's own office. */
  handledBy: string | null;
  term: string | null;
  section: string | null;
  steps: number;
}

export interface CardPage {
  recordId: string;
  url: string | null;
  path: string | null;
  /** The day the page says it last changed (YYYY-MM-DD), or null when it says nothing. */
  updated: string | null;
  /** Ids of the nodes whose links hold this page. */
  nodes: string[];
  tasks: CardTask[];
}

export interface CardTotals {
  pagesRead: number;
  pagesWithTasks: number;
  tasks: number;
  steps: number;
}

export interface CardListing {
  datasetVersion: string;
  identityHash: string;
  /** False until the release joins tasks into cards. */
  joined: boolean;
  totals: CardTotals;
  nodes: CardNode[];
  pages: CardPage[];
}

export interface CardStep {
  text: string;
  /** The page's own words behind the step, or null when the page read gave none. */
  quote: string | null;
}

export interface CardTaskDetail {
  datasetVersion: string;
  identityHash: string;
  task: Omit<CardTask, 'steps'> & { steps: CardStep[] };
  page: Omit<CardPage, 'nodes' | 'tasks'> & {
    collectedAt: string | null;
    otherTasks: Array<{ key: string; task: string }>;
  };
  nodes: Array<Pick<CardNode, 'entityId' | 'name' | 'kind'>>;
}

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

function readTaskFields(raw: Raw): Omit<CardTask, 'steps'> | null {
  const key = text(raw.key);
  const task = text(raw.task);
  if (!key || !task) return null;
  return {
    key,
    task,
    appliesTo: text(raw.applies_to),
    handledBy: text(raw.handled_by),
    term: text(raw.term),
    section: text(raw.section),
  };
}

function readPageFields(raw: Raw): Omit<CardPage, 'nodes' | 'tasks'> | null {
  const recordId = text(raw.record_id);
  if (!recordId) return null;
  return { recordId, url: text(raw.url), path: text(raw.path), updated: text(raw.updated) };
}

function readNode(raw: unknown): Pick<CardNode, 'entityId' | 'name' | 'kind'> | null {
  if (!isRaw(raw)) return null;
  const entityId = text(raw.entity_id);
  const name = text(raw.name);
  return entityId && name ? { entityId, name, kind: text(raw.kind) ?? 'node' } : null;
}

/** The Brain's list reply, or null when it is not one. Rows it cannot read are left out. */
export function readListing(body: unknown): CardListing | null {
  if (!isRaw(body) || !Array.isArray(body.pages) || !Array.isArray(body.nodes)) return null;
  const datasetVersion = text(body.dataset_version);
  const identityHash = text(body.identity_hash);
  if (!datasetVersion || !identityHash) return null;
  const totals = isRaw(body.totals) ? body.totals : {};
  const pages: CardPage[] = [];
  for (const raw of body.pages) {
    const page = isRaw(raw) ? readPageFields(raw) : null;
    if (!page || !isRaw(raw) || !Array.isArray(raw.tasks)) continue;
    const tasks: CardTask[] = [];
    for (const item of raw.tasks) {
      const fields = isRaw(item) ? readTaskFields(item) : null;
      if (fields && isRaw(item)) tasks.push({ ...fields, steps: count(item.steps) });
    }
    if (!tasks.length) continue;
    const nodes = Array.isArray(raw.nodes)
      ? raw.nodes.filter((id): id is string => typeof id === 'string')
      : [];
    pages.push({ ...page, nodes, tasks });
  }
  const nodes: CardNode[] = [];
  for (const raw of body.nodes) {
    const node = readNode(raw);
    if (node && isRaw(raw)) nodes.push({ ...node, pages: count(raw.pages), tasks: count(raw.tasks) });
  }
  return {
    datasetVersion,
    identityHash,
    joined: body.cards !== null && body.cards !== undefined,
    totals: {
      pagesRead: count(totals.pages_read),
      pagesWithTasks: count(totals.pages_with_tasks),
      tasks: count(totals.tasks),
      steps: count(totals.steps),
    },
    nodes,
    pages,
  };
}

/** The Brain's one-task reply, or null when it is not one. */
export function readTaskDetail(body: unknown): CardTaskDetail | null {
  if (!isRaw(body) || !isRaw(body.task) || !isRaw(body.page)) return null;
  const datasetVersion = text(body.dataset_version);
  const identityHash = text(body.identity_hash);
  const fields = readTaskFields(body.task);
  const page = readPageFields(body.page);
  if (!datasetVersion || !identityHash || !fields || !page || !Array.isArray(body.task.steps)) return null;
  const steps: CardStep[] = [];
  for (const raw of body.task.steps) {
    const words = isRaw(raw) ? text(raw.text) : null;
    if (words && isRaw(raw)) steps.push({ text: words, quote: text(raw.quote) });
  }
  const otherTasks: Array<{ key: string; task: string }> = [];
  for (const raw of Array.isArray(body.page.other_tasks) ? body.page.other_tasks : []) {
    const key = isRaw(raw) ? text(raw.key) : null;
    const task = isRaw(raw) ? text(raw.task) : null;
    if (key && task) otherTasks.push({ key, task });
  }
  const nodes = (Array.isArray(body.nodes) ? body.nodes : [])
    .map(readNode)
    .filter((node): node is NonNullable<ReturnType<typeof readNode>> => node !== null);
  return {
    datasetVersion,
    identityHash,
    task: { ...fields, steps },
    page: { ...page, collectedAt: text(body.page.collected_at), otherTasks },
    nodes,
  };
}

/** One task with its page: what a tile shows and what opening it needs. */
export interface TaskRow {
  /** Unique in a listing: the page's record id and the task's key. */
  id: string;
  page: CardPage;
  task: CardTask;
  /** The task's name, lower case. A search word here ranks the row first. */
  name: string;
  /** Every word the row can be found by, lower case. */
  words: string;
}

/** Each linking node's name by its id. */
export function nodeNames(listing: CardListing): Map<string, string> {
  return new Map(listing.nodes.map((node) => [node.entityId, node.name]));
}

export function taskRows(listing: CardListing): TaskRow[] {
  const names = nodeNames(listing);
  return listing.pages.flatMap((page) =>
    page.tasks.map((task) => ({
      id: `${page.recordId}:${task.key}`,
      page,
      task,
      name: task.task.toLowerCase(),
      words: [
        task.task,
        task.appliesTo,
        task.handledBy,
        task.term,
        task.section,
        page.path,
        ...page.nodes.map((id) => names.get(id)),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }))
  );
}

/**
 * The rows a search shows. `node` keeps the tasks on pages that node links. Every word of
 * `query` must be somewhere in the row; rows with every word in the task's own name come first,
 * and within each group the listing's order (by page address) stays.
 */
export function filterTasks(rows: TaskRow[], query: string, node: string | null): TaskRow[] {
  const wanted = query.toLowerCase().split(/\s+/).filter(Boolean);
  const kept = rows.filter(
    (row) => (!node || row.page.nodes.includes(node)) && wanted.every((word) => row.words.includes(word))
  );
  if (!wanted.length) return kept;
  const inName = (row: TaskRow) => wanted.every((word) => row.name.includes(word));
  return [...kept.filter(inName), ...kept.filter((row) => !inName(row))];
}

/** "Aug 17, 2026" for "2026-08-17" (or a full timestamp); the text itself when it is not a day. */
export function formatDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "1 step", "5 steps". */
export function plural(amount: number, one: string, many = `${one}s`): string {
  return `${amount.toLocaleString('en-US')} ${amount === 1 ? one : many}`;
}
