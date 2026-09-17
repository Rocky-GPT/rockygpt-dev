import type { Metadata } from 'next';
import { ConfigurationDashboard } from '@/components/ConfigurationDashboard';

export const metadata: Metadata = {
  title: 'Configuration | RockyGPT Dev',
  description: 'Models, budget constraints, timing limits, and active deployment parameters',
};

export default function ConfigPage() {
  return <ConfigurationDashboard />;
}
