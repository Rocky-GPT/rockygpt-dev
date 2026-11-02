'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/shell/PageHeader';
import {
  MessageSquareCode,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Tags,
} from 'lucide-react';
import {
  FEEDBACK_LIMIT,
  OPERATOR_REVIEW,
  REASONS,
  TOPICS,
  formatUsd,
  freshTag,
  planRun,
  reasonLabel,
  reasonOf,
  summarize,
  topicLabel,
  type FeedbackItem,
  type FeedbackSummary,
  type FeedbackTags,
  type ReasonKey,
  type TopicTag,
} from '@/lib/feedback-tags';

interface TagState {
  tags: FeedbackTags;
  spentNusd: number;
  jevReady: boolean;
}

interface SortResult {
  tagged: number;
  failed: number;
  firstError: string | null;
  remaining: number;
  costNusd: number;
  stopped: string | null;
  tags: FeedbackTags;
  spentNusd: number;
}

type TopicFilter = 'all' | 'unsorted' | TopicTag;
type ReasonFilter = 'all' | ReasonKey;

const TOPIC_OPTIONS: TopicTag[] = [...(Object.keys(TOPICS) as TopicTag[]), 'unsure', 'no_text'];
const REASON_OPTIONS: ReasonKey[] = [...(Object.keys(REASONS) as ReasonKey[]), 'unsure', 'none'];

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function estimate(nusd: number): string {
  const cost = formatUsd(nusd);
  return cost.startsWith('under') ? cost : `about ${cost}`;
}

function sortSummary(result: SortResult): { tone: 'ok' | 'error'; text: string } {
  const parts: string[] = [];
  if (result.tagged > 0) parts.push(`Sorted ${plural(result.tagged, 'rating')} for ${formatUsd(result.costNusd)}.`);
  if (result.stopped) parts.push(`Jev stopped: ${result.stopped}.`);
  else if (result.failed > 0) {
    parts.push(`${result.failed} couldn't be sorted (${result.firstError ?? 'unknown error'}).`);
  }
  if (result.remaining > 0 && !result.stopped) parts.push(`${result.remaining} left. Press Sort again.`);
  if (parts.length === 0) parts.push('Nothing new to sort.');
  return { tone: result.stopped || result.failed > 0 ? 'error' : 'ok', text: parts.join(' ') };
}

export function FeedbackDashboard() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [tagState, setTagState] = useState<TagState | null>(null);
  const [sorting, setSorting] = useState(false);
  const [sortNote, setSortNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/feedback-tags', { cache: 'no-store' });
      if (res.ok) setTagState((await res.json()) as TagState);
    } catch {
      // Ratings still show without tags.
    }
  };

  const fetchFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brain/feedback?limit=${FEEDBACK_LIMIT}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load feedback: HTTP ${res.status}`);
      }
      const data = await res.json();
      setFeedback(data.feedback || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to feedback database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchFeedback();
    void fetchTags();
  }, []);

  const sortWithJev = async () => {
    setSorting(true);
    setSortNote(null);
    try {
      const res = await fetch('/api/feedback-tags', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as Partial<SortResult> & { error?: string };
      if (!res.ok) throw new Error(body.error || `Sorting failed: HTTP ${res.status}`);
      const result = body as SortResult;
      setTagState((prev) => ({ jevReady: prev?.jevReady ?? true, tags: result.tags, spentNusd: result.spentNusd }));
      setSortNote(sortSummary(result));
    } catch (err) {
      setSortNote({ tone: 'error', text: err instanceof Error ? err.message : 'Sorting failed' });
    } finally {
      setSorting(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tags = useMemo(() => tagState?.tags ?? {}, [tagState]);
  const plan = useMemo(() => planRun(feedback, tags), [feedback, tags]);
  const toSort = plan.free.length + plan.paid.length;
  const summary = useMemo(() => summarize(feedback, tags), [feedback, tags]);

  // Metrics
  const totalCount = feedback.length;
  const positiveCount = useMemo(() => feedback.filter((f) => f.rating > 0).length, [feedback]);
  const negativeCount = totalCount - positiveCount;
  const csatScore = totalCount > 0 ? Math.round((positiveCount / totalCount) * 100) : 100;

  // Filtered entries
  const filteredFeedback = useMemo(() => {
    return feedback.filter((item) => {
      if (ratingFilter === 'positive' && item.rating <= 0) return false;
      if (ratingFilter === 'negative' && item.rating > 0) return false;

      const tag = freshTag(item, tags);
      if (topicFilter !== 'all' && (tag?.topic ?? 'unsorted') !== topicFilter) return false;
      if (reasonFilter !== 'all' && reasonOf(item, tag)?.reason !== reasonFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        (item.comments && item.comments.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    });
  }, [feedback, tags, ratingFilter, topicFilter, reasonFilter, searchQuery]);

  const showTopic = (topic: TopicTag) => {
    setTopicFilter((current) => (current === topic ? 'all' : topic));
  };

  const showReason = (reason: ReasonKey) => {
    setReasonFilter((current) => (current === reason ? 'all' : reason));
    setRatingFilter('negative');
  };

  const jevReady = tagState?.jevReady ?? false;

  return (
    <>
      <PageHeader
        title="Student & Operator Feedback"
        subtitle="Real-time ratings, issue reports, and operator audit reviews from PostgreSQL"
        actions={
          <>
            <button
              onClick={() => void sortWithJev()}
              disabled={!jevReady || toSort === 0 || sorting || loading}
              title={
                !jevReady
                  ? 'Add TYPESAFE_API_KEY to .env to sort with Jev'
                  : toSort > 0
                    ? `${plural(plan.paid.length, 'Jev call')}, ${estimate(plan.estimatedNusd)}`
                    : 'Every rating shown is sorted'
              }
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              <Tags className={`w-3.5 h-3.5 ${sorting ? 'animate-pulse' : ''}`} />
              {sorting ? 'Sorting…' : toSort > 0 ? `Sort ${toSort} with Jev` : 'All sorted'}
            </button>
            <button
              onClick={() => {
                void fetchFeedback();
                void fetchTags();
              }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </>
        }
      />

      <main className="min-w-0 px-6 py-6 space-y-6">
        {sortNote && (
          <p
            role="status"
            className={`rounded-lg border px-3 py-2 text-xs ${
              sortNote.tone === 'ok'
                ? 'border-sky-500/20 bg-sky-500/10 text-sky-200'
                : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
            }`}
          >
            {sortNote.text}
          </p>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Satisfaction Score</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">{csatScore}%</span>
              <span className="text-xs text-muted-foreground font-mono">positive</span>
            </div>
            <div className="mt-3 w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{ width: `${csatScore}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Reviews</span>
              <MessageSquareCode className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">{totalCount}</span>
              <span className="text-xs text-muted-foreground">submitted</span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground flex gap-3">
              <span className="text-emerald-400 font-mono">+{positiveCount} up</span>
              <span className="text-rose-400 font-mono">-{negativeCount} down</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Upvotes</span>
              <ThumbsUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">{positiveCount}</span>
              <span className="text-xs text-muted-foreground">helpful answers</span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Stored in <code className="text-white/60 font-mono">rockygpt_v2.feedback</code>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Downvotes / Flags</span>
              <ThumbsDown className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-rose-400">{negativeCount}</span>
              <span className="text-xs text-muted-foreground">actionable issues</span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Kept until removed on request
            </div>
          </div>
        </div>

        <UnhappyPanel
          summary={summary}
          jevReady={jevReady}
          spentNusd={tagState?.spentNusd ?? 0}
          topicFilter={topicFilter}
          reasonFilter={reasonFilter}
          onTopic={showTopic}
          onReason={showReason}
        />

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-card p-3 rounded-xl border border-border">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search question, answer, or comments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-black/20 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-sky-400/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              aria-label="Topic"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value as TopicFilter)}
              className="py-1.5 pl-2 pr-6 text-xs bg-black/20 border border-border rounded-lg text-foreground focus:outline-none focus:border-sky-400/50"
            >
              <option value="all">All topics</option>
              {TOPIC_OPTIONS.map((topic) => (
                <option key={topic} value={topic}>
                  {topicLabel(topic)}
                </option>
              ))}
              <option value="unsorted">Not sorted yet</option>
            </select>
            <select
              aria-label="Reason"
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as ReasonFilter)}
              className="py-1.5 pl-2 pr-6 text-xs bg-black/20 border border-border rounded-lg text-foreground focus:outline-none focus:border-sky-400/50"
            >
              <option value="all">All reasons</option>
              {REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reasonLabel(reason)}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-border p-0.5 bg-black/20 text-xs">
              <button
                onClick={() => setRatingFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  ratingFilter === 'all'
                    ? 'bg-white/10 text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                onClick={() => setRatingFilter('positive')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  ratingFilter === 'positive'
                    ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                    : 'text-muted-foreground hover:text-emerald-400'
                }`}
              >
                Upvoted ({positiveCount})
              </button>
              <button
                onClick={() => setRatingFilter('negative')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  ratingFilter === 'negative'
                    ? 'bg-rose-500/20 text-rose-300 font-medium'
                    : 'text-muted-foreground hover:text-rose-400'
                }`}
              >
                Downvoted ({negativeCount})
              </button>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Feedback Database Error</p>
              <p className="text-xs text-rose-400/90 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Feedback List */}
        {loading && feedback.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />
            Querying Neon PostgreSQL feedback table...
          </div>
        ) : filteredFeedback.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-xs border border-dashed border-border rounded-xl">
            No feedback entries match your search criteria.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFeedback.map((item) => {
              const isExpanded = expandedIds.has(item.id);
              const isUpvote = item.rating > 0;
              const tag = freshTag(item, tags);
              const why = reasonOf(item, tag);
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isUpvote
                      ? 'bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/30'
                      : 'bg-rose-950/10 border-rose-500/20 hover:border-rose-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isUpvote
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {isUpvote ? (
                          <>
                            <ThumbsUp className="w-3 h-3" /> Upvoted
                          </>
                        ) : (
                          <>
                            <ThumbsDown className="w-3 h-3" /> Issue Reported
                          </>
                        )}
                      </span>

                      {tag && (
                        <span
                          title="Topic picked by Jev"
                          className="px-2 py-0.5 rounded text-[11px] bg-sky-500/10 text-sky-200 border border-sky-500/20"
                        >
                          {topicLabel(tag.topic)}
                        </span>
                      )}

                      {why && (
                        <span
                          title={why.byJev ? 'Reason picked by Jev' : 'Reason the student picked'}
                          className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-200 border border-rose-500/20"
                        >
                          {reasonLabel(why.reason)}
                          {why.byJev && <span className="ml-1 text-rose-300/60">· Jev</span>}
                        </span>
                      )}

                      {item.category === OPERATOR_REVIEW && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 text-muted-foreground border border-white/10">
                          your review
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(item.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  {/* Question */}
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
                      <span className="text-muted-foreground font-normal">Question:</span>
                      &ldquo;{item.question}&rdquo;
                    </h4>
                  </div>

                  {/* Comments if present */}
                  {item.comments && (
                    <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90">
                      <span className="text-muted-foreground font-medium mr-1.5">Feedback Note:</span>
                      &ldquo;{item.comments}&rdquo;
                    </div>
                  )}

                  {/* Answer (Collapsible) */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Request ID: {item.requestId.slice(0, 18)}...
                      </span>
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        {isExpanded ? (
                          <>
                            Hide Assistant Answer <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            View Assistant Answer <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 p-3 rounded-lg bg-black/40 border border-white/5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
                        {item.answer}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

/** Topics by thumbs down and the reasons behind them. Clicking a row filters the list below. */
function UnhappyPanel({
  summary,
  jevReady,
  spentNusd,
  topicFilter,
  reasonFilter,
  onTopic,
  onReason,
}: {
  summary: FeedbackSummary;
  jevReady: boolean;
  spentNusd: number;
  topicFilter: TopicFilter;
  reasonFilter: ReasonFilter;
  onTopic: (topic: TopicTag) => void;
  onReason: (reason: ReasonKey) => void;
}) {
  const empty = summary.topics.length === 0 && summary.reasons.length === 0;
  return (
    <section aria-labelledby="unhappy-heading" className="rounded-xl bg-card border border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="unhappy-heading" className="text-sm font-semibold text-foreground">
          What students are unhappy about
        </h2>
        <span className="text-xs text-muted-foreground">
          {summary.sorted} of {summary.students} student ratings sorted by Jev
        </span>
      </div>

      {empty ? (
        <p className="px-4 py-6 text-xs text-muted-foreground">
          Nothing sorted yet. Press <strong className="text-foreground">Sort with Jev</strong> to tag
          each rating with a topic and, for a thumbs down with no reason, why.
        </p>
      ) : (
        <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              By topic
            </h3>
            {summary.topics.length === 0 ? (
              <p className="text-xs text-muted-foreground">No topics yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="pb-2 font-medium">Topic</th>
                    <th className="pb-2 pl-3 text-right font-medium">
                      <ThumbsDown aria-label="Thumbs down" className="ml-auto w-3.5 h-3.5 text-rose-400" />
                    </th>
                    <th className="pb-2 pl-3 text-right font-medium">
                      <ThumbsUp aria-label="Thumbs up" className="ml-auto w-3.5 h-3.5 text-emerald-400" />
                    </th>
                    <th className="w-2/5 pb-2 pl-3 font-medium">
                      <span className="sr-only">Share thumbs down</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {summary.topics.map((row) => {
                    const share = row.down / (row.down + row.up);
                    const active = topicFilter === row.topic;
                    return (
                      <tr key={row.topic} className={active ? 'bg-sky-500/10' : undefined}>
                        <td className="py-1.5 pr-2">
                          <button
                            onClick={() => onTopic(row.topic)}
                            aria-pressed={active}
                            className="text-left text-foreground hover:text-sky-300 transition-colors"
                          >
                            {topicLabel(row.topic)}
                          </button>
                        </td>
                        <td className="py-1.5 pl-3 text-right font-mono text-rose-300">{row.down}</td>
                        <td className="py-1.5 pl-3 text-right font-mono text-emerald-300">{row.up}</td>
                        <td className="py-1.5 pl-3">
                          <div
                            role="img"
                            aria-label={`${Math.round(share * 100)}% thumbs down`}
                            className="h-1.5 overflow-hidden rounded-full bg-emerald-400/20"
                          >
                            <div className="h-full rounded-full bg-rose-400" style={{ width: `${share * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Why thumbs down
            </h3>
            {summary.reasons.length === 0 ? (
              <p className="text-xs text-muted-foreground">No thumbs down yet.</p>
            ) : (
              <ul className="space-y-1">
                {summary.reasons.map((row) => {
                  const active = reasonFilter === row.reason;
                  return (
                    <li key={row.reason}>
                      <button
                        onClick={() => onReason(row.reason)}
                        aria-pressed={active}
                        className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                          active ? 'bg-rose-500/15 text-rose-200' : 'text-foreground hover:bg-white/5'
                        }`}
                      >
                        <span>
                          {reasonLabel(row.reason)}
                          {row.byJev > 0 && (
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              {row.byJev === row.count ? 'Jev' : `${row.byJev} by Jev`}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-rose-300">{row.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        {jevReady ? (
          <>
            Your own reviews from Chat Logs are left out. Tags stay on this computer in{' '}
            <code className="font-mono text-white/60">.data/feedback-tags.json</code>. Sorting has cost{' '}
            {formatUsd(spentNusd)} so far.
          </>
        ) : (
          <>
            To sort, add <code className="font-mono text-white/60">TYPESAFE_API_KEY</code> to
            rockygpt-dev&apos;s <code className="font-mono text-white/60">.env</code> (the same key as the
            Brain&apos;s <code className="font-mono text-white/60">BRAIN_TYPESAFE_API_KEY</code>) and restart{' '}
            <code className="font-mono text-white/60">npm run dev</code>.
          </>
        )}
      </p>
    </section>
  );
}
