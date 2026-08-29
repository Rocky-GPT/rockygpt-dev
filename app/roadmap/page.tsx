import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/PageHeader';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import { ALL_ITEMS, NAVIGATION, type ItemStatus } from '@/lib/navigation';

export const metadata: Metadata = {
  title: 'Roadmap | RockyGPT Dev',
  description: 'What is built, and what each gap is waiting on.',
};

const TONE: Record<ItemStatus, PillTone> = { ready: 'ok', partial: 'warn', planned: 'idle' };

export default function RoadmapPage() {
  const counts = ALL_ITEMS.reduce<Record<ItemStatus, number>>(
    (totals, item) => ({ ...totals, [item.status]: totals[item.status] + 1 }),
    { ready: 0, partial: 0, planned: 0 }
  );

  return (
    <>
      <PageHeader
        title="Roadmap"
        subtitle={`${counts.ready} built · ${counts.partial} partial · ${counts.planned} waiting on the brain`}
      />
      <main className="min-w-0 space-y-6 px-6 py-6">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Every section this app intends to have, including the ones that do not
          work yet. What is missing is mostly not missing from here — it is
          missing from the brain’s HTTP surface, and the blocker column says
          which. That makes this the working list for what to build upstream
          next.
        </p>

        {NAVIGATION.map((section) => (
          <section key={section.id}>
            <h2 className="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full border-collapse text-left text-sm">
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.href} className="border-b border-white/5 last:border-b-0">
                      <td className="w-56 px-4 py-3 align-top">
                        {item.status === 'planned' ? (
                          <span className="font-medium text-muted-foreground/60">{item.label}</span>
                        ) : (
                          <Link href={item.href} className="font-medium text-sky-300 hover:underline">
                            {item.label}
                          </Link>
                        )}
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </td>
                      <td className="w-32 px-4 py-3 align-top">
                        <StatusPill tone={TONE[item.status]}>{item.status}</StatusPill>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                        {item.upstream}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">The largest gap</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Five of the eight <code className="font-mono text-foreground/80">brainTrace</code>{' '}
            boxes — question, memory, understanding, context, and normalizedPlan
            — are never written to the database, and no endpoint returns a
            stored trace or fetches one log by id. So you can inspect a turn you
            asked yourself, but not one a student asked. Re-asking their question
            produces a different turn, against different data, at a different
            time. An endpoint that returns a stored trace is the highest-value
            thing to add to the brain next.
          </p>
        </section>
      </main>
    </>
  );
}
