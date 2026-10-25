import path from 'path';
import { resolveRepoPath, readFileSafe } from '../utils/security';
import { analyzeRepository } from '../analyzers/repositoryAnalyzer';
import { analyzeCode, getSourceType } from '../analyzers/codeAnalyzer';
import { buildImportGraph, createResolver, reachFromTests } from '../analyzers/importGraph';
import { analyzeTests } from '../analyzers/configAnalyzer';
import { buildTestMappings, findTestingGaps, generateTestsForGaps } from '../analyzers/testPilot';
import { runConfigDoctor } from '../analyzers/configDoctor';
import { runTests, detectTestScript } from '../runners/testRunner';
import { buildPriorityFindings, calculateHealthScore, summarizeTestEvidence } from './prioritizationService';
import { createAnalysis, setStatus, setResult, setError } from '../models/analysisStore';
import { isGitHubUrl, cloneGitHubRepo, cleanupClone } from './githubService';
import { getAllAdaptersFor } from '../analyzers/languages';
import type { AnalysisResult, AnalysisStatus, TestProfile, CodeSymbol, RouteInfo, TestGap, TestMapping } from '../types';

/** Gaps listed in the report; scoring always uses every gap found. */
const MAX_REPORTED_GAPS = 60;

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

/** Files read for the import graph, and the per-file size cap. */
const MAX_GRAPH_FILES = 8_000;
const MAX_GRAPH_FILE_BYTES = 512_000;

function emptyTestProfile(): TestProfile {
  return {
    totalTestFiles: 0, totalTestCount: 0, totalTestSuites: 0, suites: [], coveredFiles: new Set(),
    coverage: { status: 'UNAVAILABLE', reason: 'Test analysis did not complete.' },
  };
}

async function runPipeline(
  id: string,
  rawPath: string,
  isGitHub: boolean,
  opts: { runTests?: boolean; generateTests?: boolean },
): Promise<void> {
  let clonedTmpDir: string | null = null;
  const warnings: string[] = [];

  /** Run one analysis stage; a failure is recorded as a warning and the fallback is used. */
  async function stage<T>(label: string, fn: () => T | Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`${label} was skipped: ${msg}`);
      process.stderr.write(`${JSON.stringify({ service: 'doctor-dev', event: 'stage_failed', analysisId: id, stage: label, error: msg })}\n`);
      return fallback;
    }
  }

  try {
    // ── 0. Resolve path (clone if GitHub) ───────────────────────────────────
    let repoPath: string;
    if (isGitHub) {
      setStatus(id, 'scanning', 'Cloning GitHub repository…');
      clonedTmpDir = await cloneGitHubRepo(rawPath);
      repoPath = clonedTmpDir;
    } else {
      repoPath = rawPath;
    }

    // ── 1. Scan files (required: nothing else works without it) ────────────
    setStatus(id, 'scanning', STATUS_LABELS.scanning);
    const repositoryProfile = await analyzeRepository(repoPath);
    const productionFiles = repositoryProfile.sourceFiles.filter((f) => getSourceType(f) === 'production');

    // ── 2. Code structure (multi-language via adapters) ─────────────────────
    setStatus(id, 'analyzing_code', STATUS_LABELS.analyzing_code);
    const { symbols, routes } = await stage('Code analysis', () => {
      const adapters = getAllAdaptersFor(repoPath, repositoryProfile.sourceFiles);
      if (adapters.length === 0) return analyzeCode(repoPath, repositoryProfile.sourceFiles);
      const out = { symbols: [] as CodeSymbol[], routes: [] as RouteInfo[] };
      for (const adapter of adapters) {
        const parsed = adapter.analyzeCode(repoPath, repositoryProfile.sourceFiles);
        out.symbols.push(...parsed.symbols);
        out.routes.push(...parsed.routes);
      }
      return out;
    }, { symbols: [] as CodeSymbol[], routes: [] as RouteInfo[] });

    // ── 3. Test evidence ────────────────────────────────────────────────────
    setStatus(id, 'analyzing_tests', STATUS_LABELS.analyzing_tests);
    const rawTestProfile = await stage('Test discovery',
      () => analyzeTests(repoPath, repositoryProfile.testFiles, repositoryProfile.testFrameworkEvidence),
      emptyTestProfile());
    const testScript = detectTestScript(repositoryProfile);
    const testProfile: TestProfile = { ...rawTestProfile, detectedTestScript: testScript ?? undefined };

    const { testMappings, testGaps } = await stage('Test mapping', async () => {
      const testSide = [
        ...repositoryProfile.testFiles,
        ...(repositoryProfile.helperFiles ?? []),
        ...(repositoryProfile.fixtureFiles ?? []),
      ];
      const graphFiles = [...new Set([...testSide, ...repositoryProfile.sourceFiles])].slice(0, MAX_GRAPH_FILES);
      const contents = new Map<string, string>();
      const read = (rel: string): string | null => {
        if (!contents.has(rel)) contents.set(rel, readFileSafe(path.join(repoPath, rel), MAX_GRAPH_FILE_BYTES) ?? '');
        return contents.get(rel) || null;
      };
      const resolver = await createResolver(repoPath, new Set(graphFiles));
      const graph = buildImportGraph(graphFiles, read, resolver);
      const productionSet = new Set(productionFiles);
      const reach = reachFromTests(graph, repositoryProfile.testFiles, (f) => productionSet.has(f));
      testProfile.coveredFiles = new Set(reach.keys());

      const testContents = new Map<string, string>();
      for (const t of repositoryProfile.testFiles) testContents.set(t, read(t) ?? '');
      const testCorpus = [...testContents.values()].join('\n').toLowerCase();
      const importsTraceable = repositoryProfile.testFiles.some((t) => (graph.get(t)?.size ?? 0) > 0);

      const mappings = buildTestMappings({
        sourceFiles: productionFiles, testFiles: repositoryProfile.testFiles, reach, testCorpus, importsTraceable,
      });
      const gaps = findTestingGaps({ symbols, routes, mappings, testProfile, testContents });
      return { testMappings: mappings, testGaps: gaps };
    }, { testMappings: [] as TestMapping[], testGaps: [] as TestGap[] });

    // ── 4. Test generation (optional) ─────────────────────────────────────
    const detectedFramework = repositoryProfile.testFrameworks[0];
    const pythonProject = repositoryProfile.primaryEcosystem === 'python';
    const primaryFramework = detectedFramework && detectedFramework !== 'unknown'
      ? detectedFramework
      : pythonProject ? 'pytest' : 'vitest';
    const generatedTests = opts.generateTests !== false
      ? await stage('Test generation', () => generateTestsForGaps(
          testGaps.filter((g) => g.severity === 'critical' || g.severity === 'high').slice(0, 5),
          primaryFramework,
        ), [])
      : [];

    // ── 5. Config analysis ────────────────────────────────────────────────
    setStatus(id, 'analyzing_config', STATUS_LABELS.analyzing_config);
    const configHealth = await stage('Configuration analysis', () => runConfigDoctor(repoPath, repositoryProfile, routes), {
      issues: [], envVars: [], portMentions: [], dockerfiles: [], ciFiles: [], hasEnvExample: false, hasDotenv: false,
      summary: 'Configuration analysis did not complete.',
    });

    // ── 6. Run tests (optional, local repositories only) ─────────────────
    const testRunResult = opts.runTests && !isGitHub
      ? await stage('Test execution', () => runTests(repoPath, repositoryProfile), undefined)
      : undefined;

    // ── 7. Prioritize findings + health score ─────────────────────────────
    setStatus(id, 'prioritizing', STATUS_LABELS.prioritizing);
    const scoreInput = { mappings: testMappings, symbols, routes, testGaps, configIssues: configHealth.issues, testProfile };
    const healthScore = calculateHealthScore(scoreInput);
    const priorityFindings = buildPriorityFindings(testGaps, configHealth.issues);

    // ── 8. Store (the UI lists at most MAX_REPORTED_GAPS; the score used them all) ──
    const result: AnalysisResult = {
      analysisId: id,
      repositoryProfile,
      symbols,
      routes,
      testProfile,
      testMappings,
      testGaps: testGaps.slice(0, MAX_REPORTED_GAPS),
      generatedTests,
      configHealth,
      priorityFindings,
      healthScore,
      testRunResult,
      testEvidence: summarizeTestEvidence(scoreInput),
      warnings,
      scannedAt: new Date().toISOString(),
    };

    setResult(id, result);
  } finally {
    // Always clean up cloned repos
    if (clonedTmpDir) cleanupClone(clonedTmpDir);
  }
}
