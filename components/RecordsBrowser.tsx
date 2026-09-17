'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Sparkles,
  Check,
  Copy,
  Loader2,
  Info,
} from 'lucide-react';
import { RecordTable } from '@/components/CapabilityExplorer';

const CHATGPT_AUDIT_PROMPT = `I have attached the complete records dataset from RockyGPT (campus data warehouse containing courses, dining menus, staff directory, campus events, academic calendar, shuttle schedules, building hours, student clubs, and academic programs).

Please act as a Senior Data Scientist and Data Quality Engineer to analyze this dataset:

1. Data Quality & Completeness Audit:
   - Identify columns with high nullity or missing values across all collections.
   - Detect placeholder strings (e.g. "TBD", "N/A", empty descriptions).
   - Find records with missing critical safety fields (e.g. food allergen tracking).

2. Schema & Formatting Consistency:
   - Check for inconsistent data types (e.g. numeric values stored as text strings, polymorphic fields like scalar int vs dict).
   - Identify phone number formatting issues, unparsed extensions, or compound phone strings.
   - Spot conflicting time/date notations across related tables.

3. Outliers & Domain Anomalies:
   - Identify erroneous credit hours (0, fractional, or extreme high values > 20).
   - Identify non-dish raw ingredients logged as standalone menu meals.
   - Detect OCR/transcription typos in catalog descriptions.

4. Temporal Validity & Stale Data:
   - Flag expired operating hours or past calendar events leaking into current views.
   - Identify time window discrepancies between titles and descriptions.

5. Actionable Cleaning Plan:
   - Provide a prioritized list of data migrations, ingestion schema validators, and data-cleaning transformations to fix these issues.`;

function downloadJson(data: unknown, filename: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsv(records: Record<string, unknown>[], filename: string) {
  if (!records.length) return;
  const columns = Array.from(new Set(records.flatMap((r) => Object.keys(r))));
  const csvRows: string[] = [];

  // Header row
  csvRows.push(columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(','));

  // Data rows
  for (const row of records) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return '""';
      if (typeof val === 'object') {
        return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      }
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Every capability's executor output, one at a time, with data export and ChatGPT analysis capabilities.
 */
export function RecordsBrowser({ capabilities }: { capabilities: string[] }) {
  const [chosen, setChosen] = useState(capabilities[0] ?? '');
  const [state, setState] = useState<{ returned: number; records: Record<string, unknown>[] } | null>(
    null
  );
  const [failed, setFailed] = useState<string | null>(null);

  // Export states
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  const load = useCallback(async () => {
    if (!chosen) return;
    setState(null);
    setFailed(null);
    try {
      const response = await fetch(`/api/brain/capabilities/${chosen}/records`, {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.error ?? `HTTP ${response.status}`);
      }
      setState(body);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'The lookup did not answer.');
    }
  }, [chosen]);

  useEffect(() => {
    void load();
  }, [load]);

  // Export currently selected capability
  const handleExportCurrentJson = () => {
    if (!state?.records?.length) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const payload = {
      capability: chosen,
      exported_at: new Date().toISOString(),
      record_count: state.records.length,
      records: state.records,
    };
    downloadJson(payload, `rockygpt_${chosen}_records_${dateStr}.json`);
  };

  const handleExportCurrentCsv = () => {
    if (!state?.records?.length) return;
    const dateStr = new Date().toISOString().split('T')[0];
    downloadCsv(state.records, `rockygpt_${chosen}_records_${dateStr}.csv`);
  };

  // Export all capabilities bundled into a single JSON file
  const handleExportAll = async () => {
    setIsExportingAll(true);
    setExportMessage('Fetching all capability records from warehouse...');
    try {
      const res = await fetch('/api/brain/records/export', { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const dateStr = new Date().toISOString().split('T')[0];
      const count = data?.metadata?.total_records ?? 'all';
      setExportMessage(`Generating file (${count} records)...`);
      downloadJson(data, `rockygpt_all_records_${dateStr}.json`);
      setExportMessage(`Export complete! Downloaded ${count} records.`);
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err) {
      setExportMessage(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed.');
      setTimeout(() => setExportMessage(null), 5000);
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_AUDIT_PROMPT);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch {
      // Fallback
      setCopiedPrompt(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Export Bar */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-white/[0.01] p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Data Export & Analysis</h3>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400 border border-sky-500/20">
                14 Capabilities
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Download clean records to feed into ChatGPT Code Interpreter or analyze offline in Python/Excel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Export All Records Button */}
            <button
              type="button"
              onClick={handleExportAll}
              disabled={isExportingAll}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50"
            >
              {isExportingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Export All Records (JSON)</span>
            </button>

            {/* Export Current Capability Dropdown / Actions */}
            <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={handleExportCurrentJson}
                disabled={!state?.records?.length}
                title={`Download ${chosen} as JSON`}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <FileJson className="h-3.5 w-3.5 text-amber-400" />
                <span>{chosen || 'Current'} (JSON)</span>
              </button>
              <div className="my-1 w-[1px] bg-white/10" />
              <button
                type="button"
                onClick={handleExportCurrentCsv}
                disabled={!state?.records?.length}
                title={`Download ${chosen} as CSV`}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                <span>CSV</span>
              </button>
            </div>

            {/* Copy ChatGPT Prompt Button */}
            <button
              type="button"
              onClick={handleCopyPrompt}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                copiedPrompt
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:text-white'
              }`}
              title="Copy a structured data-scientist prompt to paste into ChatGPT with this export"
            >
              {copiedPrompt ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Prompt Copied!</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                  <span>ChatGPT Prompt</span>
                </>
              )}
            </button>

            {/* Toggle Prompt Details View */}
            <button
              type="button"
              onClick={() => setShowPromptModal(!showPromptModal)}
              aria-label="View ChatGPT Prompt instructions"
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Live Export Status Toast */}
        {exportMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 animate-in fade-in slide-in-from-top-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
            <span>{exportMessage}</span>
          </div>
        )}

        {/* Collapsible ChatGPT Prompt Preview */}
        {showPromptModal && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold text-zinc-200">
                  Pre-Engineered ChatGPT Analysis Prompt
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:underline"
              >
                {copiedPrompt ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copiedPrompt ? 'Copied to clipboard' : 'Copy prompt text'}</span>
              </button>
            </div>
            <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300 border border-white/5">
              {CHATGPT_AUDIT_PROMPT}
            </pre>
            <p className="text-[11px] text-zinc-400">
              💡 <strong>How to use:</strong> Click <strong>Export All Records (JSON)</strong>, upload the downloaded JSON file to ChatGPT (GPT-4o or ChatGPT with Advanced Data Analysis), and paste this prompt.
            </p>
          </div>
        )}
      </div>

      {/* Capability Selector Pills */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Capabilities ({capabilities.length})
          </label>
          {state && (
            <span className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{chosen}</span> ({state.returned.toLocaleString()} records)
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {capabilities.map((capability) => (
            <button
              key={capability}
              type="button"
              onClick={() => setChosen(capability)}
              aria-pressed={capability === chosen}
              className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
                capability === chosen
                  ? 'border-sky-400/50 bg-sky-400/15 text-sky-200 shadow-sm'
                  : 'border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-foreground'
              }`}
            >
              {capability}
            </button>
          ))}
        </div>
      </div>

      {/* Main Records Table */}
      <RecordTable state={state} failed={failed} />
    </div>
  );
}
