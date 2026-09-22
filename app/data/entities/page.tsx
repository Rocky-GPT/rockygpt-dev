import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { KnowledgeExplorer } from '@/components/identities/KnowledgeExplorer';

export const metadata: Metadata = {
  title: 'Campus Graph | RockyGPT Dev',
  description: 'Explore campus entities, their properties and published relationships.',
};

export default function EntitiesPage() {
  return <>
    <PageHeader title="Campus Graph" subtitle="Explore the people, places, courses, and communities connected across Ramapo College." />
    <main className="min-w-0 p-4 lg:p-6"><KnowledgeExplorer /></main>
  </>;
}
