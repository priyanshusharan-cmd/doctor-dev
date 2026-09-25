import { v4 as uuidv4 } from 'uuid';
import type { Analysis, AnalysisStatus, AnalysisResult } from '../types';

const store = new Map<string, Analysis>();

export function createAnalysis(repositoryPath: string): Analysis {
  const analysis: Analysis = {
    id: uuidv4(),
    status: 'pending',
    statusLabel: 'Waiting to start',
    repositoryPath,
    createdAt: new Date().toISOString(),
  };
  store.set(analysis.id, analysis);
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

export function setStatus(id: string, status: AnalysisStatus): void {
  const a = store.get(id);
  if (a) a.status = status;
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
}
