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
const githubService_1 = require("./githubService");
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
/**
 * Start a full analysis.  Returns the analysisId immediately.
 * Analysis runs in the background — poll /api/analysis/:id for status.
 */
async function startAnalysis(rawPath, opts = {}) {
    const isGitHub = (0, githubService_1.isGitHubUrl)(rawPath);
    // For GitHub URLs we create the analysis entry first (with the raw URL as path)
    // and resolve the real path inside the background job.
    const displayPath = isGitHub ? rawPath : (0, security_1.resolveRepoPath)(rawPath);
    const analysis = (0, analysisStore_1.createAnalysis)(displayPath);
    const id = analysis.id;
    runPipeline(id, rawPath, isGitHub, opts).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[doctor-dev] Analysis ${id} failed:`, msg);
        (0, analysisStore_1.setError)(id, msg);
    });
    return id;
}
async function runPipeline(id, rawPath, isGitHub, opts) {
    let clonedTmpDir = null;
    let repoPath;
    try {
        // ── 0. Resolve path (clone if GitHub) ───────────────────────────────────
        if (isGitHub) {
            (0, analysisStore_1.setStatus)(id, 'scanning', 'Cloning GitHub repository…');
            clonedTmpDir = (0, githubService_1.cloneGitHubRepo)(rawPath);
            repoPath = clonedTmpDir;
        }
        else {
            repoPath = (0, security_1.resolveRepoPath)(rawPath);
        }
        // ── 1. Scan files ──────────────────────────────────────────────────────
        (0, analysisStore_1.setStatus)(id, 'scanning', STATUS_LABELS.scanning);
        const repositoryProfile = await (0, repositoryAnalyzer_1.analyzeRepository)(repoPath);
        // ── 2. AST code analysis ───────────────────────────────────────────────
        (0, analysisStore_1.setStatus)(id, 'analyzing_code', STATUS_LABELS.analyzing_code);
        const { symbols, routes } = (0, codeAnalyzer_1.analyzeCode)(repoPath, repositoryProfile.sourceFiles);
        // Pre-load source file contents for gap analysis (shared read)
        const sourceContents = new Map();
        for (const rel of repositoryProfile.sourceFiles.slice(0, 150)) {
            const content = (0, security_1.readFileSafe)(path_1.default.join(repoPath, rel));
            if (content)
                sourceContents.set(rel, content);
        }
        // ── 3. Test analysis ───────────────────────────────────────────────────
        (0, analysisStore_1.setStatus)(id, 'analyzing_tests', STATUS_LABELS.analyzing_tests);
        const rawTestProfile = (0, configAnalyzer_1.analyzeTests)(repoPath, repositoryProfile.testFiles);
        const testScript = (0, testRunner_1.detectTestScript)(repositoryProfile);
        const testProfile = {
            ...rawTestProfile,
            detectedTestScript: testScript ?? undefined,
        };
        const testMappings = (0, testPilot_1.buildTestMappings)(repositoryProfile.sourceFiles, testProfile);
        const testGaps = (0, testPilot_1.findTestingGaps)(symbols, routes, testMappings, testProfile, sourceContents);
        // ── 4. Test generation (optional) ─────────────────────────────────────
        const primaryFramework = repositoryProfile.testFrameworks[0] ?? 'jest';
        const generatedTests = (opts.generateTests !== false)
            ? testGaps
                .filter((g) => g.severity === 'critical' || g.severity === 'high')
                .slice(0, 5)
                .map((gap) => (0, testPilot_1.generateTestForGap)(gap, primaryFramework, repoPath))
            : [];
        // ── 5. Config analysis ────────────────────────────────────────────────
        (0, analysisStore_1.setStatus)(id, 'analyzing_config', STATUS_LABELS.analyzing_config);
        const configHealth = await (0, configDoctor_1.runConfigDoctor)(repoPath, repositoryProfile);
        // ── 6. Run tests (optional) ───────────────────────────────────────────
        let testRunResult = undefined;
        if (opts.runTests && !isGitHub) {
            // Only run tests for local repos — never for cloned GitHub repos in CI context
            testRunResult = await (0, testRunner_1.runTests)(repoPath, repositoryProfile);
        }
        // ── 7. Prioritize findings + health score ─────────────────────────────
        (0, analysisStore_1.setStatus)(id, 'prioritizing', STATUS_LABELS.prioritizing);
        const priorityFindings = (0, prioritizationService_1.buildPriorityFindings)(testGaps, configHealth.issues);
        const healthScore = (0, prioritizationService_1.calculateHealthScore)(repositoryProfile.sourceFiles.length, testGaps, configHealth.issues, testProfile);
        // ── 8. Serialize + store ──────────────────────────────────────────────
        const result = {
            analysisId: id,
            repositoryProfile,
            symbols,
            routes,
            testProfile: {
                ...testProfile,
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
    finally {
        // Always clean up cloned repos
        if (clonedTmpDir)
            (0, githubService_1.cleanupClone)(clonedTmpDir);
    }
}
//# sourceMappingURL=analysisService.js.map