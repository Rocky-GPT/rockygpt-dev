import type { Metadata } from 'next';
import { ArtifactBrowser } from '@/components/ArtifactBrowser';
import { PageHeader } from '@/components/shell/PageHeader';
import { ARTIFACTS } from '@/lib/brain-routes';

export const metadata: Metadata = {
  title: 'Artifacts | RockyGPT Dev',
  description: 'Published campus datasets, with the release each one came from.',
};

export default function ArtifactsPage() {
  return (
    <>
      <PageHeader
        title="Artifacts"
        subtitle="Published campus datasets and the release metadata they carry"
      />
      <main className="min-w-0 px-6 py-6">
        <ArtifactBrowser artifacts={ARTIFACTS} />
      </main>
    </>
  );
}
