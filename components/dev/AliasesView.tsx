'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { ErrorPanel } from '@/components/ErrorPanel';
import {
  lookupProblem,
  lookupToShow,
  MATCH_MEANING,
  outcomeSentence,
  QUERY_MAX_CHARS,
  type Lookup,
} from '@/lib/alias-lookup';
import type { DevOffices, DevSearch } from '@/lib/brain-dev-types';

const DEBOUNCE_MS = 300;

export function AliasesView({ offices }: { offices: DevOffices }) {
  const [text, setText] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [filter, setFilter] = useState('');

  const query = text.trim();
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/brain/offices/search?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as DevSearch | null;
        if (!response.ok) {
          setLookup({ state: 'failed', query, problem: lookupProblem(response.status, body) });
          return;
        }
        if (!body) {
          setLookup({ state: 'failed', query, problem: 'The Brain returned an unreadable response.' });
          return;
        }
        setLookup({ state: 'done', query, result: body });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLookup({
          state: 'failed',
          query,
          problem: error instanceof Error ? error.message : 'The search did not complete.',
        });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const shown = lookupToShow(lookup, query);
  const needle = filter.trim().toLowerCase();
  const rows = needle
    ? offices.offices.filter(
        (office) =>
          office.name.toLowerCase().includes(needle) ||
          office.aliases.some((alias) => alias.toLowerCase().includes(needle))
      )
    : offices.offices;
  const withAliases = offices.offices.filter((office) => office.aliases.length > 0).length;
  const aliasCount = offices.offices.reduce((total, office) => total + office.aliases.length, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-semibold text-foreground">What the office lookup returns for a query</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          This runs the Brain&rsquo;s own office lookup on the text you type. In a chat, the model picks the
          query from the published list below, so this shows what that lookup returns, not a search of a
          student&rsquo;s own words.
        </p>
        <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Career Center, CSI, financial aid…"
            aria-label="Query for the office lookup"
            maxLength={QUERY_MAX_CHARS}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">Up to {QUERY_MAX_CHARS} characters.</p>

        <div className="mt-3 space-y-2 text-xs">
          {shown.state === 'searching' && <p className="text-muted-foreground">Searching…</p>}
          {shown.state === 'failed' && <ErrorPanel title="The lookup failed" detail={shown.problem} />}
          {shown.state === 'done' && <Result result={shown.result} loadedVersion={offices.datasetVersion} />}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-semibold text-foreground">Every office and its aliases</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Code matches the model’s query against these published names and aliases after traversing
          Ramapo → Offices. This inspection page may be truncated independently of the traversal.
          The search below previews the matching rules used by chat.
        </p>
        {offices.truncated && (
          <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            The Brain says this list is cut short, so some offices are missing from it.
          </p>
        )}
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {offices.offices.length} offices · {aliasCount} aliases · {withAliases} offices with aliases ·{' '}
          {offices.offices.length - withAliases} without · data {offices.datasetVersion}
        </p>

        <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by office name or alias"
            aria-label="Filter offices"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {rows.length} of {offices.offices.length}
        </p>

        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Office</th>
                <th className="py-2 font-semibold">Aliases</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((office) => (
                <tr key={office.entityId} className="border-b border-white/5 align-top">
                  <td className="py-2 pr-4 text-foreground">{office.name}</td>
                  <td className="py-2">
                    {office.aliases.length === 0 ? (
                      <span className="text-muted-foreground">no aliases</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {office.aliases.map((alias) => (
                          <span
                            key={alias}
                            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-foreground/80"
                          >
                            {alias}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Result({ result, loadedVersion }: { result: DevSearch; loadedVersion: string }) {
  return (
    <>
      <p className="text-muted-foreground">
        Result for <span className="font-mono text-foreground">{result.query}</span>
      </p>
      <p className="text-sm text-foreground">{outcomeSentence(result)}</p>
      {result.candidates.length > 0 && (
        <ul className="space-y-2">
          {result.candidates.map((candidate) => (
            <li key={candidate.entityId} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{candidate.name}</span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 font-medium ${
                    candidate.match === 'exact'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {candidate.match}
                </span>
              </div>
              <p className="mt-1 leading-5 text-muted-foreground">{MATCH_MEANING[candidate.match]}</p>
            </li>
          ))}
        </ul>
      )}
      {result.truncated && (
        <p className="text-amber-200">The Brain says this result list is cut short.</p>
      )}
      {result.datasetVersion !== loadedVersion && (
        <p className="text-amber-200">
          The published data changed since this page loaded (now {result.datasetVersion}). Reload to see the
          current list below.
        </p>
      )}
    </>
  );
}
