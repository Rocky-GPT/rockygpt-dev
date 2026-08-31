import type { Metadata } from 'next';
import { OperationsBoard } from '@/components/OperationsBoard';
import { PageHeader } from '@/components/shell/PageHeader';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Service Health | RockyGPT Dev',
  description: 'Readiness, degradation, and reachability.',
};

export default function HealthPage() {
  return (
    <>
      <PageHeader
        title="Service Health"
        subtitle="Liveness and readiness from the current clean-room Brain shell"
      />
      <main className="min-w-0 px-6 py-6">
        <OperationsBoard />
      </main>
    </>
  );
}
