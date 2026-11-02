/**
 * @module lib/storage
 * The Brain's storage summary (`GET /v1/storage`), and how the Storage page reads it.
 */

/** Neon's Free plan: 0.5 GB per project (its console, checked 2026-09-26). */
export const NEON_FREE_STORAGE_BYTES = 500_000_000;

export interface StorageTable {
  schema: string;
  name: string;
  /** Rows, TOAST and indexes together. */
  bytes: number;
  indexBytes: number;
  estimatedRows: number;
}

export interface StorageRelease {
  version: string;
  status: string;
  createdAt: string | null;
  activatedAt: string | null;
  passages: number;
  documents: number;
  artifacts: number;
  /** On-disk (compressed) column sizes; shared indexes and free space are not included. */
  storedBytes: { passages: number; documents: number; artifacts: number };
}

export interface StorageSummary {
  environment: string;
  measuredAt: string;
  database: { name: string; bytes: number; allDatabasesBytes: number };
  tables: StorageTable[];
  releases: StorageRelease[];
  activeRelease: string;
  activeArtifacts: { key: string; bytes: number }[];
}

const UNITS = ['kB', 'MB', 'GB', 'TB'] as const;

/** Decimal units, as the Neon console shows them: 483,520,000 bytes is 483.5 MB. */
export function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1000) return `${bytes} bytes`;
  let value = bytes / 1000;
  let unit = 0;
  while (Math.abs(value) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(1).replace(/\.0$/, '')} ${UNITS[unit]}`;
}

export type LimitLevel = 'ok' | 'warning' | 'critical';

/** Neon's console warns from 80% of the limit; 95% leaves room for little more. */
export function limitUsage(
  used: number,
  limit = NEON_FREE_STORAGE_BYTES
): { share: number; remaining: number; level: LimitLevel } {
  const share = used / limit;
  const level = share >= 0.95 ? 'critical' : share >= 0.8 ? 'warning' : 'ok';
  return { share, remaining: limit - used, level };
}

export function releaseBytes(release: StorageRelease): number {
  const { passages, documents, artifacts } = release.storedBytes;
  return passages + documents + artifacts;
}
