'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react';
import { ErrorPanel } from '@/components/ErrorPanel';
import {
  filterTasks,
  formatDay,
  nodeNames,
  plural,
  readListing,
  readTaskDetail,
  taskRows,
  type CardListing,
  type CardTaskDetail,
  type TaskRow,
} from '@/lib/answer-cards';
import { failureMessage } from '@/lib/brain-failure';
import { campusGraphHref } from '@/lib/campus-graph-link';

/** Tiles drawn at first, and added by each "Show more". A release holds about 8,000 tasks. */
const PAGE_SIZE = 60;

type Detail =
  | { state: 'loading' }
  | { state: 'ready'; detail: CardTaskDetail }
  | { state: 'failed'; problem: string; changed: boolean };

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-44 flex-1 flex-col gap-0.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-2xl font-bold text-foreground">{value.toLocaleString('en-US')}</span>
    </div>
  );
}

function pageDate(updated: string | null): string {
  return updated ? `Page changed ${formatDay(updated)}` : 'No date on the page';
}

function Tile({ row, offices, onOpen }: { row: TaskRow; offices: string[]; onOpen: () => void }) {
  const { task, page } = row;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-44 flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition-colors hover:border-sky-400/60 hover:bg-white/[0.07]"
    >
      <span className="flex min-h-6 w-full items-center justify-between gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">{plural(task.steps, 'step')}</span>
        {task.term && (
          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
            {task.term}
          </span>
        )}
      </span>
      <span className="text-base font-semibold leading-snug text-foreground">{task.task}</span>
      <span className="text-sm text-foreground/80">{offices.join(' · ') || 'No office'}</span>
      {task.appliesTo && <span className="text-xs text-muted-foreground">For {task.appliesTo}</span>}
      {task.handledBy && (
        <span className="text-xs text-amber-300">The page says {task.handledBy} handles it</span>
      )}
      <span className="mt-auto flex flex-col gap-0.5 pt-1 text-xs text-muted-foreground">
        <span className="break-all font-mono">{page.path ?? page.url ?? page.recordId}</span>
        <span className={page.updated ? undefined : 'text-amber-300/90'}>{pageDate(page.updated)}</span>
      </span>
    </button>
  );
}

function TaskView({
  row,
  listing,
  detail,
  onBack,
  onOpen,
  onReload,
}: {
  row: TaskRow;
  listing: CardListing;
  detail: Detail;
  onBack: () => void;
  onOpen: (key: string) => void;
  onReload: () => void;
}) {
  const { task, page } = row;
  const nodes =
    detail.state === 'ready'
      ? detail.detail.nodes
      : listing.nodes.filter((node) => page.nodes.includes(node.entityId));
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-foreground/90 hover:bg-white/10"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All tasks
      </button>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-dashed border-amber-500/60 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
            One page&rsquo;s task, not a joined card yet
          </span>
          {task.term && (
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
              {task.term}
            </span>
          )}
        </div>
        <h2 className="text-xl font-bold leading-tight text-foreground">{task.task}</h2>
        {task.appliesTo && <p className="text-sm text-foreground/80">For {task.appliesTo}.</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">The page is linked from</span>
          {nodes.map((node) => (
            <Link
              key={node.entityId}
              href={campusGraphHref(`entity:${node.entityId}`, listing.datasetVersion, listing.identityHash)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-sky-300 hover:underline"
            >
              {node.name}
              {node.kind !== 'office' && <span className="text-muted-foreground"> ({node.kind})</span>}
            </Link>
          ))}
        </div>
        {task.handledBy && (
          <p className="text-sm text-amber-300">The page says {task.handledBy} handles it.</p>
        )}
        <p className="text-xs text-muted-foreground">
          The office comes from the graph&rsquo;s links, not from the AI. The task, who it is for and
          the steps were listed by the night job&rsquo;s page read and held to the page&rsquo;s words.
        </p>
        {page.url && (
          <a
            href={page.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-sky-300 hover:bg-white/10"
          >
            Open the Ramapo page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Steps, and the page words behind each one</h3>
          <span className="text-xs text-muted-foreground">{plural(task.steps, 'step')} from this page</span>
        </div>
        {detail.state === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Reading the steps from the Brain
          </p>
        )}
        {detail.state === 'failed' && (
          <div className="space-y-3">
            <ErrorPanel title="Could not read this task" detail={detail.problem} />
            {detail.changed && (
              <button
                type="button"
                onClick={onReload}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-foreground/90 hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Read the list again
              </button>
            )}
          </div>
        )}
        {detail.state === 'ready' && (
          <ol className="space-y-3">
            {detail.detail.task.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/30 font-mono text-xs text-foreground/90">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm leading-6 text-foreground">{step.text}</p>
                  {step.quote ? (
                    <blockquote className="rounded-xl border-l-2 border-white/20 bg-black/30 px-3.5 py-2 text-sm leading-6 text-foreground/80">
                      {step.quote}
                    </blockquote>
                  ) : (
                    <p className="text-xs text-amber-300">The page read kept no page words for this step.</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-sm font-semibold text-foreground">The page</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Address</dt>
          <dd className="min-w-0 break-all font-mono text-foreground/90">{page.path ?? page.url ?? 'not recorded'}</dd>
          <dt className="text-muted-foreground">Last changed</dt>
          <dd className={page.updated ? 'text-foreground/90' : 'text-amber-300'}>
            {page.updated ? formatDay(page.updated) : 'No date on the page'}
          </dd>
          {detail.state === 'ready' && detail.detail.page.collectedAt && (
            <>
              <dt className="text-muted-foreground">Read by the night job</dt>
              <dd className="text-foreground/90">{formatDay(detail.detail.page.collectedAt)}</dd>
            </>
          )}
          {task.section && (
            <>
              <dt className="text-muted-foreground">Part of the page</dt>
              <dd className="text-foreground/90">{task.section}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Task key</dt>
          <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">{row.id}</dd>
        </dl>
      </section>

      {page.tasks.length > 1 && (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Other tasks on this page</h3>
            <span className="text-xs text-muted-foreground">{plural(page.tasks.length - 1, 'task')}</span>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {page.tasks
              .filter((other) => other.key !== task.key)
              .map((other) => (
                <li key={other.key}>
                  <button
                    type="button"
                    onClick={() => onOpen(other.key)}
                    className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-left text-sm text-foreground/90 hover:border-sky-400/60"
                  >
                    <span>{other.task}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{plural(other.steps, 'step')}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Look only. What the bot will say, the pages used and the pages left out come when the same
        task is joined across pages into one card.
      </p>
    </div>
  );
}

export function AnswerCards() {
  const [listing, setListing] = useState<CardListing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [node, setNode] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail>({ state: 'loading' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/brain/answer-cards', { cache: 'no-store' })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        const read = response.ok ? readListing(body) : null;
        if (read) {
          setListing(read);
          setProblem(null);
          setOpenId(null);
          return;
        }
        setProblem(
          response.status === 404
            ? 'This Brain does not list its tasks yet. Pull the latest Brain and restart it.'
            : response.ok
              ? 'The Brain sent a list this page cannot read.'
              : failureMessage(body, response.status)
        );
      })
      .catch(() => setProblem('The Brain is not reachable.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (listing ? taskRows(listing) : []), [listing]);
  const names = useMemo(() => (listing ? nodeNames(listing) : new Map<string, string>()), [listing]);
  const found = useMemo(() => filterTasks(rows, query, node || null), [rows, query, node]);
  const open = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);

  useEffect(() => {
    if (!open || !listing) return;
    let stale = false;
    setDetail({ state: 'loading' });
    const params = new URLSearchParams({
      node_id: open.page.nodes[0] ?? '',
      record_id: open.page.recordId,
      key: open.task.key,
      dataset_version: listing.datasetVersion,
      identity_hash: listing.identityHash,
    });
    fetch(`/api/brain/answer-cards/task?${params}`, { cache: 'no-store' })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        const read = response.ok ? readTaskDetail(body) : null;
        if (stale) return;
        if (read) {
          setDetail({ state: 'ready', detail: read });
          return;
        }
        setDetail({
          state: 'failed',
          changed: response.status === 409,
          problem:
            response.status === 409
              ? 'The Brain now serves a newer release than this list. Read the list again.'
              : response.ok
                ? 'The Brain sent a task this page cannot read.'
                : failureMessage(body, response.status),
        });
      })
      .catch(() => {
        if (!stale) setDetail({ state: 'failed', changed: false, problem: 'The Brain is not reachable.' });
      });
    return () => {
      stale = true;
    };
  }, [open, listing]);

  if (!listing) {
    return problem ? (
      <div className="space-y-3">
        <ErrorPanel title="Could not read the tasks" detail={problem} />
        <button
          type="button"
          onClick={load}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-foreground/90 hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </button>
      </div>
    ) : (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Reading every task from the Brain. The
        first read of a release takes a few seconds.
      </p>
    );
  }

  if (open) {
    return (
      <TaskView
        row={open}
        listing={listing}
        detail={detail}
        onBack={() => setOpenId(null)}
        onOpen={(key) => setOpenId(`${open.page.recordId}:${key}`)}
        onReload={load}
      />
    );
  }

  const visible = found.slice(0, shown);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Each tile is one task as one office page lists it. The same task often sits on several
          pages, so it shows up several times here. Joining those into one card and choosing which
          page wins is the next step.
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-foreground/80">
            {listing.datasetVersion}
          </span>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Read the list again"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-foreground/90 hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      {problem && <ErrorPanel title="Could not read the tasks again" detail={problem} />}

      <section aria-label="Totals" className="flex flex-wrap gap-3">
        <Total label="Office pages in the graph" value={listing.totals.pagesRead} />
        <Total label="Pages with a task" value={listing.totals.pagesWithTasks} />
        <Total label="Tasks found on pages" value={listing.totals.tasks} />
        <Total label="Steps, each tied to page words" value={listing.totals.steps} />
        <div className="flex min-w-44 flex-1 flex-col gap-0.5 rounded-2xl border border-dashed border-amber-500/60 bg-amber-500/10 px-4 py-3.5">
          <span className="text-xs text-amber-300">Cards after joining</span>
          <span className="pt-1.5 text-base font-semibold text-amber-200">
            {listing.joined ? 'Built, not shown by this page yet' : 'Not built yet'}
          </span>
        </div>
      </section>

      <section aria-label="Find a task" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-[2] flex-col gap-1.5">
          <label htmlFor="card-search" className="text-xs text-muted-foreground">
            Search tasks
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="card-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShown(PAGE_SIZE);
              }}
              placeholder="parking, meal plan, transcript"
              className="min-h-11 w-full rounded-xl border border-border bg-white/5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
        <div className="flex min-w-52 flex-1 flex-col gap-1.5">
          <label htmlFor="card-office" className="text-xs text-muted-foreground">
            Office
          </label>
          <select
            id="card-office"
            value={node}
            onChange={(event) => {
              setNode(event.target.value);
              setShown(PAGE_SIZE);
            }}
            className="min-h-11 w-full rounded-xl border border-border bg-neutral-900 px-3 text-sm text-foreground"
          >
            <option value="">All {listing.nodes.length} offices and groups</option>
            {listing.nodes.map((item) => (
              <option key={item.entityId} value={item.entityId}>
                {item.name} ({item.tasks.toLocaleString('en-US')})
              </option>
            ))}
          </select>
        </div>
      </section>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {found.length === rows.length
          ? `Showing ${visible.length.toLocaleString('en-US')} of ${plural(rows.length, 'task')}`
          : `${plural(found.length, 'task')} found, showing ${visible.length.toLocaleString('en-US')}`}
      </p>

      {found.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground">
          No task has all of those words. The search reads the task, who it is for, the office, the
          term and the page address.
        </p>
      ) : (
        <section aria-label="Tasks" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => (
            <Tile
              key={row.id}
              row={row}
              offices={row.page.nodes.flatMap((id) => names.get(id) ?? [])}
              onOpen={() => setOpenId(row.id)}
            />
          ))}
        </section>
      )}

      {found.length > visible.length && (
        <button
          type="button"
          onClick={() => setShown((current) => current + PAGE_SIZE)}
          className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-foreground/90 hover:bg-white/10"
        >
          Show {Math.min(PAGE_SIZE, found.length - visible.length)} more
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        Look only. The statuses from the mock-up (Ready, Needs a look, Date passed) come when tasks
        are joined into cards.
      </p>
    </div>
  );
}
