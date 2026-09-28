import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TemplatesDashboard } from '@/components/TemplatesDashboard';

export const metadata: Metadata = {
  title: 'Templates | RockyGPT Dev',
  description: 'Every answer code writes itself, what picks it, and what it checks',
};

export default function TemplatesPage() {
  return (
    <Suspense>
      <TemplatesDashboard />
    </Suspense>
  );
}
