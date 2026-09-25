import path from 'path';
import { resolveRepoPath, readFileSafe } from '../utils/security';
import { analyzeRepository } from '../analyzers/repositoryAnalyzer';
import { analyzeCode } from '../analyzers/codeAnalyzer';
import { analyzeTests } from '../analyzers/configAnalyzer';
import { buildTestMappings, findTestingGaps, generateTestForGap } from '../analyzers/testPilot';
import { runConfigDoctor } from '../analyzers/configDoctor';
import { runTests, detectTestScript } from '../runners/testRunner';
import { buildPriorityFindings, calculateHealthScore } from './prioritizationService';
import { createAnalysis, setStatus, setResult, setError } from '../models/analysisStore';
import type { AnalysisResult, AnalysisStatus } from '../types';

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  pending:          'Waiting to start',
  scanning:         'Scanning repository files',
  analyzing_code:   'Analysing code structure',
  analyzing_tests:  'Mapping test coverage',
  analyzing_config: 'Scanning configuration',
  prioritizing:     'Prioritising findings',
  complete:         'Analysis complete',
  error:            'Analysis failed',
};

function updateStatus(id: string, status: AnalysisStatus): void {
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
export async function startAnalysis(
  rawPath: string,
  opts: { runTests?: boolean; generateTests?: boolean } = {},
): Promise<string> {
  const repoPath = resolveRepoPath(rawPath);
  const analysis = createAnalysis(repoPath);
  const id = analysis.id;

  runPipeline(id, repoPath, opts).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[doctor-dev] Analysis ${id} failed:`, msg);
    setError(id, msg);
  });

  return id;
}

async function runPipeline(
  id: string,
  repoPath: string,
  opts: { runTests?: boolean; generateTests?: boolean },
): Promise<void> {
  // ── 1. Scan files ──────────────────────────────────────────────────────────
  updateStatus(id, 'scanning');
  const repositoryProfile = await analyzeRepository(repoPath);

  // ── 2. AST code analysis ───────────────────────────────────────────────────
  updateStatus(id, 'analyzing_code');
  const { symbols, routes } = analyzeCode(repoPath, repositoryProfile.sourceFiles);

  // Pre-load source file contents for gap analysis (shared read)
  const sourceContents = new Map<string, string>();
  for (const rel of repositoryProfile.sourceFiles.slice(0, 150)) {
    const content = readFileSafe(path.join(repoPath, rel));
    if (content) sourceContents.set(rel, content);
  }

  // ── 3. Test analysis ───────────────────────────────────────────────────────
  updateStatus(id, 'analyzing_tests');
  const rawTestProfile = analyzeTests(repoPath, repositoryProfile.testFiles);
  const testScript = detectTestScript(repositoryProfile);
  const testProfile = {
    ...rawTestProfile,
    detectedTestScript: testScript ?? undefined,
  };

  const testMappings = buildTestMappings(repositoryProfile.sourceFiles, testProfile);
  const testGaps = findTestingGaps(symbols, routes, testMappings, testProfile, sourceContents);

  // ── 4. Test generation (optional) ─────────────────────────────────────────
  const primaryFramework = repositoryProfile.testFrameworks[0] ?? 'jest';
  const generatedTests = (opts.generateTests !== false)
    ? testGaps
        .filter((g) => g.severity === 'critical' || g.severity === 'high')
        .slice(0, 5)
        .map((gap) => generateTestForGap(gap, primaryFramework, repoPath))
    : [];

  // ── 5. Config analysis ────────────────────────────────────────────────────
  updateStatus(id, 'analyzing_config');
  const configHealth = await runConfigDoctor(repoPath, repositoryProfile);

  // ── 6. Run tests (optional) ───────────────────────────────────────────────
  let testRunResult = undefined;
  if (opts.runTests) {
    testRunResult = await runTests(repoPath, repositoryProfile);
  }

  // ── 7. Prioritize findings + health score ─────────────────────────────────
  updateStatus(id, 'prioritizing');
  const priorityFindings = buildPriorityFindings(testGaps, configHealth.issues);
  const healthScore = calculateHealthScore(
    repositoryProfile.sourceFiles.length,
    testGaps,
    configHealth.issues,
    repositoryProfile.testFiles.length,
  );

  // ── 8. Serialize + store ──────────────────────────────────────────────────
  const result: AnalysisResult = {
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

  setResult(id, result);
}
