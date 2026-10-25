import type { AnalysisResult } from '../types';

// Combined deployments use /api; retain the override until the old static site is retired.
const BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    // Spread after options so caller headers are merged instead of replacing Content-Type.
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  // Proxies and cold-starting hosts can answer with HTML; report the status instead of a JSON parse error.
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status} ${res.statusText}`.trim() }));
  if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export interface StartAnalysisResponse {
  analysisId: string;
  status: string;
}

export interface AnalysisPollResponse {
  id: string;
  status: string;
  statusLabel: string;
  repositoryPath: string;
  createdAt: string;
  error?: string;
  result?: AnalysisResult;
}

export const api = {
  health: () =>
    request<{ status: string; service: string; version: string }>('/health'),

  startAnalysis: (repositoryPath: string, opts?: { runTests?: boolean; generateTests?: boolean }) =>
    request<StartAnalysisResponse>('/analyze', {
      method: 'POST',
      body: JSON.stringify({ repositoryPath, ...opts }),
    }),

  getAnalysis: (analysisId: string) =>
    request<AnalysisPollResponse>(`/analysis/${analysisId}`),

  listAnalyses: () =>
    request<AnalysisPollResponse[]>('/analyses'),
};
