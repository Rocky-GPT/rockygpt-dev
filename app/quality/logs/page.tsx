import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Chat Logs | RockyGPT Dev',
  description: 'Preserved while the clean-room log contract is rebuilt.',
};

export default function LogsPage() {
  return (
    <>
      <PageHeader title="Chat Logs" subtitle="Waiting on the clean-room Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="a new log and telemetry contract" />
      </main>
    </>
  );
}
