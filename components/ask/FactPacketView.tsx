import { packetSummary, type FactPacket, type PacketFact } from '@/lib/fact-packet';

/**
 * The Brain's answer when it sends facts and no written text: the Fact Packet, shown as it
 * arrived. Nothing is added here. A table row is one fact, a flag says what the packet says
 * about it, and the full JSON is one click away.
 */

const STATUS_TONE: Record<string, string> = {
  complete: 'text-emerald-400',
  no_facts_needed: 'text-emerald-400',
  emergency: 'text-red-400',
};

function valueText(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function Flag({ children, tone }: { children: string; tone: 'amber' | 'neutral' }) {
  const color = tone === 'amber' ? 'border-amber-400/40 text-amber-400' : 'border-border text-muted-foreground';
  return <span className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${color}`}>{children}</span>;
}

function FactRow({ fact }: { fact: PacketFact }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3">{fact.subject.name}</td>
      <td className="py-2 pr-3 text-muted-foreground">{fact.predicate}</td>
      <td className="whitespace-pre-wrap break-words py-2 pr-3 font-mono text-[13px]">{valueText(fact.value)}</td>
      <td className="py-2">
        <div className="flex flex-wrap gap-1">
          {!fact.current && <Flag tone="amber">not current</Flag>}
          {fact.status !== 'known' && <Flag tone="amber">{fact.status}</Flag>}
          {fact.purpose && <Flag tone="neutral">{fact.purpose.replace('_', ' ')}</Flag>}
          <Flag tone="neutral">{`${fact.source_ids.length} source${fact.source_ids.length === 1 ? '' : 's'}`}</Flag>
        </div>
      </td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function FactPacketView({ packet }: { packet: FactPacket }) {
  const { request } = packet;
  return (
    <div className="px-5 py-4">
      <div className="rounded-xl border border-border bg-neutral-950/70 p-4 text-sm leading-6 text-foreground">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={`text-base font-medium ${STATUS_TONE[packet.status] ?? 'text-amber-400'}`}>
            {packet.status.replaceAll('_', ' ')}
          </span>
          <span className="text-muted-foreground">intent {request.intent}</span>
          <span className="text-muted-foreground">as of {request.asOf}</span>
          {request.dataset?.version && <span className="text-muted-foreground">{request.dataset.version}</span>}
        </div>
        <p className="mt-2 text-muted-foreground">{packetSummary(packet)}</p>

        {packet.facts.length > 0 && (
          <Section title="Facts">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody>
                  {packet.facts.map((fact) => (
                    <FactRow key={fact.id} fact={fact} />
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {packet.missing.length > 0 && (
          <Section title="Missing">
            <ul className="list-disc pl-5">
              {packet.missing.map((entry) => (
                <li key={`${entry.subject.id}-${entry.predicate}`}>
                  {entry.subject.name} {entry.predicate}: {entry.reason.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(packet.ambiguities.length > 0 || packet.unresolved.length > 0) && (
          <Section title="Not resolved">
            <ul className="list-disc pl-5">
              {packet.ambiguities.map((entry) => (
                <li key={entry.query}>
                  &quot;{entry.query}&quot; could be {entry.candidates.map((candidate) => candidate.name).join(' or ')}
                  {entry.truncated ? ' (more not shown)' : ''}
                </li>
              ))}
              {packet.unresolved.map((entry) => (
                <li key={entry.query}>
                  &quot;{entry.query}&quot;: {entry.reason.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {packet.notices.length > 0 && (
          <Section title="Notices">
            <ul className="space-y-1.5">
              {packet.notices.map((notice, index) => (
                <li key={`${notice.type}-${index}`}>
                  <span className="font-medium">{notice.type.replaceAll('_', ' ')}</span>
                  {notice.approved_text && <span className="text-muted-foreground"> · {notice.approved_text}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {packet.sources.length > 0 && (
          <Section title="Sources">
            <ul className="space-y-1">
              {packet.sources.map((source) => (
                <li key={source.id}>
                  {source.title}
                  <span className="text-muted-foreground">
                    {' '}
                    · {source.freshness}
                    {source.current ? '' : ' · not current'}
                    {source.captured_at ? ` · captured ${source.captured_at}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground">Packet JSON</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-black/30 p-3 font-mono text-xs leading-5">
            {JSON.stringify(packet, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
