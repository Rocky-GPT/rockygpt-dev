'use client';

import type { JevDecision } from '@/lib/jev-route';

const SURE = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
const UNSURE = 'border-amber-500/30 bg-amber-500/10 text-amber-300';

/**
 * What the new Brain's Jev decided for one turn: the route and how sure it was, each
 * thing Jev read with its answer, and what code did with it. Amber marks a pick under
 * 90%, which the Brain still followed (Dan, 09-29).
 */
export function JevCard({ decision }: { decision: JevDecision }) {
  const { route, routePercent, skipped, readings, codeDid, costUsd, ms } = decision;
  return (
    <div className="rounded-xl border border-border bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">
          {route ? (
            <>
              Jev picked <span className="text-sky-300">{route.label}</span>
            </>
          ) : skipped ? (
            'Jev didn’t run'
          ) : (
            'No route'
          )}
        </p>
        {routePercent !== undefined && (
          <span
            title="How sure Jev was of the least sure pick on the way to this route"
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              routePercent < 90 ? UNSURE : SURE
            }`}
          >
            {routePercent}% sure
          </span>
        )}
        {(ms !== undefined || costUsd !== undefined) && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {ms !== undefined && `${ms} ms`}
            {ms !== undefined && costUsd !== undefined && ' · '}
            {costUsd !== undefined && `$${costUsd.toFixed(5)}`}
          </span>
        )}
      </div>

      {skipped && <p className="mt-2 text-sm leading-6 text-muted-foreground">{skipped}.</p>}

      {readings.length > 0 && (
        <dl className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {readings.map((reading) => (
            <div key={reading.label} className="flex items-center gap-3 py-1.5 text-xs">
              <dt className="w-44 shrink-0 text-muted-foreground">{reading.label}</dt>
              <dd className="min-w-0 flex-1 text-foreground">{reading.answer}</dd>
              <dd
                className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10px] ${
                  reading.low ? UNSURE : 'border-white/10 text-muted-foreground'
                }`}
              >
                {reading.percent}%
              </dd>
            </div>
          ))}
        </dl>
      )}

      {codeDid && <p className="mt-3 text-xs leading-5 text-muted-foreground">{codeDid}</p>}
    </div>
  );
}
