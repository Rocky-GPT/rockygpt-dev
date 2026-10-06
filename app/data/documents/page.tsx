import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Documents | RockyGPT Dev',
  description: 'Switched off: the current Brain does not serve what this page reads.',
};

export default function DocumentsPage() {
  return (
    <>
      <PageHeader title="Documents" subtitle="Switched off for this Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending kind="off" contract="a GET /v1/documents route" />
      </main>
    </>
  );
}
