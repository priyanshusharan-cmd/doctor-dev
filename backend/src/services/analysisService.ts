import path from 'path';
import { resolveRepoPath, readFileSafe } from '../utils/security';
import { analyzeRepository } from '../analyzers/repositoryAnalyzer';
import { analyzeCode } from '../analyzers/codeAnalyzer';
import { analyzeTests } from '../analyzers/configAnalyzer';
import { buildTestMappings, findTestingGaps, generateTestsForGaps } from '../analyzers/testPilot';
import { runConfigDoctor } from '../analyzers/configDoctor';
import { runTests, detectTestScript } from '../runners/testRunner';
import { buildPriorityFindings, calculateHealthScore } from './prioritizationService';
import { createAnalysis, setStatus, setResult, setError } from '../models/analysisStore';
import { isGitHubUrl, cloneGitHubRepo, cleanupClone } from './githubService';
import { getAllAdaptersFor } from '../analyzers/languages';
import type { AnalysisResult, AnalysisStatus, TestProfile, CodeSymbol, RouteInfo } from '../types';

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

/**
 * Start a full analysis.  Returns the analysisId immediately.
 * Analysis runs in the background — poll /api/analysis/:id for status.
 */
export async function startAnalysis(
  rawPath: string,
  opts: { runTests?: boolean; generateTests?: boolean } = {},
): Promise<string> {
  // An existing local directory wins over the GitHub short form, so a relative path such as
  // "packages/api" is analyzed locally instead of being cloned from github.com/packages/api.
  let localPath: string | null = null;
  let localError: unknown;
  try {
    localPath = resolveRepoPath(rawPath);
  } catch (err: unknown) {
    localError = err;
  }
  const isGitHub = localPath === null && isGitHubUrl(rawPath);
  if (localPath === null && !isGitHub) throw localError;

  // For GitHub URLs we create the analysis entry first (with the raw URL as path)
  // and clone inside the background job.
  const analysis = createAnalysis(localPath ?? rawPath.trim());
  const id = analysis.id;

  runPipeline(id, localPath ?? rawPath, isGitHub, opts).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${JSON.stringify({ service: 'doctor-dev', event: 'analysis_failed', analysisId: id, error: msg })}\n`);
    setError(id, msg);
  });

  return id;
}

async function runPipeline(
  id: string,
  rawPath: string,
  isGitHub: boolean,
  opts: { runTests?: boolean; generateTests?: boolean },
): Promise<void> {
  let clonedTmpDir: string | null = null;
  let repoPath: string;

  try {
    // ── 0. Resolve path (clone if GitHub) ───────────────────────────────────
    if (isGitHub) {
      setStatus(id, 'scanning', 'Cloning GitHub repository…');
      clonedTmpDir = await cloneGitHubRepo(rawPath);
      repoPath = clonedTmpDir;
    } else {
      repoPath = rawPath;
    }

    // ── 1. Scan files ──────────────────────────────────────────────────────
    setStatus(id, 'scanning', STATUS_LABELS.scanning);
    const repositoryProfile = await analyzeRepository(repoPath);

    // ── 2. AST code analysis (multi-language via adapters) ───────────────────
    setStatus(id, 'analyzing_code', STATUS_LABELS.analyzing_code);
    const adapters = getAllAdaptersFor(repoPath, repositoryProfile.sourceFiles);
    let symbols: CodeSymbol[] = [];
    let routes: RouteInfo[] = [];

    if (adapters.length > 0) {
      for (const adapter of adapters) {
        const parsed = adapter.analyzeCode(repoPath, repositoryProfile.sourceFiles);
        symbols.push(...parsed.symbols);
        routes.push(...parsed.routes);
      }
    } else {
      const parsed = analyzeCode(repoPath, repositoryProfile.sourceFiles);
      symbols = parsed.symbols;
      routes = parsed.routes;
    }

    // Pre-load source file contents for gap analysis (shared read)
    const sourceContents = new Map<string, string>();
    for (const rel of repositoryProfile.sourceFiles.slice(0, 150)) {
      const content = readFileSafe(path.join(repoPath, rel));
      if (content) sourceContents.set(rel, content);
    }

    // ── 3. Test analysis ───────────────────────────────────────────────────
    setStatus(id, 'analyzing_tests', STATUS_LABELS.analyzing_tests);
    const rawTestProfile = analyzeTests(repoPath, repositoryProfile.testFiles, repositoryProfile.testFrameworkEvidence);
    const testScript = detectTestScript(repositoryProfile);
    const testProfile = {
      ...rawTestProfile,
      detectedTestScript: testScript ?? undefined,
    };

    const testMappings = buildTestMappings(repositoryProfile.sourceFiles, testProfile);
    const testGaps = findTestingGaps(symbols, routes, testMappings, testProfile, sourceContents);

    // ── 4. Test generation (optional) ─────────────────────────────────────
    const detectedFramework = repositoryProfile.testFrameworks[0];
    const primaryFramework = detectedFramework && detectedFramework !== 'unknown' ? detectedFramework : 'jest';
    const generatedTests = (opts.generateTests !== false)
      ? generateTestsForGaps(
          testGaps.filter((g) => g.severity === 'critical' || g.severity === 'high').slice(0, 5),
          primaryFramework,
        )
      : [];

    // ── 5. Config analysis ────────────────────────────────────────────────
    setStatus(id, 'analyzing_config', STATUS_LABELS.analyzing_config);
    const configHealth = await runConfigDoctor(repoPath, repositoryProfile);

    // ── 6. Run tests (optional) ───────────────────────────────────────────
    let testRunResult = undefined;
    if (opts.runTests && !isGitHub) {
      // Only run tests for local repos — never for cloned GitHub repos in CI context
      testRunResult = await runTests(repoPath, repositoryProfile);
    }

    // ── 7. Prioritize findings + health score ─────────────────────────────
    setStatus(id, 'prioritizing', STATUS_LABELS.prioritizing);
    const priorityFindings = buildPriorityFindings(testGaps, configHealth.issues);
    const healthScore = calculateHealthScore(
      repositoryProfile.sourceFiles.length,
      testGaps,
      configHealth.issues,
      testProfile as TestProfile,
    );

    // ── 8. Serialize + store ──────────────────────────────────────────────
    const result: AnalysisResult = {
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

    setResult(id, result);
  } finally {
    // Always clean up cloned repos
    if (clonedTmpDir) cleanupClone(clonedTmpDir);
  }
}
