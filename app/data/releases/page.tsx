import type { Metadata } from 'next';
import { ReleasesDashboard } from '@/components/ReleasesDashboard';

export const metadata: Metadata = {
  title: 'Releases | RockyGPT Dev',
  description: 'Active campus dataset version, ingestion sources, and brain engine release',
};

export default function ReleasesPage() {
  return <ReleasesDashboard />;
}
