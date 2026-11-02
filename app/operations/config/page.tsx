import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ErrorPanel';
import { ConfigView } from '@/components/dev/ConfigView';
import { PageHeader } from '@/components/shell/PageHeader';
import type { DevRuntime } from '@/lib/brain-dev-types';
import { readBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Configuration | RockyGPT Dev',
  description: 'The limits and model this Brain runs with.',
};

export default async function ConfigurationPage() {
  const { data, problem } = await readBrainDev<DevRuntime>('/v1/dev/runtime');

  return (
    <>
      <PageHeader title="Configuration" subtitle="The limits and model this Brain runs with" />
      <main className="min-w-0 px-6 py-6">
        {data ? (
          <ConfigView runtime={data} />
        ) : (
          <ErrorPanel title="Could not read the Brain’s runtime" detail={problem} />
        )}
      </main>
    </>
  );
}
