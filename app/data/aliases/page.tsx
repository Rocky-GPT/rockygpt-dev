import type { Metadata } from 'next';
import { AliasesView } from '@/components/dev/AliasesView';
import { ErrorPanel } from '@/components/ErrorPanel';
import { PageHeader } from '@/components/shell/PageHeader';
import type { DevOffices } from '@/lib/brain-dev-types';
import { readBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Aliases | RockyGPT Dev',
  description: 'The other names an office answers to, and what the office lookup returns for a query.',
};

export default async function AliasesPage() {
  const offices = await readBrainDev<DevOffices>('/v1/dev/offices');

  return (
    <>
      <PageHeader title="Aliases" subtitle="The other names an office answers to, and what the office lookup returns for a query" />
      <main className="min-w-0 px-6 py-6">
        {offices.data ? (
          <AliasesView offices={offices.data} />
        ) : (
          <ErrorPanel title="The office list could not be read" detail={offices.problem} />
        )}
      </main>
    </>
  );
}
