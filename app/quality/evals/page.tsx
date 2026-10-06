import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Eval Runs | RockyGPT Dev',
  description: 'Switched off: the current Brain does not serve what this page reads.',
};

export default function EvalRunsPage() {
  return (
    <>
      <PageHeader title="Eval Runs" subtitle="Switched off for this Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending kind="off" contract="the GET and POST /v1/evals/runs routes" />
      </main>
    </>
  );
}
