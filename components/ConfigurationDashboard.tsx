'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shell/PageHeader';
import { JsonViewer } from '@/components/JsonViewer';
import {
  Settings2,
  DollarSign,
  Clock,
  Cpu,
  Layers,
  Globe,
  RefreshCw,
  Coins,
  Scale,
} from 'lucide-react';

interface ConfigData {
  version: string;
  provider: string;
  model: string;
  draft_reasoning: string;
  continuation_reasoning: string;
  review_reasoning: string;
  draft_output_tokens: number;
  review_output_tokens: number;
  max_input_tokens: number;
  max_draft_calls: number;
  max_model_calls: number;
  max_tool_calls: number;
  max_retrieval_rounds: number;
  max_turn_cost_nusd: number;
  turn_seconds: number;
  http_turn_seconds: number;
  answer_reserve_seconds: number;
  review_reserve_seconds: number;
  active_turns: number;
  review_policy: string;
  price: {
    version: string;
    valid_from: string;
    valid_until: string;
    input_nusd: number;
    cached_input_nusd: number;
    output_nusd: number;
    source: string;
  };
  monthlyCapNusd: number;
  environment: string;
  timezone: string;
}

export function ConfigurationDashboard() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brain/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setConfig(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const formatNusd = (nusd: number) => `$${(nusd / 1_000_000_000).toFixed(2)}`;
  const formatTokensPerMillion = (nusd: number) => `$${(nusd / 1_000).toFixed(2)} / 1M tokens`;

  return (
    <>
      <PageHeader
        title="Configuration"
        subtitle="Models, budget constraints, timing limits, and active deployment parameters"
        actions={
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <main className="min-w-0 space-y-6 px-6 py-6">
        {/* Top KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Monthly AI Budget
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <DollarSign className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-emerald-400">
                {config ? formatNusd(config.monthlyCapNusd) : '$10.00'}
              </span>
              <span className="text-xs text-muted-foreground">cap</span>
            </div>
            <div className="mt-2 text-[11px] text-emerald-400/80">
              Strict accounting ledger
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Max Concurrency
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <Layers className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-white">
                {config?.active_turns ?? 4}
              </span>
              <span className="text-xs text-muted-foreground">slots</span>
            </div>
            <div className="mt-2 text-[11px] text-sky-400/80">
              Bounded semaphore turns
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Turn Timeout
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-amber-300">
                {config?.turn_seconds ?? 45}s
              </span>
              <span className="text-xs text-muted-foreground">({config?.http_turn_seconds ?? 47}s HTTP)</span>
            </div>
            <div className="mt-2 text-[11px] text-amber-400/80">
              Deterministic fallback deadline
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Environment
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                <Globe className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-purple-300 capitalize">
                {config?.environment ?? 'development'}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-purple-400/80">
              {config?.timezone ?? 'America/New_York'}
            </div>
          </div>
        </div>

        {/* Configuration Sections */}
        {config && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Model & Reasoning Card */}
            <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Cpu className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-white">Model & Reasoning Architecture</h2>
              </div>
              <dl className="mt-4 divide-y divide-white/5 text-xs">
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Deployment Version</dt>
                  <dd className="font-mono text-neutral-200">{config.version}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Model Provider</dt>
                  <dd className="font-medium text-neutral-200 uppercase">{config.provider}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Primary Model</dt>
                  <dd className="font-mono text-sky-400">{config.model}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Draft Reasoning Effort</dt>
                  <dd className="capitalize text-neutral-200">{config.draft_reasoning}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Review Reasoning Effort</dt>
                  <dd className="capitalize text-neutral-200">{config.review_reasoning}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Review Policy</dt>
                  <dd className="font-mono text-neutral-300">{config.review_policy}</dd>
                </div>
              </dl>
            </div>

            {/* Token Budgets & Constraints */}
            <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Coins className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Token Rates & Turn Pricing</h2>
              </div>
              <dl className="mt-4 divide-y divide-white/5 text-xs">
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Standard Input Price</dt>
                  <dd className="font-mono text-emerald-400">{formatTokensPerMillion(config.price.input_nusd)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Cached Input Price</dt>
                  <dd className="font-mono text-emerald-400">{formatTokensPerMillion(config.price.cached_input_nusd)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Output Price</dt>
                  <dd className="font-mono text-emerald-400">{formatTokensPerMillion(config.price.output_nusd)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Max Turn Cost Cap</dt>
                  <dd className="font-mono text-amber-300">{formatNusd(config.max_turn_cost_nusd)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Price Rate Card Valid From</dt>
                  <dd className="text-neutral-300">{config.price.valid_from} to {config.price.valid_until}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Rate Source</dt>
                  <dd className="truncate max-w-[200px] text-neutral-500">{config.price.source}</dd>
                </div>
              </dl>
            </div>

            {/* Turn Execution Limits */}
            <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Scale className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Execution & Context Limits</h2>
              </div>
              <dl className="mt-4 divide-y divide-white/5 text-xs">
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Max Input Context</dt>
                  <dd className="font-mono text-neutral-200">{config.max_input_tokens.toLocaleString()} tokens</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Draft Max Output Tokens</dt>
                  <dd className="font-mono text-neutral-200">{config.draft_output_tokens.toLocaleString()} tokens</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Review Max Output Tokens</dt>
                  <dd className="font-mono text-neutral-200">{config.review_output_tokens.toLocaleString()} tokens</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Max Draft Calls / Turn</dt>
                  <dd className="font-mono text-neutral-200">{config.max_draft_calls}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Max Tool Calls / Turn</dt>
                  <dd className="font-mono text-neutral-200">{config.max_tool_calls}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Max Retrieval Rounds</dt>
                  <dd className="font-mono text-neutral-200">{config.max_retrieval_rounds}</dd>
                </div>
              </dl>
            </div>

            {/* Time Reserves */}
            <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Clock className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-white">Turn Timing Allocation</h2>
              </div>
              <dl className="mt-4 divide-y divide-white/5 text-xs">
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Total Turn Budget</dt>
                  <dd className="font-mono text-neutral-200">{config.turn_seconds} seconds</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">HTTP Wire Deadline</dt>
                  <dd className="font-mono text-neutral-200">{config.http_turn_seconds} seconds</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Answer Composition Reserve</dt>
                  <dd className="font-mono text-purple-300">{config.answer_reserve_seconds} seconds</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Review Verification Reserve</dt>
                  <dd className="font-mono text-purple-300">{config.review_reserve_seconds} seconds</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-neutral-400">Timezone</dt>
                  <dd className="text-neutral-300">{config.timezone}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Raw Config JSON Inspector */}
        <div className="rounded-2xl border border-white/10 bg-neutral-950/80 p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2 pb-3">
            <Settings2 className="h-4 w-4 text-sky-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Complete Brain Configuration Payload
            </h2>
          </div>
          {loading ? (
            <div className="flex h-32 items-center justify-center text-neutral-500">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading configuration from Brain...
            </div>
          ) : error ? (
            <div className="flex h-32 items-center justify-center text-rose-400">
              {error}
            </div>
          ) : (
            config && <JsonViewer data={config} alwaysOpen={true} />
          )}
        </div>
      </main>
    </>
  );
}
