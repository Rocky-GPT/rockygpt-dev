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
} from 'lucide-react';

interface FeedbackItem {
  id: string;
  requestId: string;
  question: string;
  answer: string;
  rating: number;
  category: string | null;
  comments: string | null;
  createdAt: string;
}

export function FeedbackDashboard() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brain/feedback?limit=100', { cache: 'no-store' });
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
  const totalCount = feedback.length;
  const positiveCount = useMemo(() => feedback.filter((f) => f.rating > 0).length, [feedback]);
  const negativeCount = totalCount - positiveCount;
  const csatScore = totalCount > 0 ? Math.round((positiveCount / totalCount) * 100) : 100;

  const categories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of feedback) {
      const cat = item.category || 'general';
      map[cat] = (map[cat] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [feedback]);

  // Filtered entries
  const filteredFeedback = useMemo(() => {
    return feedback.filter((item) => {
      if (ratingFilter === 'positive' && item.rating <= 0) return false;
      if (ratingFilter === 'negative' && item.rating > 0) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        (item.comments && item.comments.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    });
  }, [feedback, ratingFilter, searchQuery]);

  return (
    <>
      <PageHeader
        title="Student & Operator Feedback"
        subtitle="Real-time ratings, issue reports, and operator audit reviews from PostgreSQL"
        actions={
          <button
            onClick={() => void fetchFeedback()}
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
              90-day retention with expiry
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card p-3 rounded-xl border border-border">
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

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
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

        {/* Categories Breakdown Chips */}
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">Issue Types:</span>
            {categories.map(([cat, count]) => (
              <span
                key={cat}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 font-mono"
              >
                {cat}: <strong className="text-foreground">{count}</strong>
              </span>
            ))}
          </div>
        )}

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
                    <div className="flex items-center gap-2">
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

                      {item.category && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 text-muted-foreground border border-white/10">
                          {item.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
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
