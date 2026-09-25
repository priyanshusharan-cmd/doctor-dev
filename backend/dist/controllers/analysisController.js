"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeHandler = analyzeHandler;
exports.getAnalysisHandler = getAnalysisHandler;
exports.listAnalysesHandler = listAnalysesHandler;
const zod_1 = require("zod");
const analysisService_1 = require("../services/analysisService");
const analysisStore_1 = require("../models/analysisStore");
const analyzeSchema = zod_1.z.object({
    repositoryPath: zod_1.z
        .string()
        .min(1, 'repositoryPath is required')
        .max(500, 'repositoryPath is too long')
        .refine((p) => !p.includes('\0'), 'repositoryPath contains invalid characters'),
    runTests: zod_1.z.boolean().optional().default(false),
    generateTests: zod_1.z.boolean().optional().default(true),
});
/**
 * POST /api/analyze
 */
async function analyzeHandler(req, res) {
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: 'Invalid request body',
            detail: parsed.error.errors.map((e) => e.message).join('; '),
        });
        return;
    }
    try {
        const analysisId = await (0, analysisService_1.startAnalysis)(parsed.data.repositoryPath, {
            runTests: parsed.data.runTests,
            generateTests: parsed.data.generateTests,
        });
        res.status(202).json({ analysisId, status: 'pending' });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: message });
    }
}
/** Serialize analysis result safely — convert Set to Array. */
function serializeAnalysis(analysis) {
    if (!analysis)
        return null;
    if (!analysis.result)
        return analysis;
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
function getAnalysisHandler(req, res) {
    const analysis = (0, analysisStore_1.getAnalysis)(req.params.analysisId);
    if (!analysis) {
        res.status(404).json({ error: 'Analysis not found' });
        return;
    }
    res.json(serializeAnalysis(analysis));
}
/**
 * GET /api/analyses
 */
function listAnalysesHandler(_req, res) {
    const all = (0, analysisStore_1.listAnalyses)().map(({ id, status, statusLabel, repositoryPath, createdAt, completedAt, error }) => ({
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
//# sourceMappingURL=analysisController.js.map