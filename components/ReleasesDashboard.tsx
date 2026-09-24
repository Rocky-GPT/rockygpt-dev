'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shell/PageHeader';
import { JsonViewer } from '@/components/JsonViewer';
import {
  Database,
  CheckCircle2,
  ExternalLink,
  Shield,
  Layers,
  RefreshCw,
  GitBranch,
  Calendar,
} from 'lucide-react';

interface CampusSource {
  id: string;
  source_key: string;
  title: string;
  canonical_url: string;
  trust_tier: string;
  provenance_status: string;
}

interface ReleasesData {
  brainRelease: {
    version: string;
    provider: string;
    model: string;
    turn_seconds: number;
    active_turns: number;
    max_turn_cost_nusd: number;
  };
  dataset: {
    id: string;
    version: string;
    activatedAt: string;
    sourcesCount: number;
    sources: CampusSource[];
    /** Set by the Brain when the campus database could not be read. */
    error?: string;
  } | null;
}

export function ReleasesDashboard() {
  const [data, setData] = useState<ReleasesData | null>(null);
  const datasetError = data?.dataset?.error;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReleases = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brain/releases');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load releases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReleases();
  }, []);

  const formatDate = (iso?: string) => {
    if (!iso) return 'Unknown';
    try {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <>
      <PageHeader
        title="Releases"
        subtitle="Active campus dataset version, ingestion sources, and brain engine release"
        actions={
          <button
            onClick={fetchReleases}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <main className="min-w-0 space-y-6 px-6 py-6">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}
        {/* Top KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Campus Dataset
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Database className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={`truncate text-base font-bold tracking-tight font-mono ${datasetError ? 'text-red-300' : 'text-emerald-400'}`}>
                {datasetError ? 'Unavailable' : data?.dataset?.version ?? 'Loading...'}
              </span>
            </div>
            {/* A failed dataset read showed "Loading..." forever beside a
                pulsing "Active in Neon DB". */}
            {datasetError ? (
              <p role="alert" className="mt-2 text-xs text-red-300 break-words">{datasetError}</p>
            ) : data?.dataset?.version ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Active release</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Engine Release
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <GitBranch className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="truncate text-base font-bold tracking-tight text-white font-mono">
                {data?.brainRelease?.version ?? 'Loading...'}
              </span>
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              {data?.brainRelease?.model ?? 'gpt-5.4'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Verified Sources
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                <Shield className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-purple-300">
                {data?.dataset?.sourcesCount ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">directories</span>
            </div>
            <div className="mt-2 text-xs text-purple-400/80">
              Official Primary & Secondary
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Activated At
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <Calendar className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xs font-medium text-white truncate">
                {formatDate(data?.dataset?.activatedAt)}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Production timestamp
            </div>
          </div>
        </div>

        {/* Verified Sources Table */}
        <div className="rounded-2xl border border-white/10 bg-neutral-900/60 shadow-lg backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 bg-neutral-900/80 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Active Verified Campus Sources</h2>
            </div>
            <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-xs text-emerald-400 font-medium">
              Grounded Evidence Base
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-neutral-950/50 text-neutral-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3 font-medium">Source Title</th>
                  <th className="px-5 py-3 font-medium">Key</th>
                  <th className="px-5 py-3 font-medium">Canonical URL</th>
                  <th className="px-5 py-3 font-medium">Trust Tier</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-neutral-300">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-neutral-500">
                      <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                      Loading verified sources...
                    </td>
                  </tr>
                ) : data?.dataset?.sources && data.dataset.sources.length > 0 ? (
                  data.dataset.sources.map((src) => (
                    <tr key={src.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 font-medium text-white">{src.title}</td>
                      <td className="px-5 py-3 font-mono text-neutral-400">{src.source_key}</td>
                      <td className="px-5 py-3">
                        <a
                          href={src.canonical_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline max-w-xs truncate"
                        >
                          <span className="truncate">{src.canonical_url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                            src.trust_tier === 'official_primary'
                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                              : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {src.trust_tier.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          {src.provenance_status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-neutral-500">
                      No active sources found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Raw Release Payload */}
        <div className="rounded-2xl border border-white/10 bg-neutral-950/80 p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2 pb-3">
            <Layers className="h-4 w-4 text-sky-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Release Specification Payload
            </h2>
          </div>
          {data && <JsonViewer data={data} alwaysOpen={true} />}
        </div>
      </main>
    </>
  );
}
