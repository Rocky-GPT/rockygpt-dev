import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Chat Logs | RockyGPT Dev',
  description: 'Not built for this Brain.',
};

export default function LogsPage() {
  return (
    <>
      <PageHeader title="Chat Logs" subtitle="Not built for this Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="a GET /v1/logs route" />
      </main>
    </>
  );
}
