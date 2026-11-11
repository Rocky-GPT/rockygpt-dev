'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react';
import { ErrorPanel } from '@/components/ErrorPanel';
import { CardTile, CardView, TaskSteps, type Detail } from '@/components/dev/AnswerCardView';
import {
  STATUS_LABELS,
  cardRows,
  filterCards,
  filterTasks,
  formatDay,
  nodeNames,
  plural,
  readListing,
  readTaskDetail,
  statusCounts,
  taskRows,
  type CardListing,
  type CardRow,
  type CardStatus,
  type TaskRow,
} from '@/lib/answer-cards';
import { failureMessage } from '@/lib/brain-failure';
import { campusGraphHref } from '@/lib/campus-graph-link';

/** Tiles drawn at first, and added by each "Show more". A release holds about 8,000 tasks. */
const PAGE_SIZE = 60;

/** The list shows the joined cards, or every task as its page lists it. */
type View = 'cards' | 'tasks';

function Choice({ pressed, onPress, children }: { pressed: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={`min-h-11 rounded-xl border px-4 text-sm ${
        pressed
          ? 'border-sky-400 bg-white/10 font-semibold text-foreground'
          : 'border-white/10 bg-white/5 text-foreground/80 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

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
  card,
  back,
  onBack,
  onCard,
  onOpen,
  onReload,
}: {
  row: TaskRow;
  listing: CardListing;
  detail: Detail;
  /** The card this task is part of, when the release has cards. */
  card: CardRow | null;
  /** Where the back button goes. */
  back: string;
  onBack: () => void;
  onCard: () => void;
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
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {back}
      </button>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {card ? (
            <button
              type="button"
              onClick={onCard}
              className="min-h-8 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-0.5 text-left text-xs font-semibold text-sky-300 hover:bg-sky-500/20"
            >
              One page&rsquo;s task, in the card &ldquo;{card.winner.task.task}&rdquo;
              {card.winner.id === row.id ? ' (its steps win)' : ''}
            </button>
          ) : (
            <span className="rounded-full border border-dashed border-amber-500/60 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
              One page&rsquo;s task. This release has no joined cards
            </span>
          )}
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
        <TaskSteps detail={detail} onReload={onReload} />
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
        Look only. This is the task as its own page lists it; its card shows which page&rsquo;s steps win.
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
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [view, setView] = useState<View>('cards');
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [joinedOnly, setJoinedOnly] = useState(false);
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
          setOpenCardId(null);
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
  const cards = useMemo(() => (listing ? cardRows(listing) : []), [listing]);
  const counts = useMemo(() => statusCounts(cards), [cards]);
  const joinedCount = useMemo(() => cards.filter((card) => card.places.length > 1).length, [cards]);
  const foundCards = useMemo(
    () => filterCards(cards, { query, node: node || null, status, joinedOnly }),
    [cards, query, node, status, joinedOnly]
  );
  const openCard = useMemo(() => cards.find((card) => card.card.id === openCardId) ?? null, [cards, openCardId]);
  const cardOf = useMemo(() => {
    const byTask = new Map<string, CardRow>();
    for (const card of cards) for (const place of card.places) byTask.set(place.row.id, card);
    return byTask;
  }, [cards]);
  // The task whose steps are on screen: an open task's own, else an open card's winner's.
  const target = open ?? openCard?.winner ?? null;

  useEffect(() => {
    if (!target || !listing) return;
    let stale = false;
    setDetail({ state: 'loading' });
    const params = new URLSearchParams({
      node_id: target.page.nodes[0] ?? '',
      record_id: target.page.recordId,
      key: target.task.key,
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
  }, [target, listing]);

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
        card={cardOf.get(open.id) ?? null}
        back={openCard ? 'Back to the card' : 'All tasks'}
        onBack={() => setOpenId(null)}
        onCard={() => {
          setOpenCardId(cardOf.get(open.id)?.card.id ?? null);
          setOpenId(null);
        }}
        onOpen={(key) => setOpenId(`${open.page.recordId}:${key}`)}
        onReload={load}
      />
    );
  }

  if (openCard) {
    return (
      <CardView
        row={openCard}
        listing={listing}
        detail={detail}
        onBack={() => setOpenCardId(null)}
        onOpenTask={setOpenId}
        onReload={load}
      />
    );
  }

  const showCards = view === 'cards' && listing.cards !== null;
  const total = showCards ? foundCards.length : found.length;
  const visible = found.slice(0, shown);
  const visibleCards = foundCards.slice(0, shown);
  const drawn = showCards ? visibleCards.length : visible.length;
  const all = showCards ? cards.length : rows.length;
  const thing = showCards ? 'card' : 'task';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {showCards
            ? 'Each tile is one answer card: one task, joined from every page that lists it. Rules in the graph build choose the office that handles it and the one page whose steps win, and flag what they cannot settle. No AI call joins them.'
            : listing.cards
              ? 'Each tile is one task as one office page lists it. The same task often sits on several pages, so it shows up several times here. The cards join them.'
              : 'Each tile is one task as one office page lists it. The same task often sits on several pages, so it shows up several times here. This release was built without joined cards.'}
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
        {listing.cards ? (
          <Total label="Cards after joining" value={cards.length} />
        ) : (
          <div className="flex min-w-44 flex-1 flex-col gap-0.5 rounded-2xl border border-dashed border-amber-500/60 bg-amber-500/10 px-4 py-3.5">
            <span className="text-xs text-amber-300">Cards after joining</span>
            <span className="pt-1.5 text-base font-semibold text-amber-200">Not built for this release</span>
          </div>
        )}
      </section>

      {listing.cards && (
        <section aria-label="What to show" className="flex flex-wrap items-center gap-2">
          <Choice
            pressed={showCards}
            onPress={() => {
              setView('cards');
              setShown(PAGE_SIZE);
            }}
          >
            Cards ({cards.length.toLocaleString('en-US')})
          </Choice>
          <Choice
            pressed={!showCards}
            onPress={() => {
              setView('tasks');
              setShown(PAGE_SIZE);
            }}
          >
            Tasks, page by page ({rows.length.toLocaleString('en-US')})
          </Choice>
        </section>
      )}

      <section aria-label="Find a task" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-[2] flex-col gap-1.5">
          <label htmlFor="card-search" className="text-xs text-muted-foreground">
            {showCards ? 'Search cards' : 'Search tasks'}
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

      {showCards && (
        <section role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
          <Choice
            pressed={status === null}
            onPress={() => {
              setStatus(null);
              setShown(PAGE_SIZE);
            }}
          >
            All ({cards.length.toLocaleString('en-US')})
          </Choice>
          {(Object.keys(STATUS_LABELS) as CardStatus[]).map((item) => (
            <Choice
              key={item}
              pressed={status === item}
              onPress={() => {
                setStatus(item);
                setShown(PAGE_SIZE);
              }}
            >
              {STATUS_LABELS[item]} ({counts[item].toLocaleString('en-US')})
            </Choice>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-white/15 sm:block" aria-hidden="true" />
          <Choice
            pressed={joinedOnly}
            onPress={() => {
              setJoinedOnly((current) => !current);
              setShown(PAGE_SIZE);
            }}
          >
            Joined from two or more pages ({joinedCount.toLocaleString('en-US')})
          </Choice>
        </section>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === all
          ? `Showing ${drawn.toLocaleString('en-US')} of ${plural(all, thing)}`
          : `${plural(total, thing)} found, showing ${drawn.toLocaleString('en-US')}`}
      </p>

      {total === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground">
          No {thing} has all of those words{showCards ? ' with that status' : ''}. The search reads the task, who
          it is for, the office, the term and the page address.
        </p>
      ) : showCards ? (
        <section aria-label="Cards" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleCards.map((card) => (
            <CardTile key={card.card.id} row={card} onOpen={() => setOpenCardId(card.card.id)} />
          ))}
        </section>
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

      {total > drawn && (
        <button
          type="button"
          onClick={() => setShown((current) => current + PAGE_SIZE)}
          className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-foreground/90 hover:bg-white/10"
        >
          Show {Math.min(PAGE_SIZE, total - drawn)} more
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        {listing.cards
          ? 'Look only. Nothing answers from a card yet. Ready means the rules settled the owner and the winning page; Needs a look means they could not; Date passed means the only date the task has is over.'
          : 'Look only. This release was built without joined cards, so there are no statuses to show.'}
      </p>
    </div>
  );
}
