import type { Metadata } from 'next';
import { EndpointConsole } from '@/components/EndpointConsole';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Endpoints | RockyGPT Dev',
  description: 'The brain’s shaped campus routes, with a request builder.',
};

export default function EndpointsPage() {
  return (
    <>
      <PageHeader
        title="Endpoints"
        subtitle="The shaped campus routes the student app consumes directly"
      />
      <main className="min-w-0 px-6 py-6">
        <EndpointConsole />
      </main>
    </>
  );
}
