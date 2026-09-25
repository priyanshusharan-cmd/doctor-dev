import { Request, Response } from 'express';
import { z } from 'zod';
import { startAnalysis } from '../services/analysisService';
import { getAnalysis, listAnalyses } from '../models/analysisStore';
import type { ApiError } from '../types';

const analyzeSchema = z.object({
  repositoryPath: z
    .string()
    .min(1, 'repositoryPath is required')
    .max(500, 'repositoryPath is too long')
    .refine((p) => !p.includes('\0'), 'repositoryPath contains invalid characters'),
  runTests: z.boolean().optional().default(false),
  generateTests: z.boolean().optional().default(true),
});

/**
 * POST /api/analyze
 */
export async function analyzeHandler(req: Request, res: Response): Promise<void> {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      detail: parsed.error.errors.map((e) => e.message).join('; '),
    } satisfies ApiError);
    return;
  }

  try {
    const analysisId = await startAnalysis(parsed.data.repositoryPath, {
      runTests: parsed.data.runTests,
      generateTests: parsed.data.generateTests,
    });
    res.status(202).json({ analysisId, status: 'pending' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message } satisfies ApiError);
  }
}

/** Serialize analysis result safely — convert Set to Array. */
function serializeAnalysis(analysis: ReturnType<typeof getAnalysis>) {
  if (!analysis) return null;
  if (!analysis.result) return analysis;

  return {
    ...analysis,
    result: {
      ...analysis.result,
      testProfile: {
        ...analysis.result.testProfile,
        coveredFiles: Array.from(analysis.result.testProfile.coveredFiles),
      },
    },
  };
}

/**
 * GET /api/analysis/:analysisId
 */
export function getAnalysisHandler(req: Request, res: Response): void {
  const analysis = getAnalysis(req.params.analysisId);
  if (!analysis) {
    res.status(404).json({ error: 'Analysis not found' } satisfies ApiError);
    return;
  }
  res.json(serializeAnalysis(analysis));
}

/**
 * GET /api/analyses
 */
export function listAnalysesHandler(_req: Request, res: Response): void {
  const all = listAnalyses().map(({ id, status, statusLabel, repositoryPath, createdAt, completedAt, error }) => ({
    id,
    status,
    statusLabel,
    repositoryPath,
    createdAt,
    completedAt,
    error,
  }));
  res.json(all);
}
