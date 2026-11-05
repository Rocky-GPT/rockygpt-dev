'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatDollars } from '@/lib/laptop-vs-production';
import { budgetBar, budgetFit, monthName, readBudget, type Budget, type BudgetFit } from '@/lib/budget';

/** While a run goes, the budget is read again this often. */
const RUNNING_REFRESH_MS = 30_000;

export interface BudgetState {
  budget: Budget | null;
  problem: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * The laptop Brain's budget for this month. Read when `active` turns on, every 30 seconds while
 * `running`, and once more when a run ends. Nothing is read while `active` is off.
 */
export function useBudget(active: boolean, running: boolean): BudgetState {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/brain/budget', { cache: 'no-store' })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        const read = response.ok ? readBudget(body) : null;
        if (read) {
          setBudget(read);
          setProblem(null);
          return;
        }
        const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
        setProblem(
          response.status === 404
            ? 'This Brain does not report its budget yet. Pull the latest Brain and restart it.'
            : typeof message === 'string'
              ? message
              : `The Brain answered HTTP ${response.status}.`
        );
      })
      .catch(() => setProblem('The Brain is not reachable.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, running, refresh]);

  useEffect(() => {
    if (!active || !running) return;
    const timer = window.setInterval(refresh, RUNNING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, running, refresh]);

  return { budget, problem, loading, refresh };
}

export function leftTone(budget: Budget, fit: BudgetFit): string {
  if (fit !== 'fits') return 'text-red-300';
  return budget.left < budget.allowance * 0.1 ? 'text-amber-300' : 'text-emerald-300';
}

const FIT_WARNINGS: Record<Exclude<BudgetFit, 'fits'>, (left: string, run: string) => string> = {
  over: (left, run) =>
    `This run needs about ${run} but only ${left} is left, so it would stop partway with "budget used up". Ask fewer times, raise this month's extra (your Neon SQL), or pick the Production Brain.`,
  empty: () =>
    'Nothing is left this month, so every answer would come back "budget used up". Raise this month\'s extra (your Neon SQL) or pick the Production Brain.',
  paused: () =>
    'The laptop Brain\'s account is paused (a call cost more than it held), so it admits nothing until it is unpaused.',
};

/** The budget block under the Run button. `runDollars` is the run about to start (0 for none). */
export function BudgetLine({ state, runDollars, laptop }: { state: BudgetState; runDollars: number; laptop: boolean }) {
  const heading = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  if (!laptop) {
    return (
      <p className="text-xs text-muted-foreground">
        Budget left is shown for the laptop Brain only. The production budget is the real site&rsquo;s and stays on that Brain.
      </p>
    );
  }
  const { budget, problem, loading, refresh } = state;
  const refreshButton = (
    <button
      type="button"
      onClick={refresh}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> refresh
    </button>
  );
  if (!budget) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={heading}>Laptop Brain budget</span>
        <span className="flex items-center gap-3 text-xs">
          <span className={problem ? 'text-amber-200' : 'text-muted-foreground'}>{problem ?? 'Reading…'}</span>
          {refreshButton}
        </span>
      </div>
    );
  }
  const fit = budgetFit(budget, runDollars);
  const bar = budgetBar(budget, runDollars);
  const checked = new Date(budget.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={heading}>Laptop Brain budget · {monthName(budget.month)}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          checked {checked} · {refreshButton}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span>
          <span className={`text-lg font-semibold ${leftTone(budget, fit)}`}>{formatDollars(budget.left)}</span>{' '}
          <span className="text-muted-foreground">left of {formatDollars(budget.allowance)}</span>
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-sky-400" />
          spent {formatDollars(budget.settled)}
        </span>
        <span title={`${budget.reservedCalls} calls still going, ${budget.uncertainCalls} that never settled`}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-amber-400" />
          held {formatDollars(budget.held)}{' '}
          <span className="text-xs text-muted-foreground">(calls not settled yet; they count until they are)</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDollars(budget.cap)} base + {formatDollars(budget.extra)} extra for {monthName(budget.month)}
        </span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">
        <i className="block h-full bg-sky-400" style={{ width: `${bar.settled}%` }} />
        <i className="block h-full bg-amber-400" style={{ width: `${bar.held}%` }} />
        <i
          className="block h-full"
          style={{
            width: `${bar.run}%`,
            background: 'repeating-linear-gradient(45deg,#e5e5e5 0 3px,#52525b 3px 6px)',
          }}
        />
      </div>
      {fit === 'fits' ? (
        runDollars > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            The striped bit is this run (about {formatDollars(runDollars)}). After it, about{' '}
            {formatDollars(Math.max(0, budget.left - runDollars))} would be left.
          </p>
        )
      ) : (
        <p className="mt-2 text-xs text-red-300">
          {FIT_WARNINGS[fit](formatDollars(budget.left), formatDollars(runDollars))}
        </p>
      )}
    </div>
  );
}
