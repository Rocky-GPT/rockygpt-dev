'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shell/PageHeader';
import {
  Brain,
  Copy,
  Check,
  Cpu,
  Sparkles,
  ShieldCheck,
  FileText,
  Search,
  RefreshCw,
  Terminal,
} from 'lucide-react';

interface PromptData {
  model: string;
  prompt: string;
  review: string;
  draftReasoning?: string;
  reviewReasoning?: string;
}

export function PromptsDashboard() {
  const [data, setData] = useState<PromptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'prompt' | 'review'>('prompt');
  const [copied, setCopied] = useState<'prompt' | 'review' | null>(null);
  const [search, setSearch] = useState('');

  const fetchPrompts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brain/prompts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleCopy = (tab: 'prompt' | 'review', text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(tab);
    setTimeout(() => setCopied(null), 2000);
  };

  const currentContent = activeTab === 'prompt' ? data?.prompt ?? '' : data?.review ?? '';
  const filteredContent = search
    ? currentContent
        .split('\n')
        .filter((line) => line.toLowerCase().includes(search.toLowerCase()))
        .join('\n')
    : currentContent;

  const wordCount = currentContent.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = currentContent.split('\n').length;

  return (
    <>
      <PageHeader
        title="Prompts & Models"
        subtitle="The instructions and models behind each stage of turn execution"
        actions={
          <button
            onClick={fetchPrompts}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <main className="min-w-0 space-y-6 px-6 py-6">
        {/* Top Overview Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Model
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <Cpu className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-white">
                {data?.model ?? 'gpt-4o-mini'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-sky-400">
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
              <span>Production Pipeline</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Draft Reasoning
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                <Sparkles className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-purple-300 capitalize">
                {data?.draftReasoning ?? 'Low'}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Candidate turn synthesis
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Review Reasoning
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-emerald-300 capitalize">
                {data?.reviewReasoning ?? 'Medium'}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Independent critic verification
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Prompt Size
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <FileText className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-white">
                {wordCount.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">words</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {lineCount} lines ({Math.round(currentContent.length / 4)} estimated tokens)
            </div>
          </div>
        </div>

        {/* Prompt Selector Tabs & Search */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl border border-white/10 bg-neutral-900/80 p-1 backdrop-blur-md">
            <button
              onClick={() => setActiveTab('prompt')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                activeTab === 'prompt'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Brain className="h-3.5 w-3.5" />
              <span>System Prompt (`prompt.md`)</span>
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                activeTab === 'review'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Critic Review (`review.md`)</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompt text..."
                className="w-full rounded-xl border border-white/10 bg-neutral-900/80 py-1.5 pl-9 pr-3 text-xs text-white placeholder-neutral-500 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <button
              onClick={() => handleCopy(activeTab, currentContent)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              {copied === activeTab ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Prompt Viewer Panel */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/80 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 bg-neutral-900/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-mono font-medium text-neutral-300">
                {activeTab === 'prompt'
                  ? 'rockygpt_brain/prompt.md'
                  : 'rockygpt_brain/review.md'}
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-500">
              Read-only active deployment
            </span>
          </div>

          <div className="p-4 overflow-x-auto max-h-[600px] overflow-y-auto font-mono text-xs text-neutral-300 leading-relaxed select-text">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-neutral-500">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading prompt from Brain...
              </div>
            ) : error ? (
              <div className="flex h-48 items-center justify-center text-rose-400">
                {error}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap">{filteredContent}</pre>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
