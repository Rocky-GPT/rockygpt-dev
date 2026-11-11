'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { ErrorPanel } from '@/components/ErrorPanel';
import {
  STATUS_LABELS,
  cardLine,
  flagReasons,
  formatDay,
  placeReason,
  plural,
  type CardListing,
  type CardPlace,
  type CardRow,
  type CardStatus,
  type CardTaskDetail,
} from '@/lib/answer-cards';
import { campusGraphHref } from '@/lib/campus-graph-link';

/** One task's steps as the Brain sends them: being read, read, or not readable. */
export type Detail =
  | { state: 'loading' }
  | { state: 'ready'; detail: CardTaskDetail }
  | { state: 'failed'; problem: string; changed: boolean };

const STATUS_STYLES: Record<CardStatus, string> = {
  ready: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  needs_look: 'border-amber-500/60 bg-amber-500/10 text-amber-300',
  date_passed: 'border-white/25 bg-white/10 text-foreground/90',
};

export function StatusPill({ status }: { status: CardStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** "3 tasks on 2 pages". */
function size(row: CardRow): string {
  return `${plural(row.places.length, 'task')} on ${plural(row.pages, 'page')}`;
}

export function CardTile({ row, onOpen }: { row: CardRow; onOpen: () => void }) {
  const line = cardLine(row);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-44 flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition-colors hover:border-sky-400/60 hover:bg-white/[0.07]"
    >
      <span className="flex min-h-6 w-full items-center justify-between gap-2">
        <StatusPill status={row.card.status} />
        <span className="shrink-0 text-xs text-muted-foreground">{size(row)}</span>
      </span>
      <span className="text-base font-semibold leading-snug text-foreground">{row.winner.task.task}</span>
      <span className="text-sm text-foreground/80">{row.owners.join(' · ') || 'No office'}</span>
      <span className={`mt-auto pt-1 text-xs ${line.warns ? 'text-amber-300' : 'text-muted-foreground'}`}>
        {line.text}
      </span>
    </button>
  );
}

/** A task's steps, each beside the page's own words. */
export function TaskSteps({ detail, onReload }: { detail: Detail; onReload: () => void }) {
  if (detail.state === 'loading') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Reading the steps from the Brain
      </p>
    );
  }
  if (detail.state === 'failed') {
    return (
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
    );
  }
  return (
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
  );
}

function Places({
  title,
  about,
  places,
  onOpen,
}: {
  title: string;
  about: string;
  places: CardPlace[];
  onOpen: (place: CardPlace) => void;
}) {
  if (!places.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{plural(places.length, 'page')}</span>
      </div>
      <p className="text-xs text-muted-foreground">{about}</p>
      <ul className="space-y-1.5">
        {places.map((place) => (
          <li key={place.row.id}>
            <button
              type="button"
              onClick={() => onOpen(place)}
              className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left hover:border-sky-400/60"
            >
              <span className="min-w-0 flex-1 basis-64">
                <span className="block break-all font-mono text-xs text-foreground/90">
                  {place.row.page.path ?? place.row.page.url ?? place.row.page.recordId}
                </span>
                <span className="block text-sm text-foreground/80">{place.row.task.task}</span>
              </span>
              {place.member.role === 'winner' && (
                <span className="shrink-0 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                  Its steps win
                </span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {placeReason(place)} · {plural(place.row.task.steps, 'step')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CardView({
  row,
  listing,
  detail,
  onBack,
  onOpenTask,
  onReload,
}: {
  row: CardRow;
  listing: CardListing;
  detail: Detail;
  onBack: () => void;
  onOpenTask: (id: string) => void;
  onReload: () => void;
}) {
  const { card, winner, places } = row;
  const owners = listing.nodes.filter((node) => card.owners.includes(node.entityId));
  const reasons = flagReasons(row);
  const passed = card.status === 'date_passed' ? (places[0].member.label ?? winner.task.term) : null;
  const open = (place: CardPlace) => onOpenTask(place.row.id);
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-foreground/90 hover:bg-white/10"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All cards
      </button>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={card.status} />
          <span className="text-xs text-muted-foreground">Answer card · {size(row)}</span>
          {winner.task.term && (
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
              {winner.task.term}
            </span>
          )}
        </div>
        <h2 className="text-xl font-bold leading-tight text-foreground">{winner.task.task}</h2>
        {winner.task.appliesTo && <p className="text-sm text-foreground/80">For {winner.task.appliesTo}.</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Handled by</span>
          {owners.length === 0 && <span className="text-amber-300">no office the graph knows</span>}
          {owners.map((node) => (
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
        {passed && (
          <p className="text-sm text-foreground/90">
            Its date passed: {passed}. The card stays so the bot can say the date is over.
          </p>
        )}
        {reasons.length > 0 && (
          <ul className="space-y-1 text-sm text-amber-300">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {card.notes.includes('owner_has_no_page') && (
          <p className="text-sm text-muted-foreground">
            A page names this office as the one that handles it. None of the office&rsquo;s own pages lists the
            task, so the steps come from the page that does.
          </p>
        )}
        {card.notes.includes('old_page') && (
          <p className="text-sm text-muted-foreground">
            The winning page last changed three or more years ago, and no newer page lists the task.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Rules in the graph build put this card together, with no AI call
          {listing.cards?.builtOn ? `, on ${formatDay(listing.cards.builtOn)}` : ''}. A past term never wins while
          a current page lists the task; then the owner&rsquo;s own page wins, then the newest date.
        </p>
        {winner.page.url && (
          <a
            href={winner.page.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-sky-300 hover:bg-white/10"
          >
            Open the winning Ramapo page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Steps, and the page words behind each one</h3>
          <span className="text-xs text-muted-foreground">
            {plural(winner.task.steps, 'step')} from {winner.page.path ?? 'the winning page'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Only the winning page&rsquo;s steps are the card&rsquo;s steps. Steps from two pages are never mixed.
        </p>
        <TaskSteps detail={detail} onReload={onReload} />
      </section>

      <Places
        title="Pages used"
        about="The winning page first, then the owner's other current pages that list the task."
        places={places.filter((place) => place.member.role === 'winner' || place.member.role === 'owner_page')}
        onOpen={open}
      />
      <Places
        title="Left out, and why"
        about="A term or date that is over, or a page three or more years old beside a newer one."
        places={places.filter((place) => place.member.role === 'left_out')}
        onOpen={open}
      />
      <Places
        title="Other pages that mention it"
        about="Current pages of other offices that list the same task."
        places={places.filter((place) => place.member.role === 'mentions')}
        onOpen={open}
      />

      <p className="text-xs text-muted-foreground">
        Look only. Nothing answers from a card yet: what the bot will say from it comes with the next step.
      </p>
    </div>
  );
}
