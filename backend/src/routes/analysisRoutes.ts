import { Router } from 'express';
import {
  analyzeHandler,
  getAnalysisHandler,
  listAnalysesHandler,
} from '../controllers/analysisController';

export const analysisRouter = Router();

// POST /api/analyze — start a new analysis
analysisRouter.post('/analyze', analyzeHandler);

// GET /api/analysis/:analysisId — get status + result
analysisRouter.get('/analysis/:analysisId', getAnalysisHandler);

// GET /api/analyses — list all analyses
analysisRouter.get('/analyses', listAnalysesHandler);
