/**
 * @module lib/timing-groups
 * Groups the measured steps of one turn into a handful of categories a person can read at a
 * glance: how long the AI model took, how long the spending ledger took, how long the campus
 * lookup took, and the rest. A turn has dozens of tiny steps; the full list stays available,
 * but these totals and the in-order timeline are what the Trace tab leads with.
 *
 * Nothing here changes a measurement. Every step lands in exactly one category, so the category
 * totals always add up to the sum of the steps.
 */

export type TimingCategory = 'model' | 'ledger' | 'lookup' | 'brain' | 'network' | 'unrecorded';

export interface TimingStep {
  label: string;
  durationUs: number;
  status?: string;
}

export interface TimingSegment {
  category: TimingCategory;
  durationUs: number;
  /** How many consecutive measured steps this segment joins. */
  steps: number;
  /** Too short to see on the timeline; drawn as a hairline. */
  tiny: boolean;
}

export interface TimingTotal {
  category: TimingCategory;
  durationUs: number;
  /** 0 to 1 of the turn's total. */
  share: number;
}

export interface TimingSummary {
  totalUs: number;
  segments: TimingSegment[];
  totals: TimingTotal[];
  slowest: Array<TimingStep & { category: TimingCategory }>;
}

/** A segment below this share of the turn is drawn as a hairline instead of a block. */
export const TINY_SHARE = 0.005;

export const CATEGORY_LABELS: Record<TimingCategory, string> = {
  model: 'AI model',
  ledger: 'Spending ledger',
  lookup: 'Campus lookup',
  brain: 'Brain code',
  network: 'Browser and network',
  unrecorded: 'Not recorded',
};

export const CATEGORY_HELP: Record<TimingCategory, string> = {
  model: 'The wait for the AI provider, including its network round trip.',
  ledger: 'Reserving and settling each model call against the monthly allowance in the ledger database.',
  lookup: 'Walking Ramapo → Offices → the office and reading its published records.',
  brain: 'Everything else the Brain does: preparing, checking, composing and encoding.',
  network: 'Preparing the request, the trip through the Dev UI proxy, and decoding the reply.',
  unrecorded: 'Time the Brain did not report a breakdown for.',
};

/** Soft, translucent fills that sit quietly on the dark UI. Static class names, so Tailwind sees them. */
export const CATEGORY_COLORS: Record<TimingCategory, string> = {
  model: 'bg-violet-400/45',
  ledger: 'bg-orange-400/45',
  lookup: 'bg-emerald-400/50',
  brain: 'bg-slate-400/35',
  network: 'bg-sky-400/45',
  unrecorded: 'bg-rose-400/40',
};

/** The same hues a little stronger, for the small swatches that name each colour. */
export const CATEGORY_SWATCHES: Record<TimingCategory, string> = {
  model: 'bg-violet-400/80',
  ledger: 'bg-orange-400/80',
  lookup: 'bg-emerald-400/80',
  brain: 'bg-slate-400/70',
  network: 'bg-sky-400/80',
  unrecorded: 'bg-rose-400/75',
};

const ORDER: TimingCategory[] = ['model', 'ledger', 'lookup', 'brain', 'network', 'unrecorded'];

const UNRECORDED = /breakdown unavailable|Brain timing unavailable|Read response until failure/;
const MODEL = /Provider request/;
const LEDGER = /Reserve model allowance|Release unused model allowance|Settle model usage|Record uncertain model charge|Pause model spending/;
const LOOKUP = /^Lookup \d+|^Look up emergency contacts|Read emergency contact evidence|^Open root|^Match office|^Open Offices|^Open matched office|^Render verified evidence/;
const NETWORK = /^(Prepare browser request|Transport, Dev UI proxy and browser wait|Read response body in browser|Decode response and prepare display)/;

export function categoryOf(label: string): TimingCategory {
  if (UNRECORDED.test(label)) return 'unrecorded';
  if (MODEL.test(label)) return 'model';
  if (LEDGER.test(label)) return 'ledger';
  if (LOOKUP.test(label)) return 'lookup';
  if (NETWORK.test(label)) return 'network';
  return 'brain';
}

/** "9.07 s", "63.5 ms", "0.226 ms": the unit that reads best for the size. */
export function formatDuration(us: number): string {
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)} s`;
  if (us >= 10_000) return `${(us / 1_000).toFixed(1)} ms`;
  if (us >= 1_000) return `${(us / 1_000).toFixed(2)} ms`;
  return `${(us / 1_000).toFixed(3)} ms`;
}

export function percent(share: number): string {
  if (share >= 0.1) return `${Math.round(share * 100)}%`;
  if (share >= 0.001) return `${(share * 100).toFixed(1)}%`;
  return '<0.1%';
}

export function summarizeTiming(steps: TimingStep[], slowestCount = 5): TimingSummary {
  const totalUs = steps.reduce((sum, step) => sum + step.durationUs, 0);
  const share = (us: number) => (totalUs > 0 ? us / totalUs : 0);

  const segments: TimingSegment[] = [];
  for (const step of steps) {
    const category = categoryOf(step.label);
    const last = segments[segments.length - 1];
    if (last && last.category === category) {
      last.durationUs += step.durationUs;
      last.steps += 1;
    } else {
      segments.push({ category, durationUs: step.durationUs, steps: 1, tiny: false });
    }
  }
  for (const segment of segments) segment.tiny = share(segment.durationUs) < TINY_SHARE;

  const byCategory = new Map<TimingCategory, number>();
  for (const step of steps) {
    const category = categoryOf(step.label);
    byCategory.set(category, (byCategory.get(category) ?? 0) + step.durationUs);
  }
  const totals = ORDER.filter(category => byCategory.has(category))
    .map(category => ({ category, durationUs: byCategory.get(category) ?? 0,
      share: share(byCategory.get(category) ?? 0) }))
    .sort((a, b) => b.durationUs - a.durationUs);

  const slowest = steps.filter(step => step.durationUs > 0)
    .map(step => ({ ...step, category: categoryOf(step.label) }))
    .sort((a, b) => b.durationUs - a.durationUs)
    .slice(0, slowestCount);

  return { totalUs, segments, totals, slowest };
}
