"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analysisRouter = void 0;
const express_1 = require("express");
const analysisController_1 = require("../controllers/analysisController");
exports.analysisRouter = (0, express_1.Router)();
// POST /api/analyze — start a new analysis
exports.analysisRouter.post('/analyze', analysisController_1.analyzeHandler);
// GET /api/analysis/:analysisId — get status + result
exports.analysisRouter.get('/analysis/:analysisId', analysisController_1.getAnalysisHandler);
// GET /api/analyses — list all analyses
exports.analysisRouter.get('/analyses', analysisController_1.listAnalysesHandler);
//# sourceMappingURL=analysisRoutes.js.map