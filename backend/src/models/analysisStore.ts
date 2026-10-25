import { randomUUID } from 'node:crypto';
import type { Analysis, AnalysisStatus, AnalysisResult } from '../types';

/** Finished analyses kept in memory; the oldest finished ones are evicted first. */
const MAX_STORED_ANALYSES = 50;

const store = new Map<string, Analysis>();

function isFinished(a: Analysis): boolean {
  return a.status === 'complete' || a.status === 'error';
}

/** Drop the oldest finished analyses so results cannot grow memory without bound. */
function evictOldAnalyses(): void {
  if (store.size <= MAX_STORED_ANALYSES) return;
  // Map iteration follows insertion order, so the first finished entries are the oldest.
  for (const [id, a] of store) {
    if (store.size <= MAX_STORED_ANALYSES) break;
    if (isFinished(a)) store.delete(id);
  }
}

/** Number of analyses that are still running. */
export function countActiveAnalyses(): number {
  let active = 0;
  for (const a of store.values()) if (!isFinished(a)) active++;
  return active;
}

export function createAnalysis(repositoryPath: string): Analysis {
  const analysis: Analysis = {
    id: randomUUID(),
    status: 'pending',
    statusLabel: 'Waiting to start',
    repositoryPath,
    createdAt: new Date().toISOString(),
  };
  store.set(analysis.id, analysis);
  evictOldAnalyses();
  return analysis;
}

export function getAnalysis(id: string): Analysis | undefined {
  return store.get(id);
}

export function listAnalyses(): Analysis[] {
  return Array.from(store.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function setStatus(id: string, status: AnalysisStatus, label?: string): void {
  const a = store.get(id);
  if (a) {
    a.status = status;
    if (label !== undefined) a.statusLabel = label;
  }
}

export function setResult(id: string, result: AnalysisResult): void {
  const a = store.get(id);
  if (!a) return;
  a.status = 'complete';
  a.statusLabel = 'Analysis complete';
  a.result = result;
  a.completedAt = new Date().toISOString();
}

export function setError(id: string, error: string): void {
  const a = store.get(id);
  if (!a) return;
  a.status = 'error';
  a.statusLabel = 'Analysis failed';
  a.error = error;
  a.completedAt = new Date().toISOString();
}
