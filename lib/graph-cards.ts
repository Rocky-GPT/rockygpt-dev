/**
 * Plain helpers behind the Campus Graph's per-type cards. Everything a card shows is read from
 * the Brain's whole-graph reader (`GET /v1/dev/graph/browse`): the node, its links both ways, the
 * rows of the records it links (`facts`), and a short `brief` on each linked node. Nothing here
 * invents a value; a helper that cannot read one returns null, and the card shows an empty spot.
 */

export interface CardBrief {
  title?: string;
  image_url?: string;
  credits?: number;
  date?: string;
  start?: string;
  end?: string;
  where?: string;
}

export interface CardNode {
  id: string;
  label: string;
  kind: string;
  entity_id?: string;
  aliases?: string[];
  count?: number;
  brief?: CardBrief;
}

export interface CardLink {
  type: string;
  node: CardNode | null;
  missing_id?: string | null;
  record?: { collection: string; source_key: string; source_record_key: string };
  sources: string[];
}

export interface CardFacts {
  collection: string;
  total: number;
  rows: Array<Record<string, unknown>>;
  /** A venue's menu: every day it has a menu for, and the day these rows are. */
  dates?: string[];
  date?: string;
  /** The release holds this node but not its kind's records yet, so these rows could not be read. */
  unavailable?: boolean;
}

export interface CardRead {
  dataset_version: string;
  identity_hash: string;
  node: CardNode;
  path: CardNode[];
  status?: string | null;
  records?: Array<{ collection: string; source_key: string; count: number }>;
  facts?: CardFacts[];
  outgoing?: CardLink[];
  incoming?: CardLink[];
  evidence_node?: string | null;
}

/** One color per node type, shared by chips, bubbles and card headers. */
export const KIND_COLORS: Record<string, string> = {
  person: '#a78bfa',
  course: '#34d399',
  subject: '#4ade80',
  program: '#2dd4bf',
  school: '#60a5fa',
  building: '#fbbf24',
  venue: '#fb923c',
  office: '#38bdf8',
  facility: '#22d3ee',
  club: '#f472b6',
  organization: '#e879f9',
  event: '#fb7185',
  term: '#c084fc',
  calendar_date: '#f9a8d4',
  topic: '#94a3b8',
  route: '#facc15',
};

export function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? '#a1a1aa';
}

/** "calendar_date" -> "calendar date". */
export function kindName(kind: string): string {
  return kind.replace(/_/g, ' ');
}

export function factsOf(read: CardRead, collection: string): CardFacts | null {
  return read.facts?.find(fact => fact.collection === collection) ?? null;
}

export function rowsOf(read: CardRead, collection: string): Array<Record<string, unknown>> {
  return factsOf(read, collection)?.rows ?? [];
}

export function firstRow(read: CardRead, collection: string): Record<string, unknown> | null {
  return rowsOf(read, collection)[0] ?? null;
}

export function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => item !== null) : [];
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** The catalog writes course names in capitals ("DATA SCIENCE CAPSTONE PROJECT"). */
export function titleCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  return value.toLowerCase().split(/(\s+)/).map((word, index) => {
    if (/^\s+$/.test(word)) return word;
    if (/^(i|ii|iii|iv|v|vi)$/.test(word)) return word.toUpperCase();
    if (index > 0 && small.has(word)) return word;
    return word.replace(/^([("'&]*)(\p{L})/u, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  }).join('');
}

/** Every link of a node, both ways, with its direction. */
export function allLinks(read: CardRead): Array<CardLink & { direction: 'out' | 'in' }> {
  return [
    ...(read.outgoing ?? []).map(link => ({ ...link, direction: 'out' as const })),
    ...(read.incoming ?? []).map(link => ({ ...link, direction: 'in' as const })),
  ];
}

/** The linked nodes of one link type and direction, optionally of one kind. */
export function linked(read: CardRead, direction: 'out' | 'in', types: string | string[], kind?: string): CardNode[] {
  const wanted = Array.isArray(types) ? types : [types];
  const links = direction === 'out' ? read.outgoing ?? [] : read.incoming ?? [];
  const seen = new Set<string>();
  const found: CardNode[] = [];
  for (const link of links) {
    if (!wanted.includes(link.type) || !link.node || (kind && link.node.kind !== kind)) continue;
    if (seen.has(link.node.id)) continue;
    seen.add(link.node.id);
    found.push(link.node);
  }
  return found;
}

/** Plain words for a link seen from the card's own node. */
const LINK_WORDS: Record<string, { out: string; in: string }> = {
  teaches_course: { out: 'teaches', in: 'taught by' },
  profile_course: { out: 'teaches', in: 'taught by' },
  part_of: { out: 'part of', in: 'members' },
  office_at: { out: 'office in', in: 'faculty offices' },
  listed_faculty: { out: 'faculty', in: 'teaches in' },
  convener: { out: 'led by', in: 'leads' },
  includes_course: { out: 'courses', in: 'subject' },
  organized_by: { out: 'hosted by', in: 'events' },
  located_at: { out: 'located in', in: 'inside' },
  in_term: { out: 'term', in: 'dates' },
  requires: { out: 'requires', in: 'needed for' },
};

export function plural(word: string): string {
  return /(s|x|ch|sh)$/.test(word) ? `${word}es` : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
}

export function linkWords(type: string, direction: 'out' | 'in', kind?: string): string {
  const words = LINK_WORDS[type]?.[direction];
  if ((type === 'part_of' || type === 'located_at') && direction === 'in' && kind) return kind === 'venue' ? 'food' : plural(kindName(kind));
  return words ?? `${direction === 'in' ? '← ' : ''}${type.replace(/_/g, ' ')}`;
}

export interface LinkGroup {
  key: string;
  label: string;
  kind: string;
  nodes: CardNode[];
  /** Links to a record no node owns (a course code the catalog does not list). */
  missing: number;
}

/** Links grouped by type, direction and the other node's kind, in first-seen order. */
export function linkGroups(read: CardRead): LinkGroup[] {
  const groups = new Map<string, LinkGroup>();
  for (const link of allLinks(read)) {
    const kind = link.node?.kind ?? link.record?.collection ?? 'missing';
    const key = `${link.direction}:${link.type}:${kind}`;
    const group = groups.get(key) ?? { key, label: linkWords(link.type, link.direction, kind), kind, nodes: [], missing: 0 };
    if (link.node) {
      if (!group.nodes.some(node => node.id === link.node!.id)) group.nodes.push(link.node);
    } else group.missing += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/* ---------- Dates and times, on campus (New York) ---------- */

const CAMPUS = 'America/New_York';

/** The campus calendar day ("2026-11-02") and weekday ("Monday") at an instant. */
export function campusToday(now: Date = new Date()): { date: string; weekday: string; minutes: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPUS, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** "08:00 AM", "10am", "7:30 pm", "noon" -> minutes after midnight. */
export function clockMinutes(value: string): number | null {
  const clean = value.trim().toLowerCase().replace(/\./g, '');
  if (clean === 'noon') return 12 * 60;
  if (clean === 'midnight') return 24 * 60;
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(clean);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === 'pm') hour += 12;
  return hour * 60 + Number(match[2] ?? 0);
}

export interface HoursSpan { label: string | null; from: number; to: number; text: string }

/**
 * A published schedule line as spans: "Breakfast: 08:00 AM - 10:30 AM; Lunch: 11:00 AM - 02:00 PM"
 * or "10:00am-5:00pm". A line it cannot read (e.g. "Hours unavailable") gives no spans.
 */
export function hoursSpans(schedule: string): HoursSpan[] {
  const spans: HoursSpan[] = [];
  for (const piece of schedule.split(/;\s*/)) {
    const match = /^(?:([^:]*[a-z][^:]*?):\s*)?(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?|noon)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?|noon|midnight)\s*$/i.exec(piece.trim());
    if (!match) continue;
    const from = clockMinutes(match[2]);
    let to = clockMinutes(match[3]);
    if (from === null || to === null) continue;
    if (to <= from) to += 24 * 60;
    spans.push({ label: match[1]?.trim() ?? null, from, to, text: `${match[2].trim()} – ${match[3].trim()}` });
  }
  return spans;
}

export interface OpenState { open: boolean; label: string | null; until: string | null; next: HoursSpan | null }

/** Open right now, and until when, from today's schedule line; null when the line has no times. */
export function openNow(schedule: string, minutes: number): OpenState | null {
  const spans = hoursSpans(schedule);
  if (!spans.length) return null;
  const current = spans.find(span => minutes >= span.from && minutes < span.to);
  const next = spans.find(span => span.from > minutes) ?? null;
  if (current) return { open: true, label: current.label, until: current.text.split(' – ')[1], next };
  return { open: false, label: null, until: null, next };
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface DayHours { day: string; schedule: string; notes: string | null; dated: boolean }

/**
 * A week of published hours (campus_hours or dining_hours rows), one line per weekday. A dated row
 * (a holiday or a one-off change) wins on its own day while today falls inside its dates; dated
 * rows that are over are left out.
 */
export function weekHours(rows: Array<Record<string, unknown>>, today: string): DayHours[] {
  const byDay = new Map<string, DayHours>();
  for (const row of rows) {
    const day = text(row.day);
    const schedule = text(row.schedule);
    if (!day || !schedule) continue;
    const from = text(row.valid_from)?.slice(0, 10);
    const until = text(row.valid_until)?.slice(0, 10);
    const dated = Boolean(from || until);
    if (dated && ((from && today < from) || (until && today > until))) continue;
    const existing = byDay.get(day);
    if (existing && existing.dated && !dated) continue;
    byDay.set(day, { day, schedule, notes: text(row.notes), dated });
  }
  return [...byDay.values()].sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day));
}

/** "Girls Night In (2026-11-05)" or "Reading Day (Dec 8, 2026)" -> the date in the name. */
export function dateInName(label: string): string | null {
  const iso = /\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(label);
  if (iso) return iso[1];
  const long = /\(([A-Z][a-z]{2,8} \d{1,2}, \d{4})\)\s*$/.exec(label);
  if (!long) return null;
  const parsed = new Date(`${long[1]} 12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

/** The name without its trailing "(date)". */
export function nameWithoutDate(label: string): string {
  return label.replace(/\s*\((\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8} \d{1,2}, \d{4})\)\s*$/, '');
}

/** "2026-11-05" -> { month: "NOV", day: "5", weekday: "Thu" }. */
export function dayParts(isoDate: string): { month: string; day: string; weekday: string; long: string } {
  const value = new Date(`${isoDate}T12:00:00`);
  return {
    month: value.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(value.getDate()),
    weekday: value.toLocaleDateString('en-US', { weekday: 'short' }),
    long: value.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

/** Whole days from one campus date to another ("in 3 days", "today", "2 days ago"). */
export function daysAway(fromIso: string, toIso: string): string {
  const days = Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Linked events in date order, upcoming first, with the date read from the brief or the name. */
export function datedEvents(nodes: CardNode[], today: string): Array<{ node: CardNode; date: string | null; past: boolean }> {
  const found = nodes.map(node => {
    const fromBrief = node.brief?.date ? new Date(`${node.brief.date} 12:00:00`) : null;
    const briefDate = fromBrief && !Number.isNaN(fromBrief.getTime())
      ? `${fromBrief.getFullYear()}-${String(fromBrief.getMonth() + 1).padStart(2, '0')}-${String(fromBrief.getDate()).padStart(2, '0')}`
      : null;
    const date = briefDate ?? dateInName(node.label);
    return { node, date, past: date !== null && date < today };
  });
  return found.sort((a, b) => Number(a.past) - Number(b.past)
    || (a.past ? (b.date ?? '').localeCompare(a.date ?? '') : (a.date ?? '9999').localeCompare(b.date ?? '9999')));
}

/* ---------- Menus ---------- */

export interface MenuDish { name: string; calories: number | null; vegan: boolean; vegetarian: boolean; allergens: string[]; portion: string | null }
export interface MenuStation { name: string; dishes: MenuDish[] }
export interface MenuMeal { name: string; stations: MenuStation[]; count: number }

const MEAL_ORDER = ['breakfast', 'continental', 'brunch', 'lunch', 'lite lunch', 'dinner', 'late night'];

/** One day's menu rows as meals -> stations -> dishes, meals in the day's order. */
export function menuMeals(rows: Array<Record<string, unknown>>): MenuMeal[] {
  const meals = new Map<string, Map<string, MenuDish[]>>();
  for (const row of rows) {
    const meal = text(row.meal) ?? 'Menu';
    const station = text(row.station) ?? 'Other';
    const name = text(row.name);
    if (!name) continue;
    const stations = meals.get(meal) ?? new Map<string, MenuDish[]>();
    const dishes = stations.get(station) ?? [];
    if (!dishes.some(dish => dish.name === name)) {
      dishes.push({
        name,
        calories: typeof row.calories === 'number' ? row.calories : null,
        vegan: row.vegan === true,
        vegetarian: row.vegetarian === true,
        allergens: texts(row.allergens),
        portion: text(row.portion_size),
      });
    }
    stations.set(station, dishes);
    meals.set(meal, stations);
  }
  const rank = (meal: string) => {
    const index = MEAL_ORDER.indexOf(meal.toLowerCase());
    return index === -1 ? MEAL_ORDER.length : index;
  };
  return [...meals.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([name, stations]) => ({
      name,
      stations: [...stations.entries()].map(([station, dishes]) => ({ name: station, dishes })),
      count: [...stations.values()].reduce((total, dishes) => total + dishes.length, 0),
    }));
}

/* ---------- Catalog ---------- */

export interface Prerequisite { code: string; name: string | null }

/** A course's prerequisite rule as steps; each step is one course or a choice of several. */
export function prerequisiteSteps(course: Record<string, unknown>): Prerequisite[][] {
  const steps: Prerequisite[][] = [];
  for (const requisite of Array.isArray(course.requisites) ? course.requisites : []) {
    const rule = record(record(requisite).rule);
    for (const item of Array.isArray(rule.items) ? rule.items : []) {
      const codes = record(item).codes;
      const step = (Array.isArray(codes) ? codes : [])
        .map(code => ({ code: text(record(code).code) ?? '', name: text(record(code).name) }))
        .filter(code => code.code);
      if (step.length) steps.push(step);
    }
  }
  return steps;
}

export interface RequirementGroup { label: string; rule: string; choose: string; courses: Array<{ code: string; name: string | null; id: string | null }> }

/** A program's requirement_groups rows as labeled course lists ("pick 3", "all of"). */
export function requirementGroups(rows: Array<Record<string, unknown>>): RequirementGroup[] {
  return rows.map(row => {
    const requirement = record(row.requirement);
    const rule = record(requirement.rule);
    const choose = record(rule.choose);
    const courses = (Array.isArray(rule.items) ? rule.items : []).flatMap(item => {
      const listed = record(item).courses;
      return (Array.isArray(listed) ? listed : []).map(course => ({
        code: text(record(course).code) ?? '',
        name: text(record(course).name),
        id: text(record(course).course_id),
      }));
    }).filter(course => course.code);
    const named = /select\s+(\d+)/i.exec(text(rule.name) ?? '');
    const count = typeof choose.at_least === 'number' ? choose.at_least : named ? Number(named[1]) : null;
    return {
      label: text(requirement.label) ?? text(rule.name) ?? 'Requirement',
      rule: text(rule.name) ?? '',
      choose: choose.all === true ? 'all of' : count !== null ? `pick ${count}` : text(rule.name)?.toLowerCase() ?? '',
      courses,
    };
  }).filter(group => group.courses.length > 0);
}

/** A faculty profile's courses ("Undergraduate:\nCMPS 130 Scientific Problem Solving") by level. */
export function profileCourses(courses: string[]): Array<{ level: string; code: string; title: string }> {
  return courses.map(entry => {
    const [first, ...rest] = entry.split('\n');
    const hasLevel = rest.length > 0 && first.trim().endsWith(':');
    const line = (hasLevel ? rest.join(' ') : entry).trim();
    const match = /^([A-Z]{2,5}\s?\d{3}[A-Z]?)\s+(.*)$/.exec(line);
    return {
      level: hasLevel ? first.trim().replace(/:$/, '') : 'Courses',
      code: match ? match[1] : '',
      title: match ? match[2] : line,
    };
  });
}

/** Show a URL without its scheme or trailing slash. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}
