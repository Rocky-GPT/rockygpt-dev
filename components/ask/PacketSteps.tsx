import { JsonViewer } from '@/components/JsonViewer';
import {
  packetReasons,
  valueLines,
  type FactPacket,
  type PacketFact,
  type PacketNotice,
  type PacketNotPublished,
  type PacketSource,
} from '@/lib/fact-packet';

/**
 * The Brain's Fact Packet, read as the steps it took to get there: what it understood, what it
 * found, what it could not settle, what else it sent, where each fact came from, and how that
 * adds up to the packet's status. Nothing here is added; every line is a field of the packet,
 * and the whole JSON is at the bottom with a copy button.
 */

const CHIP = {
  neutral: 'border-white/10 bg-white/[0.04] text-muted-foreground',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  bad: 'border-red-500/30 bg-red-500/10 text-red-300',
} as const;

type Tone = keyof typeof CHIP;

const STATUS_TONE: Record<string, Tone> = {
  complete: 'good',
  no_facts_needed: 'good',
  partial: 'warn',
  insufficient: 'warn',
  ambiguous: 'warn',
  not_found: 'warn',
  emergency: 'bad',
};

function Chip({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 ${CHIP[tone]}`}>
      {children}
    </span>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <li className="relative pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute -left-[34px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-sky-500/40 bg-neutral-950 font-mono text-[11px] text-sky-300"
      >
        {n}
      </span>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </li>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function groupBySubject(facts: PacketFact[]): Array<[string, PacketFact[]]> {
  const groups = new Map<string, PacketFact[]>();
  for (const fact of facts) groups.set(fact.subject.name, [...(groups.get(fact.subject.name) ?? []), fact]);
  return [...groups];
}

function FactRows({ facts }: { facts: PacketFact[] }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-neutral-950/60">
      {facts.map((fact) => (
        <div key={fact.id} className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span className="pt-px text-xs text-muted-foreground">{fact.predicate}</span>
          <div className="min-w-0">
            <div className="space-y-0.5 break-words font-mono text-[13px] leading-5 text-foreground">
              {valueLines(fact.value).map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {!fact.current && (
                <Chip tone="warn" title="No source of this fact is within its time limit">
                  not current
                </Chip>
              )}
              {fact.status !== 'known' && <Chip tone="warn">{fact.status}</Chip>}
              {fact.purpose && <Chip tone="info">{fact.purpose.replaceAll('_', ' ')}</Chip>}
              <Chip title={fact.source_ids.join('\n')}>
                {fact.source_ids.length} source{fact.source_ids.length === 1 ? '' : 's'}
              </Chip>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function groupAbsences(entries: PacketNotPublished[]): Array<[string, PacketNotPublished[]]> {
  const groups = new Map<string, PacketNotPublished[]>();
  for (const entry of entries) groups.set(entry.subject.name, [...(groups.get(entry.subject.name) ?? []), entry]);
  return [...groups];
}

/** What the office's own pages were read for and do not publish: an answer, with the pages and the date. */
function AbsenceRows({ entries }: { entries: PacketNotPublished[] }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-neutral-950/60">
      {entries.map((entry) => (
        <div key={`${entry.subject.id}-${entry.predicate}`} className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span className="pt-px text-xs text-muted-foreground">{entry.predicate}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Chip tone="info">not published</Chip>
              <span className="text-foreground">checked {entry.checked_at.slice(0, 10)}</span>
              {!entry.current && <Chip tone="warn">not current</Chip>}
            </div>
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              {entry.checks.map((check) => (
                <li key={`${check.url}-${check.section}`} className="break-words">
                  read “{check.section}” on{' '}
                  <a href={check.url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                    {check.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

function NoticeRow({ notice }: { notice: PacketNotice }) {
  const { type, approved_text: approved, ...rest } = notice;
  const extra = Object.entries(rest).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return (
    <div className="rounded-xl border border-border bg-neutral-950/60 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={type === 'safety' ? 'bad' : 'info'}>{type.replaceAll('_', ' ')}</Chip>
        {extra
          .filter(([, value]) => typeof value !== 'object' && String(value).length <= 40)
          .map(([key, value]) => (
            <span key={key} className="text-muted-foreground">
              {key} <span className="font-mono text-foreground">{String(value)}</span>
            </span>
          ))}
      </div>
      {typeof approved === 'string' && approved && (
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{approved}</p>
      )}
      {extra
        .filter(([, value]) => typeof value === 'string' && value.length > 40)
        .map(([key, value]) => (
          <p key={key} className="mt-1.5 break-words text-[13px] leading-5 text-foreground">
            <span className="text-muted-foreground">{key}: </span>
            {String(value)}
          </p>
        ))}
    </div>
  );
}

function SourceRow({ source }: { source: PacketSource }) {
  return (
    <div className="rounded-xl border border-border bg-neutral-950/60 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-foreground">{source.title}</span>
        <Chip tone={source.freshness === 'fresh' ? 'good' : 'warn'}>{source.freshness}</Chip>
        {!source.current && <Chip tone="warn">not current</Chip>}
        {source.captured_at && (
          <span className="font-mono text-muted-foreground">captured {source.captured_at}</span>
        )}
      </div>
      {source.urls.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {source.urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sky-400 hover:underline"
            >
              {url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function PacketSteps({ packet }: { packet: FactPacket }) {
  const { request } = packet;
  const asked = packet.facts.filter((fact) => !fact.purpose);
  const emergency = packet.facts.filter((fact) => fact.purpose);
  const absent = packet.not_published.filter((entry) => !entry.purpose);
  const unsettled = packet.missing.length + packet.ambiguities.length + packet.unresolved.length;
  const reasons = packetReasons(packet);
  const status = packet.status;
  let step = 0;

  return (
    <div>
      <ol className="ml-3 border-l border-border pl-[22px]">
        <Step n={++step} title="Understood" hint={`intent ${request.intent.replaceAll('_', ' ')}`}>
          <div className="space-y-1.5">
            <Labelled label="Asked about">
              {request.entities.length > 0 ? (
                request.entities.map((entity) => (
                  <Chip key={entity.id} tone="info" title={`id ${entity.id}\nthe model searched for "${entity.query}"`}>
                    {entity.name}
                    {entity.query !== entity.name && (
                      <span className="ml-1 text-muted-foreground">“{entity.query}”</span>
                    )}
                  </Chip>
                ))
              ) : (
                <span className="text-muted-foreground">no office</span>
              )}
            </Labelled>
            {request.fields.length > 0 && (
              <Labelled label="Fields">
                {request.fields.map((field) => (
                  <Chip key={field}>{field}</Chip>
                ))}
              </Labelled>
            )}
            <Labelled label="Campus time">
              <span className="font-mono text-foreground">{request.asOf}</span>
            </Labelled>
            {request.dataset?.version && (
              <Labelled label="Dataset">
                <span className="font-mono text-foreground">{request.dataset.version}</span>
              </Labelled>
            )}
          </div>
        </Step>

        {asked.length > 0 && (
          <Step n={++step} title="Found" hint={`${asked.length} fact${asked.length === 1 ? '' : 's'}`}>
            <div className="space-y-3">
              {groupBySubject(asked).map(([office, facts]) => (
                <div key={office}>
                  <p className="mb-1.5 text-xs font-medium text-sky-300">{office}</p>
                  <FactRows facts={facts} />
                </div>
              ))}
            </div>
          </Step>
        )}

        {absent.length > 0 && (
          <Step n={++step} title="Confirmed not published" hint="the office's pages were read; they state no value">
            <div className="space-y-3">
              {groupAbsences(absent).map(([office, entries]) => (
                <div key={office}>
                  <p className="mb-1.5 text-xs font-medium text-sky-300">{office}</p>
                  <AbsenceRows entries={entries} />
                </div>
              ))}
            </div>
          </Step>
        )}

        {unsettled > 0 && (
          <Step n={++step} title="Could not settle" hint={`${unsettled} item${unsettled === 1 ? '' : 's'}`}>
            <div className="space-y-1.5 text-xs">
              {packet.missing.map((entry) => (
                <div key={`${entry.subject.id}-${entry.predicate}`} className="flex flex-wrap items-center gap-1.5">
                  <Chip tone="warn">unknown</Chip>
                  <span className="text-foreground">
                    {entry.subject.name} · {entry.predicate}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.reason === 'unknown' ? 'no information either way' : entry.reason.replaceAll('_', ' ')}
                  </span>
                </div>
              ))}
              {packet.ambiguities.map((entry) => (
                <div key={entry.query} className="flex flex-wrap items-center gap-1.5">
                  <Chip tone="warn">ambiguous</Chip>
                  <span className="text-foreground">“{entry.query}”</span>
                  <span className="text-muted-foreground">could be</span>
                  {entry.candidates.map((candidate) => (
                    <Chip key={candidate.id} title={candidate.match}>
                      {candidate.name}
                    </Chip>
                  ))}
                  {entry.truncated && <span className="text-muted-foreground">(more not shown)</span>}
                </div>
              ))}
              {packet.unresolved.map((entry) => (
                <div key={entry.query} className="flex flex-wrap items-center gap-1.5">
                  <Chip tone="warn">no match</Chip>
                  <span className="text-foreground">“{entry.query}”</span>
                  <span className="text-muted-foreground">{entry.reason.replaceAll('_', ' ')}</span>
                </div>
              ))}
            </div>
          </Step>
        )}

        {(packet.notices.length > 0 || emergency.length > 0) && (
          <Step n={++step} title="Also sent" hint="wording and numbers the Brain approved">
            <div className="space-y-2">
              {packet.notices.map((notice, index) => (
                <NoticeRow key={`${notice.type}-${index}`} notice={notice} />
              ))}
              {groupBySubject(emergency).map(([office, facts]) => (
                <div key={office}>
                  <p className="mb-1.5 text-xs font-medium text-sky-300">{office}</p>
                  <FactRows facts={facts} />
                </div>
              ))}
            </div>
          </Step>
        )}

        {packet.sources.length > 0 && (
          <Step n={++step} title="Sources" hint={`${packet.sources.length} cited`}>
            <div className="space-y-1.5">
              {packet.sources.map((source) => (
                <SourceRow key={source.id} source={source} />
              ))}
            </div>
          </Step>
        )}

        <Step n={++step} title="Result">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{status.replaceAll('_', ' ')}</Chip>
            <span className="text-xs text-muted-foreground">packet version {packet.version}</span>
          </div>
          {reasons.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : status === 'complete' ? (
            <p className="mt-2 text-xs text-muted-foreground">Every fact is known and current.</p>
          ) : null}
        </Step>
      </ol>

      <div className="mt-4">
        <JsonViewer data={packet} title="Fact Packet JSON" />
      </div>
    </div>
  );
}
