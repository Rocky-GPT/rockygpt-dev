/**
 * @module lib/answer-cards
 * The how-to tasks a release holds, as the Brain's development routes list them
 * (`GET /v1/dev/answer-cards` and `GET /v1/dev/answer-cards/task`; see the Brain's
 * docs/contract.md, "Development routes").
 *
 * An answer card is one task a student asks about, joined from every page that lists it. The
 * Brain's graph build joins them by rules and sends the cards with the list (`cards`, null for a
 * release built without them): each card's status, its owner offices and its tasks by page and
 * key, the winning page first. This module reads those replies, puts each card's tasks back
 * beside it, searches them and words why a card has its status. It decides nothing about which
 * tasks are one card or which page wins: that is the Brain's `retrieval/card_join.py`.
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

export type CardStatus = 'ready' | 'needs_look' | 'date_passed';
/**
 * A task's place in its card: the page whose steps the card says; another current page of the
 * owner; another office's current page; or a page left out (a term that is over, or an old page
 * beside a newer winner).
 */
export type CardRole = 'winner' | 'owner_page' | 'mentions' | 'left_out';

export interface CardMember {
  recordId: string;
  key: string;
  role: CardRole;
  /** Why a left-out task is left out. */
  why: 'over' | 'old' | null;
  /** The term or date that is over ("Fall 2022", "September 1, 2026"). */
  label: string | null;
}

export interface AnswerCard {
  id: string;
  status: CardStatus;
  /** Why it needs a look: owner_unclear, no_date, big_group. */
  flags: string[];
  /** Worth knowing, not a reason to look: old_page, owner_has_no_page. */
  notes: string[];
  /** Ids of the nodes that handle the task. */
  owners: string[];
  /** The card's tasks, the winner first. */
  members: CardMember[];
}

export interface CardSet {
  /** The day the cards were built (YYYY-MM-DD): a term is over and a page is old as of it. */
  builtOn: string | null;
  items: AnswerCard[];
}

export interface CardListing {
  datasetVersion: string;
  identityHash: string;
  /** False for a release built without cards. */
  joined: boolean;
  cards: CardSet | null;
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

const STATUSES: readonly string[] = ['ready', 'needs_look', 'date_passed'];
const ROLES: readonly string[] = ['winner', 'owner_page', 'mentions', 'left_out'];
const words = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function readCard(raw: unknown): AnswerCard | null {
  if (!isRaw(raw) || !Array.isArray(raw.members)) return null;
  const id = text(raw.id);
  const status = text(raw.status);
  if (!id || !status || !STATUSES.includes(status)) return null;
  const members: CardMember[] = [];
  for (const item of raw.members) {
    const recordId = isRaw(item) ? text(item.record_id) : null;
    const key = isRaw(item) ? text(item.key) : null;
    const role = isRaw(item) ? text(item.role) : null;
    if (!isRaw(item) || !recordId || !key || !role || !ROLES.includes(role)) continue;
    const why = text(item.why);
    members.push({
      recordId,
      key,
      role: role as CardRole,
      why: why === 'over' || why === 'old' ? why : null,
      label: text(item.label),
    });
  }
  if (members[0]?.role !== 'winner') return null;
  return {
    id,
    status: status as CardStatus,
    flags: words(raw.flags),
    notes: words(raw.notes),
    owners: words(raw.owners),
    members,
  };
}

function readCards(raw: unknown): CardSet | null {
  if (!isRaw(raw) || !Array.isArray(raw.items)) return null;
  const items: AnswerCard[] = [];
  for (const item of raw.items) {
    const card = readCard(item);
    if (card) items.push(card);
  }
  return { builtOn: text(raw.built_on), items };
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
  const cards = readCards(body.cards);
  return {
    datasetVersion,
    identityHash,
    joined: cards !== null,
    cards,
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

/** What the bot would say from one card, written by code, or why code does not answer from it. */
export interface CardAnswer {
  cardId: string;
  /** The reply as the chat would show it, sources included; null when code does not answer. */
  text: string | null;
  /** Why code does not answer: needs_look, date_changed, no_steps, too_long, no_page or check. */
  notSaid: string | null;
  /** The term or date the card is for, as it stands today, when it is over. */
  overNow: string | null;
}

/** The Brain's one-card reply, or null when it is not one. */
export function readCardAnswer(body: unknown): CardAnswer | null {
  if (!isRaw(body) || !isRaw(body.card)) return null;
  const cardId = text(body.card.id);
  if (!cardId) return null;
  const said = isRaw(body.answer) ? text(body.answer.text) : null;
  const notSaid = text(body.not_said);
  if (!said && !notSaid) return null;
  return { cardId, text: said, notSaid: said ? null : notSaid, overNow: text(body.card.over_now) };
}

/** In plain words, why code does not answer from a card. Every such card stays with today's path. */
export function notSaidReason(answer: CardAnswer, steps: number): string {
  switch (answer.notSaid) {
    case 'needs_look':
      return 'This card needs a look first, so code does not answer from it.';
    case 'date_changed':
      return answer.overNow
        ? `Its date passed after the cards were built (${answer.overNow}). The next graph build updates the card.`
        : 'Its date is no longer past since the cards were built. The next graph build updates the card.';
    case 'no_steps':
      return 'The winning page gave this task no steps to say.';
    case 'too_long':
      return `This task has ${plural(steps, 'step')}, more than 12. That is a table, not a how-to, so code does not read it all out.`;
    case 'no_page':
      return 'The winning page has no address to cite.';
    case 'check':
      return 'The answer held a number, an address or a phone that the card’s facts do not hold, so code does not say it.';
    default:
      return 'Code does not answer from this card.';
  }
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

/** One task of a card, with the page it is on. */
export interface CardPlace {
  member: CardMember;
  row: TaskRow;
}

/** One card with its tasks beside it: what a tile shows and what opening it needs. */
export interface CardRow {
  card: AnswerCard;
  /** The task whose steps the card says. */
  winner: TaskRow;
  /** Every task of the card the list holds, the winner first. */
  places: CardPlace[];
  /** The owner offices' names. */
  owners: string[];
  /** How many different pages its tasks are on. */
  pages: number;
  /** The winning task's name, lower case. A search word here ranks the card first. */
  name: string;
  /** Every word the card can be found by, lower case. */
  words: string;
}

/** Every card with its tasks, in the Brain's order. A card whose winning task the list does not
 * hold is left out; so is any other task of a card that the list does not hold. */
export function cardRows(listing: CardListing): CardRow[] {
  if (!listing.cards) return [];
  const names = nodeNames(listing);
  const rows = new Map(taskRows(listing).map((row) => [row.id, row]));
  const found: CardRow[] = [];
  for (const card of listing.cards.items) {
    const places: CardPlace[] = [];
    for (const member of card.members) {
      const row = rows.get(`${member.recordId}:${member.key}`);
      if (row) places.push({ member, row });
    }
    if (places[0]?.member.role !== 'winner') continue;
    const owners = card.owners.flatMap((id) => names.get(id) ?? []);
    found.push({
      card,
      winner: places[0].row,
      places,
      owners,
      pages: new Set(places.map((place) => place.row.page.recordId)).size,
      name: places[0].row.name,
      words: [...owners, ...places.map((place) => place.row.words)].join(' ').toLowerCase(),
    });
  }
  return found;
}

export interface CardFilter {
  query: string;
  /** Keeps the cards this node owns, and the cards with a task on a page it links. */
  node: string | null;
  status: CardStatus | null;
  /** Keeps only the cards joined from two or more tasks. */
  joinedOnly: boolean;
}

/**
 * The cards a search shows. Every word of `query` must be somewhere in the card (any of its
 * tasks, pages or owners); cards with every word in the winning task's name come first.
 */
export function filterCards(rows: CardRow[], filter: CardFilter): CardRow[] {
  const wanted = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  const node = filter.node;
  const kept = rows.filter(
    (row) =>
      (!filter.status || row.card.status === filter.status) &&
      (!filter.joinedOnly || row.places.length > 1) &&
      (!node || row.card.owners.includes(node) || row.places.some((place) => place.row.page.nodes.includes(node))) &&
      wanted.every((word) => row.words.includes(word))
  );
  if (!wanted.length) return kept;
  const inName = (row: CardRow) => wanted.every((word) => row.name.includes(word));
  return [...kept.filter(inName), ...kept.filter((row) => !inName(row))];
}

/** How many cards have each status. */
export function statusCounts(rows: CardRow[]): Record<CardStatus, number> {
  const counts: Record<CardStatus, number> = { ready: 0, needs_look: 0, date_passed: 0 };
  for (const row of rows) counts[row.card.status] += 1;
  return counts;
}

export const STATUS_LABELS: Record<CardStatus, string> = {
  ready: 'Ready',
  needs_look: 'Needs a look',
  date_passed: 'Date passed',
};

/** Why a card needs a look, one plain sentence per flag. */
export function flagReasons(row: CardRow): string[] {
  const reasons: string[] = [];
  for (const flag of row.card.flags) {
    if (flag === 'owner_unclear') {
      reasons.push(
        row.owners.length > 1
          ? `Its pages do not settle who handles it: ${row.owners.join(', ')}.`
          : 'Its pages do not settle who handles it.'
      );
    } else if (flag === 'no_date') {
      reasons.push(
        row.pages > 1
          ? `None of its ${row.pages} pages carries a date, so the newest cannot be told.`
          : 'Its page carries no date, so its age cannot be told.'
      );
    } else if (flag === 'big_group') {
      reasons.push(`A big group of ${row.places.length} tasks. It may hold more than one task.`);
    } else {
      reasons.push(`Flagged: ${flag}.`);
    }
  }
  return reasons;
}

/** Why one task of a card is not the one the card says. */
export function placeReason(place: CardPlace): string {
  const { member, row } = place;
  const changed = row.page.updated ? `changed ${formatDay(row.page.updated)}` : 'no date on the page';
  if (member.role === 'left_out' && member.why === 'over') {
    return `Past term or date: ${member.label ?? row.task.term ?? 'over'}`;
  }
  if (member.role === 'left_out') return `Old page, ${changed}`;
  if (member.role === 'winner' && member.label) return `Its date passed: ${member.label}`;
  return changed.charAt(0).toUpperCase() + changed.slice(1);
}

/** The one line under a card's name on its tile, and whether it is a warning. */
export function cardLine(row: CardRow): { text: string; warns: boolean } {
  const { card, places, winner } = row;
  if (card.status === 'date_passed') {
    const label = places[0].member.label ?? winner.task.term;
    return { text: label ? `Its date passed: ${label}.` : 'Its date passed.', warns: false };
  }
  if (card.status === 'needs_look') return { text: flagReasons(row).join(' '), warns: true };
  const over = places.filter((place) => place.member.why === 'over').length;
  const old = places.filter((place) => place.member.why === 'old').length;
  const left = [
    over ? `${plural(over, 'past-term page')}` : '',
    old ? `${plural(old, 'old page')}` : '',
  ].filter(Boolean);
  if (left.length) return { text: `${left.join(' and ')} left out.`, warns: false };
  if (card.notes.includes('old_page') && winner.page.updated) {
    return { text: `Its page last changed ${formatDay(winner.page.updated)}, three or more years ago.`, warns: false };
  }
  return {
    text: winner.page.updated ? `Page changed ${formatDay(winner.page.updated)}.` : 'No date on the page.',
    warns: false,
  };
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
