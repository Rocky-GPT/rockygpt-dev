import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ErrorPanel';
import { RecordsBrowser } from '@/components/RecordsBrowser';
import { PageHeader } from '@/components/shell/PageHeader';
import { readBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Records | RockyGPT Dev',
  description: 'What each capability returns when nothing narrows it.',
};

export default async function RecordsPage() {
  const { data, problem } = await readBrain<{ capabilities: { capability: string }[] }>(
    '/v1/capabilities'
  );
  const names = data?.capabilities.map((one) => one.capability);

  return (
    <>
      <PageHeader
        title="Records"
        subtitle="Executor output with no filters applied — the brain's records route takes no parameters"
      />
      <main className="min-w-0 px-6 py-6">
        {names ? (
          <RecordsBrowser capabilities={names} />
        ) : (
          <ErrorPanel title="The capability list could not be read." detail={problem} />
        )}
      </main>
    </>
  );
}
