import type { Metadata } from 'next';
import { StorageDashboard } from '@/components/StorageDashboard';

export const metadata: Metadata = {
  title: 'Storage | RockyGPT Dev',
  description: 'Database size, what uses it, and the releases kept, in production and locally',
};

export default function StoragePage() {
  return <StorageDashboard />;
}
