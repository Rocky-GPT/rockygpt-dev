import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ErrorPanel';
import { OfficesBrowser } from '@/components/dev/OfficesBrowser';
import { PageHeader } from '@/components/shell/PageHeader';
import { readBrainDev } from '@/lib/brain-proxy';
import type { DevOffices } from '@/lib/brain-dev-types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Offices | RockyGPT Dev',
  description: 'The published offices and the facts the Brain reads for each.',
};

export default async function OfficesPage() {
  const offices = await readBrainDev<DevOffices>('/v1/dev/offices');

  return (
    <>
      <PageHeader
        title="Offices"
        subtitle="The published offices and the facts the Brain reads for each"
      />
      <main className="min-w-0 px-6 py-6">
        {offices.data ? (
          <OfficesBrowser data={offices.data} />
        ) : (
          <ErrorPanel title="Could not read the offices" detail={offices.problem} />
        )}
      </main>
    </>
  );
}
