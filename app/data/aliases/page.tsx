import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { AliasTable } from '@/components/identities/AliasTable';

export const metadata: Metadata = {
  title: 'Aliases | RockyGPT Dev',
  description: 'Every other name a campus entity answers to, what a lookup by it finds, and why the alias exists.',
};

export default function AliasesPage() {
  return <>
    <PageHeader title="Aliases" subtitle="Every other name a campus entity answers to: what a lookup by it finds, and why the alias exists." />
    <main className="min-w-0 p-4 lg:p-6"><AliasTable /></main>
  </>;
}
