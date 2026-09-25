const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const body = await res.json();
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
  result?: import('../types').AnalysisResult;
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
