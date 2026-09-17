'use client';

/**
 * @module components/CapabilityExplorer
 * The registry, and what each of its lookups actually returns.
 *
 * One table, and a row of capabilities above it that changes what is in the
 * table. The registry is the thing itself, fetched from the brain: every entry
 * here is one BRAIN #2 may name, and an entry exists only when there is code
 * behind it, so this doubles as the list of lookups that can run.
 *
 * The records come from the capability's own executor with nothing narrowing
 * it — the same request translation and the same field projection a real turn
 * gets. Reading the underlying data endpoint instead would show columns Rocky
 * cannot actually reach.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Filter as FilterIcon,
  ListOrdered,
  X,
} from 'lucide-react';

/**
 * One way a lookup can be narrowed.
 *
 * The student app declared this `string[]`, which crashed the page: React threw
 * "Objects are not valid as a React child" the moment a filter was rendered,
 * and every row keyed to `[object Object]` on the way. The brain has always
 * sent objects — the type was simply wrong — and the extra fields are the
 * useful part. `values` is the enum a filter accepts and `entity` is the kind
 * it resolves against, which is exactly what you need when a plan comes back
 * carrying a filter the executor rejected.
 */
export interface CapabilityFilter {
  field: string;
  type: string;
  values?: string[];
  entity?: string;
  description?: string;
}

export interface Capability {
  capability: string;
  describes: string;
  filters: CapabilityFilter[];
  fields: string[];
}

interface Records {
  returned: number;
  records: Record<string, unknown>[];
}

export function CapabilityExplorer({ capabilities }: { capabilities: Capability[] }) {
  const [chosen, setChosen] = useState(capabilities[0]?.capability ?? '');
  const [state, setState] = useState<Records | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const entry = useMemo(
    () => capabilities.find((one) => one.capability === chosen),
    [capabilities, chosen]
  );

  const load = useCallback(async () => {
    if (!chosen) return;
    // Cleared first, so the table never shows one capability's rows under
    // another's heading while the next lookup is in flight.
    setState(null);
    setFailed(null);
    try {
      const response = await fetch(`/api/brain/capabilities/${chosen}/records`, {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) {
        // The brain's own refusal, unreworded. Its "There is no 'shuttle'
        // capability." is the fastest way to learn that the registry name is
        // `transportation` and the alias does not resolve on this route.
        throw new Error(body?.error?.message ?? body?.error ?? `HTTP ${response.status}`);
      }
      setState(body as Records);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'The lookup did not answer.');
    }
  }, [chosen]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {capabilities.map((one) => (
          <button
            key={one.capability}
            type="button"
            onClick={() => setChosen(one.capability)}
            aria-pressed={one.capability === chosen}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
              one.capability === chosen
                ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
                : 'border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-foreground'
            }`}
          >
            {one.capability}
          </button>
        ))}
      </div>

      {entry && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-foreground/80">{entry.describes}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FilterChips filters={entry.filters} />
            <FieldChips names={entry.fields} />
          </div>
        </div>
      )}

      <RecordTable state={state} failed={failed} />
    </div>
  );
}

/**
 * The records, as a table whose columns are the union of every row's keys.
 *
 * Exported because the Records page browses the same executor output for every
 * capability at once, and a second table that derived its columns differently
 * would disagree with this one about what a capability returns.
 */
export function RecordTable({
  state,
  failed,
}: {
  state: { returned: number; records: Record<string, unknown>[] } | null;
  failed: string | null;
}) {
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  if (failed) {
    return (
      <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 font-mono text-sm text-red-200">
        {failed}
      </p>
    );
  }
  if (!state) {
    return <p className="px-1 text-sm text-muted-foreground">Looking it up…</p>;
  }
  if (state.records.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
        The lookup ran and returned nothing. That is an answer rather than a
        failure — there is none of this right now.
      </p>
    );
  }

  const columns = [...new Set(state.records.flatMap((row) => Object.keys(row)))];
  const needle = search.trim().toLowerCase();
  // Filtered here rather than upstream because the brain's records route takes
  // no parameters at all — no limit, no offset, no filter. Everything arrives
  // or nothing does.
  const filteredRows = needle
    ? state.records.filter((row) =>
        columns.some((column) => format(row[column]).toLowerCase().includes(needle))
      )
    : state.records;

  const rows = sortColumn
    ? [...filteredRows].sort((rowA, rowB) => {
        const cmp = compareValues(rowA[sortColumn], rowB[sortColumn]);
        return sortDirection === 'asc' ? cmp : -cmp;
      })
    : filteredRows;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {state.returned.toLocaleString()} record{state.returned === 1 ? '' : 's'}
          {needle && rows.length !== state.records.length && ` · ${rows.length} shown`}
        </p>
        {sortColumn && (
          <div className="flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 font-mono text-[11px] text-sky-200">
            <span>
              Sorted by <strong className="font-semibold text-white">{sortColumn}</strong> ({sortDirection === 'asc' ? 'Asc ↑' : 'Desc ↓'})
            </span>
            <button
              type="button"
              onClick={() => setSortColumn(null)}
              className="ml-0.5 rounded p-0.5 text-sky-400 hover:bg-sky-400/20 hover:text-white"
              title="Clear sorting"
              aria-label="Clear sorting"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter rows…"
          className="ml-auto w-48 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-white/10">
            <tr>
              {columns.map((column) => {
                const isSorted = sortColumn === column;
                return (
                  <th
                    key={column}
                    aria-sort={
                      isSorted
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className="whitespace-nowrap px-3 py-2 font-mono font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column)}
                      className={`group inline-flex items-center gap-1.5 transition-colors ${
                        isSorted
                          ? 'text-sky-300 font-bold'
                          : 'text-foreground/70 hover:text-foreground'
                      }`}
                      title={`Sort by ${column} (${
                        isSorted
                          ? sortDirection === 'asc'
                            ? 'currently ascending, click for descending'
                            : 'currently descending, click to clear'
                          : 'click to sort ascending'
                      })`}
                    >
                      <span>{column}</span>
                      {isSorted ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-sky-400" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-sky-400" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground/30 transition-opacity group-hover:text-muted-foreground" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-white/5 hover:bg-white/5">
                {columns.map((column) => (
                  <td key={column} className="max-w-[22rem] truncate px-3 py-2 text-foreground/70">
                    {format(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** What a lookup can be narrowed by, with the type and target each filter carries. */
function FilterChips({ filters }: { filters: CapabilityFilter[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <FilterIcon aria-hidden="true" className="h-3 w-3" />
        narrow by
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {filters.map((filter) => {
          const hasValues = Array.isArray(filter.values) && filter.values.length > 0;
          const open = expanded === filter.field;
          return (
            <li key={filter.field} className="max-w-full">
              <button
                type="button"
                disabled={!hasValues}
                onClick={() => setExpanded(open ? null : filter.field)}
                title={filter.description}
                className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] text-emerald-200 disabled:cursor-default"
              >
                <span>{filter.field}</span>
                <span className="text-emerald-200/50">{filter.type}</span>
                {filter.entity && <span className="text-emerald-200/50">→ {filter.entity}</span>}
                {hasValues && (
                  <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                )}
              </button>
              {/* Inline, an enum swamps the card — `calendar.kind` alone has
                  fourteen values — so the list is a click away rather than
                  absent. */}
              {open && hasValues && (
                <ul className="mt-1 flex flex-wrap gap-1 pl-2">
                  {filter.values!.map((value) => (
                    <li
                      key={value}
                      className="rounded border border-emerald-400/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200/70"
                    >
                      {value}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The fields a lookup can sort, compare, and read. Plain names. */
function FieldChips({ names }: { names: string[] }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ListOrdered aria-hidden="true" className="h-3 w-3" />
        sort, compare, read
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {names.map((name) => (
          <li
            key={name}
            className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 font-mono text-[11px] text-violet-200"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    /^-?\d+(\.\d+)?$/.test(a.trim()) &&
    /^-?\d+(\.\d+)?$/.test(b.trim())
  ) {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
  }

  if (typeof a === 'string' && typeof b === 'string') {
    const isDateA = /^\d{4}-\d{2}-\d{2}/.test(a);
    const isDateB = /^\d{4}-\d{2}-\d{2}/.test(b);
    if (isDateA && isDateB) {
      const dateA = Date.parse(a);
      const dateB = Date.parse(b);
      if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
        return dateA - dateB;
      }
    }
  }

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1;
  }

  const strA = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const strB = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}
