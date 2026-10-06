import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyHash } from '@/components/dev/CopyHash';
import { ErrorPanel } from '@/components/ErrorPanel';
import { PageHeader } from '@/components/shell/PageHeader';
import { readBrainDev } from '@/lib/brain-proxy';
import type { DevOffices } from '@/lib/brain-dev-types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Release | RockyGPT Dev',
  description: 'The published data the Brain answers from.',
};

export default async function ReleasePage() {
  const result = await readBrainDev<DevOffices>('/v1/dev/offices');
  const release = result.data;
  const distinctAliases = release
    ? new Set(release.offices.flatMap((office) => office.aliases)).size
    : 0;

  return (
    <>
      <PageHeader title="Release" subtitle="The published data the Brain answers from" />
      <main className="min-w-0 space-y-6 px-6 py-6">
        {!release && <ErrorPanel title="Could not read the release" detail={result.problem} />}

        {release && (
          <>
            {release.truncated && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                <h2 className="font-semibold">The Brain truncated its list of offices</h2>
                <p className="mt-1">
                  The counts below cover only the offices the Brain returned. Published offices
                  beyond them are not counted.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              <Tile label="Offices" value={release.offices.length} />
              <Tile
                label="Alias entries"
                value={release.offices.reduce((total, office) => total + office.aliases.length, 0)}
              />
              <Tile label="Distinct alias names" value={distinctAliases} />
              <Tile
                label="Offices with no alias"
                value={release.offices.filter((office) => office.aliases.length === 0).length}
              />
            </div>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Dataset version
                </p>
                <p className="mt-1 break-all font-mono text-sm text-foreground">
                  {release.datasetVersion}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Identity hash
                </p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <p className="min-w-0 break-all font-mono text-sm text-foreground">
                    {release.identityHash}
                  </p>
                  <CopyHash value={release.identityHash} />
                </div>
              </div>
            </section>
          </>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground">
          <h2 className="font-semibold text-foreground">What this page cannot show</h2>
          <p className="mt-2">
            This Brain does not report publish history or ingestion runs, so neither appears here.
            The page shows only the data the Brain is serving now.
          </p>
          <p className="mt-2">
            See{' '}
            <Link href="/data/records" className="text-sky-300 hover:underline">
              Offices
            </Link>{' '}
            for the facts and sources the Brain reads for each office. The{' '}
            <Link href="/data/storage" className="text-sky-300 hover:underline">
              Storage
            </Link>{' '}
            page shows the production Brain&rsquo;s numbers only, not this Brain&rsquo;s database.
          </p>
        </section>
      </main>
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
