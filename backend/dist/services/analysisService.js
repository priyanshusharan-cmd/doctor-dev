"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAnalysis = startAnalysis;
const path_1 = __importDefault(require("path"));
const security_1 = require("../utils/security");
const repositoryAnalyzer_1 = require("../analyzers/repositoryAnalyzer");
const codeAnalyzer_1 = require("../analyzers/codeAnalyzer");
const configAnalyzer_1 = require("../analyzers/configAnalyzer");
const testPilot_1 = require("../analyzers/testPilot");
const configDoctor_1 = require("../analyzers/configDoctor");
const testRunner_1 = require("../runners/testRunner");
const prioritizationService_1 = require("./prioritizationService");
const analysisStore_1 = require("../models/analysisStore");
const STATUS_LABELS = {
    pending: 'Waiting to start',
    scanning: 'Scanning repository files',
    analyzing_code: 'Analysing code structure',
    analyzing_tests: 'Mapping test coverage',
    analyzing_config: 'Scanning configuration',
    prioritizing: 'Prioritising findings',
    complete: 'Analysis complete',
    error: 'Analysis failed',
};
function updateStatus(id, status) {
    // Import here to avoid circular reference
    const store = require('../models/analysisStore');
    const a = store.getAnalysis(id);
    if (a) {
        a.status = status;
        a.statusLabel = STATUS_LABELS[status];
    }
}
/**
 * Start a full analysis.  Returns the analysisId immediately.
 * Analysis runs in the background — poll /api/analysis/:id for status.
 */
async function startAnalysis(rawPath, opts = {}) {
    const repoPath = (0, security_1.resolveRepoPath)(rawPath);
    const analysis = (0, analysisStore_1.createAnalysis)(repoPath);
    const id = analysis.id;
    runPipeline(id, repoPath, opts).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[doctor-dev] Analysis ${id} failed:`, msg);
        (0, analysisStore_1.setError)(id, msg);
    });
    return id;
}
async function runPipeline(id, repoPath, opts) {
    // ── 1. Scan files ──────────────────────────────────────────────────────────
    updateStatus(id, 'scanning');
    const repositoryProfile = await (0, repositoryAnalyzer_1.analyzeRepository)(repoPath);
    // ── 2. AST code analysis ───────────────────────────────────────────────────
    updateStatus(id, 'analyzing_code');
    const { symbols, routes } = (0, codeAnalyzer_1.analyzeCode)(repoPath, repositoryProfile.sourceFiles);
    // Pre-load source file contents for gap analysis (shared read)
    const sourceContents = new Map();
    for (const rel of repositoryProfile.sourceFiles.slice(0, 150)) {
        const content = (0, security_1.readFileSafe)(path_1.default.join(repoPath, rel));
        if (content)
            sourceContents.set(rel, content);
    }
    // ── 3. Test analysis ───────────────────────────────────────────────────────
    updateStatus(id, 'analyzing_tests');
    const rawTestProfile = (0, configAnalyzer_1.analyzeTests)(repoPath, repositoryProfile.testFiles);
    const testScript = (0, testRunner_1.detectTestScript)(repositoryProfile);
    const testProfile = {
        ...rawTestProfile,
        detectedTestScript: testScript ?? undefined,
    };
    const testMappings = (0, testPilot_1.buildTestMappings)(repositoryProfile.sourceFiles, testProfile);
    const testGaps = (0, testPilot_1.findTestingGaps)(symbols, routes, testMappings, testProfile, sourceContents);
    // ── 4. Test generation (optional) ─────────────────────────────────────────
    const primaryFramework = repositoryProfile.testFrameworks[0] ?? 'jest';
    const generatedTests = (opts.generateTests !== false)
        ? testGaps
            .filter((g) => g.severity === 'critical' || g.severity === 'high')
            .slice(0, 5)
            .map((gap) => (0, testPilot_1.generateTestForGap)(gap, primaryFramework, repoPath))
        : [];
    // ── 5. Config analysis ────────────────────────────────────────────────────
    updateStatus(id, 'analyzing_config');
    const configHealth = await (0, configDoctor_1.runConfigDoctor)(repoPath, repositoryProfile);
    // ── 6. Run tests (optional) ───────────────────────────────────────────────
    let testRunResult = undefined;
    if (opts.runTests) {
        testRunResult = await (0, testRunner_1.runTests)(repoPath, repositoryProfile);
    }
    // ── 7. Prioritize findings + health score ─────────────────────────────────
    updateStatus(id, 'prioritizing');
    const priorityFindings = (0, prioritizationService_1.buildPriorityFindings)(testGaps, configHealth.issues);
    const healthScore = (0, prioritizationService_1.calculateHealthScore)(repositoryProfile.sourceFiles.length, testGaps, configHealth.issues, repositoryProfile.testFiles.length);
    // ── 8. Serialize + store ──────────────────────────────────────────────────
    const result = {
        analysisId: id,
        repositoryProfile,
        symbols,
        routes,
        testProfile: {
            ...testProfile,
            // Convert Set → Array for JSON-safe storage
            coveredFiles: testProfile.coveredFiles,
        },
        testMappings,
        testGaps,
        generatedTests,
        configHealth,
        priorityFindings,
        healthScore,
        testRunResult,
        scannedAt: new Date().toISOString(),
    };
    (0, analysisStore_1.setResult)(id, result);
}
//# sourceMappingURL=analysisService.js.map