'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/shell/PageHeader';
import { JsonViewer } from '@/components/JsonViewer';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Timer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface EvalRun {
  id: string;
  runId: string;
  suite: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  summary: Record<string, unknown>;
  createdAt: string;
}

export function EvalRunsDashboard() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brain/evals/runs?limit=100', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load eval runs: HTTP ${res.status}`);
      }
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to eval runs database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuns();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Metrics
  const totalRuns = runs.length;
  const passedRuns = useMemo(() => runs.filter((r) => r.failed === 0).length, [runs]);
  const failedRuns = totalRuns - passedRuns;
  const totalTests = useMemo(() => runs.reduce((acc, r) => acc + r.totalTests, 0), [runs]);
  const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 100;

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (statusFilter === 'passed' && run.failed > 0) return false;
      if (statusFilter === 'failed' && run.failed === 0) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        run.suite.toLowerCase().includes(q) ||
        run.runId.toLowerCase().includes(q)
      );
    });
  }, [runs, statusFilter, searchQuery]);

  return (
    <>
      <PageHeader
        title="Evaluation & Benchmark Runs"
        subtitle="Black-box test suite scorecards, regression checks, and accuracy history from PostgreSQL"
        actions={
          <button
            onClick={() => void fetchRuns()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        }
      />

      <main className="min-w-0 px-6 py-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Suite Pass Rate</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">{passRate}%</span>
              <span className="text-xs text-muted-foreground font-mono">successful</span>
            </div>
            <div className="mt-3 w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{ width: `${passRate}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Benchmark Runs</span>
              <FlaskConical className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">{totalRuns}</span>
              <span className="text-xs text-muted-foreground font-mono">runs</span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground flex gap-3">
              <span className="text-emerald-400 font-mono">{passedRuns} passed</span>
              <span className="text-rose-400 font-mono">{failedRuns} regressions</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Evaluated Scenarios</span>
              <Timer className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-indigo-300">{totalTests}</span>
              <span className="text-xs text-muted-foreground">assertions tested</span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Stored in <code className="text-white/60 font-mono">brain_ops.eval_runs</code>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Regression Status</span>
              {failedRuns === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono ${
                  failedRuns === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {failedRuns === 0 ? 'Clean' : `${failedRuns} Regressed`}
              </span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {failedRuns === 0 ? 'All active suites passing' : 'Needs developer review'}
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card p-3 rounded-xl border border-border">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search suite name or run ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-black/20 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-sky-400/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex rounded-lg border border-border p-0.5 bg-black/20 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-white/10 text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({totalRuns})
              </button>
              <button
                onClick={() => setStatusFilter('passed')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'passed'
                    ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                    : 'text-muted-foreground hover:text-emerald-400'
                }`}
              >
                Passed ({passedRuns})
              </button>
              <button
                onClick={() => setStatusFilter('failed')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'failed'
                    ? 'bg-rose-500/20 text-rose-300 font-medium'
                    : 'text-muted-foreground hover:text-rose-400'
                }`}
              >
                Failed ({failedRuns})
              </button>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Eval Runs Database Error</p>
              <p className="text-xs text-rose-400/90 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Runs List */}
        {loading && runs.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />
            Querying Neon PostgreSQL eval runs...
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-xs border border-dashed border-border rounded-xl">
            No evaluation runs match your search criteria.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRuns.map((item) => {
              const isExpanded = expandedIds.has(item.id);
              const isPassed = item.failed === 0;
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isPassed
                      ? 'bg-card border-border hover:border-emerald-500/30'
                      : 'bg-rose-950/10 border-rose-500/30 hover:border-rose-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isPassed
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {isPassed ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> {item.failed} Failed
                          </>
                        )}
                      </span>

                      <div>
                        <h4 className="text-sm font-bold font-mono text-foreground flex items-center gap-2">
                          {item.suite}
                          <span className="text-xs font-normal text-muted-foreground">({item.runId})</span>
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                      <span>{item.durationMs}ms</span>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(item.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Test counts & bar */}
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">
                      Score: <strong className="text-emerald-400">{item.passed}</strong> / {item.totalTests} tests passed
                    </span>
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      {isExpanded ? (
                        <>
                          Hide Details <ChevronUp className="w-3 h-3" />
                        </>
                      ) : (
                        <>
                          View Suite Summary <ChevronDown className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <JsonViewer data={item.summary} title="Suite Execution Summary" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
