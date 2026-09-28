'use client';

/**
 * @module components/TemplatesDashboard
 * Every answer code writes itself, as the Brain lists them.
 *
 * The list is the Brain's own (`GET /v1/templates`), not a copy kept here: Jev's
 * questions are shown in its live wording, and each example is written by the
 * real template code from sample records. A template that stops writing its
 * example shows the error here instead of a stale picture.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BookOpenCheck,
  ChevronDown,
  Code2,
  Database,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestion,
  RefreshCw,
  Signpost,
} from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { failureMessage } from '@/lib/brain-failure';

type Group = 'jev' | 'gpt' | 'fixed';
type Picker = 'Jev' | 'GPT' | 'Code';

interface Condition {
  by: Picker;
  text: string;
  needs: string | null;
  /** Jev's own question text, as the Brain sends it. */
  wording: string[];
}

interface Example {
  question: string;
  answer: string | null;
  status: string | null;
  sources: { title: string; url: string }[];
  note: string;
  error: string | null;
}

interface TemplateEntry {
  id: string;
  name: string;
  group: Group;
  mode: string;
  summary: string;
  note: string | null;
  when: Condition[];
  lookup: string;
  reads: string[];
  checks: string[];
  examples: Example[];
  code: string;
}

interface Catalog {
  jevModel: string;
  thresholds: { yes: number; no: number; route: number };
  groups: { id: Group; name: string; summary: string; sharedChecks: boolean }[];
  commonChecks: string[];
  templates: TemplateEntry[];
}

const GROUP_TONE: Record<Group, string> = {
  jev: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  gpt: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  fixed: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};
const GROUP_DOT: Record<Group, string> = {
  jev: 'bg-violet-400',
  gpt: 'bg-sky-400',
  fixed: 'bg-amber-400',
};
const PICKER_TONE: Record<Picker, string> = {
  Jev: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  GPT: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  Code: 'border-white/10 bg-white/5 text-neutral-300',
};

function needsTone(needs: string): string {
  if (needs === 'yes') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (needs === 'no') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  return 'border-white/10 bg-white/5 text-neutral-300';
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function ConditionRow({ condition }: { condition: Condition }) {
  const { by, text, needs, wording } = condition;
  const line = (
    <>
      <span
        className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${PICKER_TONE[by]}`}
      >
        {by}
      </span>
      <span className="min-w-0 flex-1 text-sm text-neutral-200">{text}</span>
      {needs && (
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${needsTone(needs)}`}
        >
          {needs}
        </span>
      )}
    </>
  );
  if (wording.length === 0) {
    return (
      <li className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        {line}
      </li>
    );
  }
  // The row opens to Jev's own words, which are what it is actually asked.
  return (
    <li className="rounded-xl border border-white/10 bg-black/20">
      <details className="group">
        <summary
          title="Show Jev's exact question"
          className="flex cursor-pointer list-none items-start gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden"
        >
          {line}
          <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-1 px-3 pb-2.5">
          <p className="text-[11px] text-muted-foreground">
            {wording.length === 1 ? 'Jev is asked:' : `Jev is asked ${wording.length} questions:`}
          </p>
          {wording.map((question) => (
            <p
              key={question}
              className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] leading-relaxed text-neutral-300"
            >
              {question}
            </p>
          ))}
        </div>
      </details>
    </li>
  );
}

function ExampleCard({ example }: { example: Example }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="flex items-start gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-200">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{example.question}</span>
      </div>
      <div className="px-3 py-3 text-sm text-neutral-300">
        {example.error ? (
          <p role="alert" className="flex items-start gap-2 text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This template no longer writes its example.{' '}
              <span className="font-mono text-xs text-rose-200/80">{example.error}</span>
            </span>
          </p>
        ) : (
          <BrainMarkdown>{example.answer ?? ''}</BrainMarkdown>
        )}
        {example.sources.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sources:{' '}
            {example.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 && ', '}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300"
                >
                  {source.title}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>
      <p className="border-t border-white/10 px-3 py-1.5 text-[11px] italic text-muted-foreground">
        {example.note}
      </p>
    </div>
  );
}

function TemplateDetail({ entry, catalog }: { entry: TemplateEntry; catalog: Catalog }) {
  const group = catalog.groups.find((item) => item.id === entry.group);
  return (
    <article className="min-w-0 space-y-6 rounded-2xl border border-white/10 bg-neutral-950/60 p-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-white">{entry.name}</h2>
          {group && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${GROUP_TONE[entry.group]}`}
            >
              {group.name}
            </span>
          )}
          <span
            title="responseMode in the turn logs"
            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400"
          >
            {entry.mode}
          </span>
        </div>
        <p className="text-sm text-neutral-300">{entry.summary}</p>
        {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
      </header>

      <Section icon={Signpost} title="When it's used">
        <ul className="space-y-1.5">
          {entry.when.map((condition) => (
            <ConditionRow key={condition.text} condition={condition} />
          ))}
        </ul>
      </Section>

      <Section icon={Database} title="What it reads">
        <p className="text-sm text-neutral-300">{entry.lookup}</p>
        {entry.reads.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.reads.map((collection) => (
              <Link
                key={collection}
                href={`/data/records?capability=${encodeURIComponent(collection)}`}
                title="See these records"
                className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-neutral-300 hover:border-sky-500/40 hover:text-sky-300"
              >
                {collection}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section icon={ListChecks} title="Checks it must pass">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300 marker:text-muted-foreground">
          {entry.checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ol>
        {group?.sharedChecks && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Like every answer
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-neutral-400">
              {catalog.commonChecks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section icon={BookOpenCheck} title={entry.examples.length > 1 ? 'Examples' : 'Example'}>
        <div className="space-y-3">
          {entry.examples.map((example) => (
            <ExampleCard key={example.question} example={example} />
          ))}
        </div>
      </Section>

      <footer className="flex items-start gap-2 border-t border-white/10 pt-3 font-mono text-[11px] text-muted-foreground">
        <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{entry.code}</span>
      </footer>
    </article>
  );
}

export function TemplatesDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brain/templates', { cache: 'no-store' });
      const body: unknown = await res.json().catch(() => null);
      if (res.status === 404) {
        throw new Error(
          'This Brain has no templates list yet. Run a Brain from its dev branch with the templates change.'
        );
      }
      if (!res.ok) throw new Error(failureMessage(body, res.status));
      setCatalog(body as Catalog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The templates could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The list is the Brain's, read live each time the page opens.
    void load();
  }, [load]);

  const shown = useMemo(
    () => (catalog?.templates ?? []).filter((entry) => group === 'all' || entry.group === group),
    [catalog, group]
  );
  const requested = searchParams.get('template');
  const selected = shown.find((entry) => entry.id === requested) ?? shown[0];

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('template', id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const thresholds = catalog?.thresholds;

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Every answer code writes itself, what picks it, and what it checks"
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <main className="min-w-0 space-y-5 px-6 py-6">
        {error ? (
          <p
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
          >
            Templates could not be loaded. {error}
          </p>
        ) : !catalog ? (
          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
            <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Who picks the template">
                <button
                  role="tab"
                  aria-selected={group === 'all'}
                  onClick={() => setGroup('all')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    group === 'all'
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/10 text-muted-foreground hover:text-white'
                  }`}
                >
                  All {catalog.templates.length}
                </button>
                {catalog.groups.map((item) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={group === item.id}
                    onClick={() => setGroup(item.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      group === item.id
                        ? GROUP_TONE[item.id]
                        : 'border-white/10 text-muted-foreground hover:text-white'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${GROUP_DOT[item.id]}`} />
                    {item.name}{' '}
                    {catalog.templates.filter((entry) => entry.group === item.id).length}
                  </button>
                ))}
              </div>
              <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                {catalog.groups
                  .filter((item) => group === 'all' || item.id === group)
                  .map((item) => (
                    <div key={item.id} className={group === 'all' ? '' : 'sm:col-span-3'}>
                      <dt className="inline font-medium text-neutral-300">{item.name}: </dt>
                      <dd className="inline text-muted-foreground">{item.summary}</dd>
                    </div>
                  ))}
              </dl>
              {thresholds && (
                <p className="text-xs text-muted-foreground">
                  For Jev ({catalog.jevModel}), <span className="text-emerald-300">yes</span> means
                  it scores {thresholds.yes.toFixed(2)} or more and{' '}
                  <span className="text-rose-300">no</span> means {thresholds.no.toFixed(2)} or
                  less. Its route pick needs {thresholds.route.toFixed(2)}.
                </p>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
              <select
                aria-label="Template"
                value={selected?.id ?? ''}
                onChange={(event) => select(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none lg:hidden"
              >
                {shown.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} ({entry.mode})
                  </option>
                ))}
              </select>
              <nav aria-label="Templates" className="hidden space-y-1.5 lg:block">
                {shown.map((entry) => {
                  const active = entry.id === selected?.id;
                  const broken = entry.examples.some((example) => example.error);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => select(entry.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`block w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-sky-500/40 bg-sky-500/10'
                          : 'border-white/10 bg-neutral-900/60 hover:bg-neutral-800/80'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GROUP_DOT[entry.group]}`} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                          {entry.name}
                        </span>
                        {broken && (
                          <AlertTriangle
                            aria-label="Example no longer renders"
                            className="h-3.5 w-3.5 shrink-0 text-rose-400"
                          />
                        )}
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {entry.mode}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block pl-3.5 text-xs text-muted-foreground">
                        {entry.summary}
                      </span>
                    </button>
                  );
                })}
              </nav>
              {selected && <TemplateDetail entry={selected} catalog={catalog} />}
            </div>
          </>
        )}
      </main>
    </>
  );
}
