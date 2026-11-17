/**
 * The laptop Brain's monthly spending allowance, as its GET /v1/dev/budget reports it.
 *
 * The Brain admits every paid call against a ledger: a call first holds its worst-case cost,
 * then settles to what it really cost. A hold that never settled ("uncertain") still counts.
 * So what is left = the cap + the month's extra - this month's settled costs - every open hold.
 * The page reads it from the Brain because only the Brain's role may read that ledger.
 */

const NUSD_PER_DOLLAR = 1e9;

export interface Budget {
  month: string;
  paused: boolean;
  allowance: number;
  cap: number;
  extra: number;
  settled: number;
  held: number;
  reservedCalls: number;
  uncertainCalls: number;
  left: number;
  checkedAt: string;
}

function dollars(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value / NUSD_PER_DOLLAR : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** The Brain's reply read into dollars, or null when it is not a budget. */
export function readBudget(body: unknown): Budget | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const allowance = dollars(raw.allowanceNusd);
  const cap = dollars(raw.capNusd);
  const extra = dollars(raw.extraNusd);
  const settled = dollars(raw.settledNusd);
  const held = dollars(raw.heldNusd);
  const left = dollars(raw.leftNusd);
  if (allowance === null || cap === null || extra === null || settled === null || held === null || left === null) {
    return null;
  }
  if (typeof raw.month !== 'string') return null;
  return {
    month: raw.month,
    paused: raw.paused === true,
    allowance,
    cap,
    extra,
    settled,
    held,
    reservedCalls: count(raw.reservedCalls),
    uncertainCalls: count(raw.uncertainCalls),
    left,
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : new Date().toISOString(),
  };
}

/** "November" for "2026-11-01". */
export function monthName(month: string): string {
  const [year, number] = month.split('-').map(Number);
  if (!year || !number) return month;
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
}

export type BudgetFit = 'fits' | 'over' | 'empty' | 'paused';

/** Whether a run that should cost about `runDollars` fits what is left. */
export function budgetFit(budget: Budget, runDollars: number): BudgetFit {
  if (budget.paused) return 'paused';
  if (budget.left <= 0) return 'empty';
  return runDollars > budget.left ? 'over' : 'fits';
}

/** Shares of the allowance for the bar (0 to 100 each, never more than 100 together). */
export function budgetBar(budget: Budget, runDollars: number): { settled: number; held: number; run: number } {
  if (budget.allowance <= 0) return { settled: 0, held: 0, run: 0 };
  const share = (value: number) => (value / budget.allowance) * 100;
  const settled = Math.min(100, share(budget.settled));
  const held = Math.min(100 - settled, share(budget.held));
  const run = Math.min(100 - settled - held, share(Math.max(0, runDollars)));
  return { settled, held, run };
}
