import type { Metadata } from 'next';
import { EvalRunsDashboard } from '@/components/EvalRunsDashboard';

export const metadata: Metadata = {
  title: 'Eval Runs | RockyGPT Dev',
  description: 'Historical evaluation benchmark runs and regression scorecards from PostgreSQL.',
};

export default function EvalRunsPage() {
  return <EvalRunsDashboard />;
}
