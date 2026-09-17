import type { Metadata } from 'next';
import { LogsDashboard } from '@/components/LogsDashboard';

export const metadata: Metadata = {
  title: 'Chat Logs | RockyGPT Dev',
  description: 'Live student turns, routes, and latency',
};

export default function LogsPage() {
  return <LogsDashboard />;
}

