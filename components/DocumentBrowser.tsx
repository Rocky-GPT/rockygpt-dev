'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  ExternalLink,
  Search,
  Copy,
  Check,
  Layers,
  Info,
  ShieldCheck,
  RefreshCw,
  Hash,
} from 'lucide-react';

interface DocumentSummary {
  id: string;
  title: string;
  contentLength: number;
  chunkCount: number;
  canonicalUrl: string;
  sourceKey: string;
  trustTier: string;
  collectedAt: string;
  metadata: Record<string, unknown>;
}

interface DocumentChunk {
  id: string;
  chunkIndex: number;
  content: string;
  headingPath: string;
  metadata: Record<string, unknown>;
}

interface DocumentDetail extends DocumentSummary {
  content: string;
  chunks: DocumentChunk[];
}

export function DocumentBrowser() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'text' | 'chunks' | 'metadata'>('text');
  const [chunkFilter, setChunkFilter] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch all documents
  const fetchDocuments = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch('/api/brain/documents', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to load documents`);
      }
      const data = await res.json();
      const docs: DocumentSummary[] = data.documents || [];
      setDocuments(docs);
      if (docs.length > 0 && !selectedId) {
        setSelectedId(docs[0].id);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoadingList(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  // Fetch document detail when selectedId changes
  useEffect(() => {
    if (!selectedId) return;
    let isCurrent = true;
    const fetchDetail = async () => {
      setLoadingDoc(true);
      setDocError(null);
      try {
        const res = await fetch(`/api/brain/documents/${encodeURIComponent(selectedId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to fetch document details`);
        }
        const data = await res.json();
        if (isCurrent) {
          setSelectedDoc(data);
        }
      } catch (err) {
        if (isCurrent) {
          setDocError(err instanceof Error ? err.message : 'Failed to load document details');
        }
      } finally {
        if (isCurrent) {
          setLoadingDoc(false);
        }
      }
    };
    void fetchDetail();
    return () => {
      isCurrent = false;
    };
  }, [selectedId]);

  // Filtered documents for the left sidebar
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.sourceKey.toLowerCase().includes(q) ||
        d.canonicalUrl.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  // Filtered chunks for chunk inspector
  const filteredChunks = useMemo(() => {
    if (!selectedDoc?.chunks) return [];
    if (!chunkFilter.trim()) return selectedDoc.chunks;
    const q = chunkFilter.toLowerCase();
    return selectedDoc.chunks.filter(
      (c) =>
        c.headingPath.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        c.chunkIndex.toString() === q
    );
  }, [selectedDoc, chunkFilter]);

  const docLength = useMemo(() => {
    if (!selectedDoc) return 0;
    return selectedDoc.contentLength ?? selectedDoc.content?.length ?? 0;
  }, [selectedDoc]);

  const docChunkCount = useMemo(() => {
    if (!selectedDoc) return 0;
    return selectedDoc.chunkCount ?? selectedDoc.chunks?.length ?? 0;
  }, [selectedDoc]);

  const handleCopyText = async () => {
    if (!selectedDoc?.content) return;
    try {
      await navigator.clipboard.writeText(selectedDoc.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Top summary row */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Campus Source Documents & Policies
            </h2>
            <p className="text-xs text-muted-foreground">
              {documents.length} verified documents in database ·{' '}
              {documents.reduce((acc, d) => acc + d.chunkCount, 0).toLocaleString()} indexed text passages
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchDocuments()}
          disabled={loadingList}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingList ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {listError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {listError}
        </div>
      )}

      {/* Main master-detail view */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 min-h-[700px]">
        {/* Document list (Left column) */}
        <div className="lg:col-span-4 flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-sky-400/50"
            />
          </div>

          <div className="text-[11px] font-mono text-muted-foreground px-1 flex justify-between">
            <span>Showing {filteredDocs.length} of {documents.length}</span>
            <span>Total: {formatBytes(documents.reduce((acc, d) => acc + d.contentLength, 0))}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-[640px] pr-1">
            {loadingList && documents.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">Loading documents from PostgreSQL…</p>
            ) : filteredDocs.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No matching documents found.</p>
            ) : (
              filteredDocs.map((doc) => {
                const isSelected = doc.id === selectedId;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedId(doc.id)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'border-sky-400/50 bg-sky-400/15 text-foreground shadow-sm shadow-sky-500/10'
                        : 'border-white/10 bg-white/[0.02] text-foreground/80 hover:bg-white/[0.06] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-medium text-xs line-clamp-2">{doc.title}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap ${
                          isSelected
                            ? 'border-sky-400/30 bg-sky-400/20 text-sky-200'
                            : 'border-white/10 bg-white/5 text-muted-foreground'
                        }`}
                      >
                        {doc.chunkCount} chunks
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>{formatBytes(doc.contentLength)}</span>
                      <span>·</span>
                      <span className="truncate max-w-[140px]">{doc.sourceKey}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Document Preview (Right column) */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          {loadingDoc ? (
            <div className="flex flex-col items-center justify-center h-96 space-y-3 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
              <p className="text-xs font-mono">Loading full document and passages from PostgreSQL…</p>
            </div>
          ) : docError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
              {docError}
            </div>
          ) : selectedDoc ? (
            <>
              {/* Document Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="h-3 w-3" />
                      {selectedDoc.trustTier}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      ID: {selectedDoc.id.slice(0, 8)}…
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{selectedDoc.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <a
                      href={selectedDoc.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                    >
                      <span>{selectedDoc.canonicalUrl}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* View Mode Switcher */}
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('text')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      viewMode === 'text'
                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Full Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('chunks')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      viewMode === 'chunks'
                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Chunks ({selectedDoc.chunkCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('metadata')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      viewMode === 'metadata'
                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Info className="h-3.5 w-3.5" />
                    Metadata
                  </button>
                </div>
              </div>

              {/* View Mode 1: Full Document Text */}
              {viewMode === 'text' && (
                      <div className="space-y-3 flex-1 flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                            <span>{docLength.toLocaleString()} characters</span>
                            <span>·</span>
                            <span>~{(docLength / 5).toFixed(0)} words</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground" />
                              <input
                                type="text"
                                placeholder="Find in document…"
                                value={textFilter}
                                onChange={(e) => setTextFilter(e.target.value)}
                          className="rounded-lg border border-white/10 bg-black/20 pl-7 pr-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-sky-400/50 w-44"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyText()}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-foreground hover:bg-white/10 transition-colors"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-300 font-mono">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-muted-foreground" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-[560px] rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed select-text">
                    {textFilter ? (
                      selectedDoc.content
                        .split('\n')
                        .filter((line) => line.toLowerCase().includes(textFilter.toLowerCase()))
                        .join('\n') || (
                        <span className="text-muted-foreground italic">
                          No lines matching &quot;{textFilter}&quot;
                        </span>
                      )
                    ) : (
                      selectedDoc.content
                    )}
                  </div>
                </div>
              )}

              {/* View Mode 2: Indexed Chunks */}
              {viewMode === 'chunks' && (
                <div className="space-y-3 flex-1 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground font-mono">
                      {filteredChunks.length} of {selectedDoc.chunks.length} chunks shown
                    </p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Filter chunks or headings…"
                        value={chunkFilter}
                        onChange={(e) => setChunkFilter(e.target.value)}
                        className="rounded-lg border border-white/10 bg-black/20 pl-7 pr-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-sky-400/50 w-60"
                      />
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-[560px] space-y-3 pr-1">
                    {filteredChunks.length === 0 ? (
                      <p className="p-4 text-xs text-muted-foreground text-center">
                        No chunks match your search query.
                      </p>
                    ) : (
                      filteredChunks.map((chunk) => (
                        <div
                          key={chunk.id}
                          className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-sky-300">
                                <Hash className="h-2.5 w-2.5" />
                                Chunk #{chunk.chunkIndex}
                              </span>
                              {chunk.headingPath && (
                                <span className="text-xs font-semibold text-foreground/90 line-clamp-1">
                                  {chunk.headingPath}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                              {chunk.content.length} chars
                            </span>
                          </div>
                          <div className="rounded-lg bg-black/40 p-3 font-mono text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed select-text">
                            {chunk.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* View Mode 3: Provenance & Metadata */}
              {viewMode === 'metadata' && (
                <div className="space-y-4 flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Collection Details
                      </h4>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Document ID:</dt>
                          <dd className="font-mono text-foreground">{selectedDoc.id}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Source Key:</dt>
                          <dd className="font-mono text-foreground">{selectedDoc.sourceKey}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Trust Tier:</dt>
                          <dd className="font-mono text-emerald-400">{selectedDoc.trustTier}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Collected At:</dt>
                          <dd className="font-mono text-foreground">{selectedDoc.collectedAt}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Storage & Indexing
                      </h4>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Content Size:</dt>
                          <dd className="font-mono text-foreground">
                            {formatBytes(docLength)} ({docLength.toLocaleString()} bytes)
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Passage Chunks:</dt>
                          <dd className="font-mono text-foreground">{docChunkCount}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Lexical Vectors:</dt>
                          <dd className="font-mono text-emerald-400">PostgreSQL tsvector</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Raw Metadata JSON
                    </h4>
                    <pre className="rounded-lg bg-black/40 p-3 font-mono text-xs text-foreground/80 overflow-x-auto">
                      {JSON.stringify(selectedDoc.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-96 text-xs text-muted-foreground">
              Select a document from the left sidebar to preview its full text and passages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
