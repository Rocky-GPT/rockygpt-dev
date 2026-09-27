'use client';

import { useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';

/** One entry of a chat response's `citations`, as the brain's renderer writes it. */
interface Citation {
  id?: string;
  title?: string;
  url?: string;
  collection?: string;
  collected_at?: string;
  freshness?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  trust_tier?: string;
  limitations?: string[];
  record_title?: string;
}

/** Every citation from one page. The brain cites records, and several often share a page. */
interface SourcePage {
  url: string;
  citations: Citation[];
}

export function SourcesPanel({ citations }: { citations: unknown[] }) {
  const [view, setView] = useState<'cards' | 'json'>('cards');
  const pages = groupByPage(citations.filter(isCitation));

  return (
    <section className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {citations.length} record{citations.length === 1 ? '' : 's'} from {pages.length} page
          {pages.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-border p-0.5 text-[10px]">
            {(['cards', 'json'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`rounded px-2 py-0.5 transition-colors ${
                  view === option
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option === 'cards' ? 'Cards' : 'JSON'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'json' ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-neutral-950/70 p-3 font-mono text-xs leading-5 text-foreground">
          {JSON.stringify(citations, null, 2)}
        </pre>
      ) : (
        <div className="mt-3 space-y-3">
          {pages.map((page) => (
            <SourceCard key={page.url} page={page} />
          ))}
        </div>
      )}
    </section>
  );
}

function SourceCard({ page }: { page: SourcePage }) {
  const first = page.citations[0];
  const title = first.title ?? 'Source';
  const name = /^https?:\/\//.test(page.url) ? pageName(page.url) : '';
  // Freshness and validity belong to each record. When every record on the
  // page agrees they are said once on the card; otherwise on each record.
  const sameFreshness = page.citations.every((c) => c.freshness === first.freshness);
  const sameValidity = page.citations.every((c) => validity(c) === validity(first));
  const limitations = [
    ...new Set(
      page.citations.flatMap((c) =>
        Array.isArray(c.limitations) ? c.limitations.filter((l) => typeof l === 'string') : []
      )
    ),
  ];
  const heading = name && name !== title ? `${title} · ${name}` : title;
  const linked = /^https?:\/\//.test(page.url);
  const records = page.citations.filter((c) => c.record_title && c.record_title !== title);

  return (
    <article className="rounded-xl border border-border bg-neutral-950/70 p-4">
      {linked ? (
        <>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-start gap-1.5 text-sm font-semibold text-foreground hover:text-sky-300"
          >
            <span>{heading}</span>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-sky-300" />
          </a>
          <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
            {displayUrl(page.url)}
          </p>
        </>
      ) : (
        <p className="text-sm font-semibold text-foreground">{title}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {first.trust_tier && <TrustBadge tier={first.trust_tier} />}
        {sameFreshness && first.freshness && <FreshnessBadge freshness={first.freshness} />}
        {first.collection && (
          <Badge className="border-white/10 bg-white/[0.04] text-muted-foreground">
            {humanize(first.collection)}
          </Badge>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {sameValidity && validity(first) && (
          <>
            <dt className="text-muted-foreground">Valid</dt>
            <dd className="text-foreground">{validity(first)}</dd>
          </>
        )}
        {first.collected_at && (
          <>
            <dt className="text-muted-foreground">Collected</dt>
            <dd className="text-foreground">{formatDateTime(first.collected_at)}</dd>
          </>
        )}
      </dl>

      {records.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Records used
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {records.map((record, index) => (
              <li
                key={record.id ?? index}
                title={record.id}
                className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs text-foreground"
              >
                {record.record_title}
                {!sameFreshness && record.freshness && (
                  <span className="text-muted-foreground"> · {humanize(record.freshness)}</span>
                )}
                {!sameValidity && validity(record) && (
                  <span className="text-muted-foreground"> · {validity(record)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {limitations.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <Info className="h-3 w-3" />
            Limitations
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-foreground/90">
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${className}`}>
      {children}
    </span>
  );
}

const TRUST: Record<string, { label: string; className: string }> = {
  official_primary: {
    label: 'Official · primary',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  official_secondary: {
    label: 'Official · secondary',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
  community: {
    label: 'Community',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
};

function TrustBadge({ tier }: { tier: string }) {
  const known = TRUST[tier];
  return (
    <Badge className={known?.className ?? 'border-white/10 bg-white/[0.04] text-muted-foreground'}>
      {known?.label ?? humanize(tier)}
    </Badge>
  );
}

const FRESHNESS: Record<string, string> = {
  fresh: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  static: 'border-white/10 bg-white/[0.04] text-muted-foreground',
  stale: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  unknown: 'border-red-500/30 bg-red-500/10 text-red-300',
};

function FreshnessBadge({ freshness }: { freshness: string }) {
  return (
    <Badge className={FRESHNESS[freshness] ?? FRESHNESS.static}>{humanize(freshness)}</Badge>
  );
}

function isCitation(value: unknown): value is Citation {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function groupByPage(citations: Citation[]): SourcePage[] {
  const pages = new Map<string, Citation[]>();
  for (const citation of citations) {
    // A citation without a URL still gets its own card, keyed by its id.
    const key = citation.url ?? citation.id ?? String(pages.size);
    pages.set(key, [...(pages.get(key) ?? []), citation]);
  }
  return [...pages].map(([url, grouped]) => ({ url, citations: grouped }));
}

/** Mirrors the brain's `page_name`: '…/locations/birch-tree-inn' → 'Birch Tree Inn'. */
function pageName(url: string) {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return '';
  }
  const segment = path.replace(/^\/+|\/+$/g, '').split('/').pop() ?? '';
  if (!segment) return 'Home page';
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the raw segment when it is not valid percent-encoding.
  }
  const stem = decoded.includes('.') ? decoded.slice(0, decoded.lastIndexOf('.')) : decoded;
  const words = stem.split(/[-_\s]+/).filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Home page';
}

function displayUrl(url: string) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function validity(citation: Citation) {
  const from = citation.valid_from ? formatDate(citation.valid_from) : null;
  const until = citation.valid_until ? formatDate(citation.valid_until) : null;
  if (from && until) return from === until ? from : `${from} – ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;
  return null;
}

/** A date-only value names a calendar day, so it is read as one, not as UTC midnight. */
function formatDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = day ? new Date(+day[1], +day[2] - 1, +day[3]) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function humanize(value: string) {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
