import { Request, Response } from 'express';
/**
 * POST /api/analyze
 */
export declare function analyzeHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analysis/:analysisId
 */
export declare function getAnalysisHandler(req: Request, res: Response): void;
/**
 * GET /api/analyses
 */
export declare function listAnalysesHandler(_req: Request, res: Response): void;
