import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  CodeSymbol,
  RouteInfo,
  TestProfile,
  TestMapping,
  TestGap,
  GeneratedTest,
  GapSeverity,
  CoverageStatus,
  SymbolImportance,
  TestFramework,
} from '../types';
import type { Reach } from './importGraph';
import { isAuthRelated, isAuthRoute, isPaymentRelated, maxImportance } from './importance';

// ─── Test Mapping ─────────────────────────────────────────────────────────────

const GENERIC_FILE_NAMES = new Set(['index', 'main', 'app', 'server', 'utils', 'util', 'helpers', 'types', 'config', 'constants', 'mod', '__init__']);

/** Remove the final extension: "src/foo.service.ts" → "src/foo.service". */
function stripExtension(filePath: string): string {
  return filePath.replace(/\.[^./\\]+$/, '');
}

/** "test/unit/user-service.spec.ts" → "user-service"; "tests/test_users.py" → "users". */
function testSubjectName(testFile: string): string {
  return path.posix.basename(stripExtension(testFile))
    .replace(/[._-](test|spec|tests|e2e|unit|integration)$/i, '')
    .replace(/^(test|tests)[._-]/i, '')
    .toLowerCase();
}

/** URL of a page in a file-based router: "frontend/src/routes/signup.tsx" → "/signup". */
function pageUrl(sourceFile: string): string | null {
  const m = sourceFile.match(/(?:^|\/)(?:routes|pages|app)\/(.+)\.(?:[jt]sx?|vue|svelte)$/i);
  if (!m) return null;
  const url = `/${m[1]}`
    .replace(/\/(index|page|route|_index|\+page)$/i, '')
    .replace(/\/_[^/]*|\/\([^)]*\)/g, '') // layout and group segments
    .replace(/\$|\[[^\]]+\]/g, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return url.length > 1 && !url.includes('.') ? url : null;
}

/** Confidence that a file reached through `depth` production hops is exercised by tests. */
export function depthConfidence(depth: number): number {
  return depth <= 1 ? 0.95 : depth === 2 ? 0.8 : depth === 3 ? 0.7 : 0.6;
}

export interface MappingInput {
  sourceFiles: string[];
  testFiles: string[];
  /** Import-graph reach from tests; files missing from it were never loaded by a test. */
  reach: Map<string, Reach>;
  /** Lower-cased concatenation of test file contents, for path references. */
  testCorpus: string;
  /** True when at least one test import resolved to a repository file. */
  importsTraceable: boolean;
}

/**
 * Map production files to test evidence:
 * 1. import graph — a test imports the file directly (DIRECTLY_TESTED) or through other
 *    modules such as the package entry (INDIRECTLY_TESTED, confidence falls with depth);
 * 2. naming — `foo.ts` ↔ `foo.test.ts` / `test_foo.py` (PARTIALLY_TESTED);
 * 3. path references — tests that spawn or read `bin/cli.js` by path (PARTIALLY_TESTED).
 * Files no test reaches are NOT_TESTED, or NOT_ENOUGH_EVIDENCE when imports in this
 * repository could not be traced at all (unsupported language or module system).
 */
export function buildTestMappings(input: MappingInput): TestMapping[] {
  const subjects = new Map<string, string[]>();
  for (const t of input.testFiles) {
    const name = testSubjectName(t);
    if (!name) continue;
    subjects.set(name, [...(subjects.get(name) ?? []), t]);
  }

  return input.sourceFiles.map((sourceFile): TestMapping => {
    const reached = input.reach.get(sourceFile);
    if (reached) {
      const tests = [...reached.tests].slice(0, 10);
      const direct = reached.depth <= 1;
      return {
        sourceFile,
        relatedTests: tests,
        coverageStatus: direct ? 'DIRECTLY_TESTED' : 'INDIRECTLY_TESTED',
        confidence: depthConfidence(reached.depth),
        depth: reached.depth,
        evidence: [direct
          ? `Imported directly by ${tests.slice(0, 2).join(', ')}${reached.tests.size > 2 ? ` and ${reached.tests.size - 2} more` : ''}`
          : `Loaded by tests through ${reached.depth - 1} intermediate module(s), e.g. from ${tests[0]}`],
      };
    }

    const base = path.posix.basename(stripExtension(sourceFile)).toLowerCase();
    const parent = path.posix.basename(path.posix.dirname(sourceFile)).toLowerCase();
    const nameMatches = (subjects.get(base) ?? []).filter((t) =>
      !GENERIC_FILE_NAMES.has(base) || t.toLowerCase().split('/').includes(parent));
    if (nameMatches.length > 0) {
      return {
        sourceFile,
        relatedTests: nameMatches.slice(0, 5),
        coverageStatus: 'PARTIALLY_TESTED',
        confidence: 0.6,
        evidence: [`Test file name matches: ${nameMatches.slice(0, 2).join(', ')}`],
      };
    }

    const reference = stripExtension(sourceFile).split('/').slice(-2).join('/').toLowerCase();
    if (reference.includes('/') && input.testCorpus.includes(reference)) {
      return {
        sourceFile,
        relatedTests: [],
        coverageStatus: 'PARTIALLY_TESTED',
        confidence: 0.55,
        evidence: [`Tests reference "${reference}" by path (e.g. spawning or reading it)`],
      };
    }

    // File-based routing (routes/, pages/, app/): end-to-end tests visit the page by URL
    const url = pageUrl(sourceFile);
    if (url && (input.testCorpus.includes(`'${url}'`) || input.testCorpus.includes(`"${url}"`) || input.testCorpus.includes(`\`${url}`)
      || input.testCorpus.includes(`${url}/`) || input.testCorpus.includes(`${url}?`))) {
      return {
        sourceFile,
        relatedTests: [],
        coverageStatus: 'PARTIALLY_TESTED',
        confidence: 0.5,
        evidence: [`End-to-end tests visit ${url}`],
      };
    }

    const status: CoverageStatus = input.testFiles.length > 0 && !input.importsTraceable ? 'NOT_ENOUGH_EVIDENCE' : 'NOT_TESTED';
    return {
      sourceFile,
      relatedTests: [],
      coverageStatus: status,
      confidence: status === 'NOT_TESTED' ? (input.testFiles.length > 0 ? 0.85 : 0.95) : 0.35,
      evidence: [status === 'NOT_TESTED'
        ? (input.testFiles.length > 0 ? 'No test imports this file, directly or through other modules' : 'The repository has no automated tests')
        : 'Tests exist, but their imports could not be traced to source files'],
    };
  });
}

// ─── Gap Detection ────────────────────────────────────────────────────────────

const NEGATIVE_AUTH_RE = /(\b40[13]\b|unauthori[sz]ed|forbidden|invalid[\s_-]*(token|password|credential)|wrong[\s_-]*password|not[\s_-]*authori|access[\s_-]*denied|permission[\s_-]*denied|rejects?|tothrow|raises)/i;
const NEGATIVE_PATH_RE = /(error|fail|throw|reject|invalid|decline|raises|exception|40\d|50\d)/i;

const SEVERITY_ORDER: Record<GapSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function severityFor(importance: SymbolImportance): GapSeverity {
  return importance === 'critical' ? 'critical' : importance === 'high' ? 'high' : importance === 'medium' ? 'medium' : 'low';
}

function downgrade(sev: GapSeverity): GapSeverity {
  return sev === 'critical' ? 'high' : sev === 'high' ? 'medium' : 'low';
}

/** Regex that matches a route path as it would appear in a test, with :params as wildcards. */
function routePattern(routePath: string): RegExp | null {
  const literal = routePath.replace(/\/+$/, '');
  if (!literal || literal === '/') return null; // "/" alone appears in every test
  const escaped = literal
    .split('/')
    .map((seg) => (seg.startsWith(':') || /^\{.+\}$/.test(seg) || /^<.+>$/.test(seg) || seg === '*'
      ? '[^/\'"`\\s?]+'
      : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`${escaped}(?![\\w-])`, 'i');
}

export interface GapInput {
  symbols: CodeSymbol[];
  routes: RouteInfo[];
  mappings: TestMapping[];
  testProfile: TestProfile;
  /** Contents of test files, keyed by repo-relative path. */
  testContents: Map<string, string>;
}

/**
 * Find testing gaps, one per untested production file (listing its important symbols),
 * one per API route that no test references, and negative-path gaps for auth and payment
 * code whose direct tests never exercise a failure.
 */
export function findTestingGaps(input: GapInput): TestGap[] {
  const gaps: TestGap[] = [];
  const hasTests = input.testProfile.totalTestFiles > 0;
  const symbolsByFile = new Map<string, CodeSymbol[]>();
  for (const s of input.symbols) {
    if (s.sourceType !== 'production') continue;
    symbolsByFile.set(s.filePath, [...(symbolsByFile.get(s.filePath) ?? []), s]);
  }

  // ── 1. Files without test evidence ──────────────────────────────────────────
  for (const m of input.mappings) {
    if (m.coverageStatus !== 'NOT_TESTED' && m.coverageStatus !== 'NOT_ENOUGH_EVIDENCE') continue;
    const fileSymbols = (symbolsByFile.get(m.sourceFile) ?? []).filter((s) => s.importance !== 'low');
    if (fileSymbols.length === 0) continue;
    const ranked = [...fileSymbols].sort((a, b) => SEVERITY_ORDER[severityFor(a.importance)] - SEVERITY_ORDER[severityFor(b.importance)]);
    const top = ranked[0];
    const importance = ranked.reduce<SymbolImportance>((acc, s) => maxImportance(acc, s.importance), 'low');
    const uncertain = m.coverageStatus === 'NOT_ENOUGH_EVIDENCE';
    const severity = uncertain ? downgrade(severityFor(importance)) : severityFor(importance);
    const names = ranked.map((s) => s.name);
    gaps.push({
      id: randomUUID(),
      severity,
      confidence: m.confidence,
      category: uncertain ? 'partial_test' : 'no_test',
      title: `${uncertain ? 'Unconfirmed test evidence' : 'No test evidence'}: ${m.sourceFile}`,
      description: `\`${m.sourceFile}\` contains ${names.length} important symbol(s) — ${names.slice(0, 4).join(', ')}${names.length > 4 ? `, +${names.length - 4} more` : ''} — ${uncertain ? 'that could not be linked to any test' : 'and no test loads it'}.`,
      filePath: m.sourceFile,
      symbolName: top.name,
      // Only exported symbols can be imported by a generated test
      symbolNames: ranked.filter((s) => s.isExported).map((s) => s.name).slice(0, 10),
      lineStart: top.lineStart,
      reason: `${top.name} is ${top.importance} (${top.importanceReasons.join(', ') || 'exported'})`,
      evidence: [...m.evidence, `Most important symbol: ${top.name} at ${m.sourceFile}:${top.lineStart}`],
      existingTests: [],
      recommendedTests: recommendedFor(top, m.sourceFile),
      whyDoctorDevBelievesThis: m.evidence[0],
      whyUncertain: uncertain
        ? 'Imports in this repository could not be traced, so tests may cover this file in ways static analysis cannot see.'
        : hasTests ? 'Tests that drive the program through a CLI, HTTP, or subprocess can exercise code without importing it.' : undefined,
    });
  }

  // ── 2. Auth / payment code whose tests never exercise a failure ────────────
  for (const m of input.mappings) {
    if (m.coverageStatus !== 'DIRECTLY_TESTED') continue;
    const fileSymbols = symbolsByFile.get(m.sourceFile) ?? [];
    // Judged by file path: a validator named jwt() in a schema library is not auth code
    const auth = isAuthRelated(m.sourceFile);
    const payment = !auth && isPaymentRelated(m.sourceFile);
    if (!auth && !payment) continue;
    const testText = m.relatedTests.map((t) => input.testContents.get(t) ?? '').join('\n');
    if (!testText) continue;
    const covered = auth ? NEGATIVE_AUTH_RE.test(testText) : NEGATIVE_PATH_RE.test(testText);
    if (covered) continue;
    gaps.push({
      id: randomUUID(),
      severity: 'high',
      confidence: 0.6,
      category: auth ? 'missing_auth_test' : 'missing_error_test',
      title: `${auth ? 'No rejection test for auth code' : 'No failure-path test for payment code'}: ${m.sourceFile}`,
      description: `\`${m.sourceFile}\` is tested, but ${m.relatedTests.slice(0, 2).join(', ')} never assert${auth ? ' a 401/403, invalid credential, or denied access' : ' a failure, decline, or thrown error'}.`,
      filePath: m.sourceFile,
      symbolName: fileSymbols[0]?.name,
      lineStart: fileSymbols[0]?.lineStart,
      reason: auth ? 'Authentication code is usually broken on its failure paths, which no test checks here' : 'Payment failures are costly and no test checks one here',
      evidence: [`Tests: ${m.relatedTests.slice(0, 3).join(', ')}`, `No ${auth ? 'unauthorized/forbidden/invalid-credential' : 'error/decline/reject'} assertion found in them`],
      existingTests: m.relatedTests,
      recommendedTests: auth
        ? ['should reject requests without credentials', 'should reject invalid or expired credentials', 'should forbid access to another user\'s data']
        : ['should surface a declined payment as an error', 'should not double-charge on retry', 'should roll back when the provider fails'],
      whyDoctorDevBelievesThis: 'Searched the directly related test files for negative-path assertions.',
      whyUncertain: 'Failure paths may be tested in a shared suite that this file is not linked to.',
    });
  }

  // ── 3. API routes no test references ─────────────────────────────────────────
  const corpus = [...input.testContents.values()].join('\n');
  for (const route of input.routes) {
    if (route.sourceType !== 'production') continue;
    const pattern = routePattern(route.path);
    const referenced = pattern ? pattern.test(corpus) : input.mappings.some((m) => m.sourceFile === route.filePath && m.coverageStatus === 'DIRECTLY_TESTED');
    if (referenced) continue;
    const authRoute = isAuthRoute(route.path) || isAuthRelated(route.handlerName ?? '');
    const mutation = /^(POST|PUT|PATCH|DELETE)$/.test(route.method);
    const severity: GapSeverity = authRoute ? 'critical' : mutation ? 'high' : 'medium';
    gaps.push({
      id: randomUUID(),
      severity,
      confidence: hasTests ? 0.8 : 0.95,
      category: 'no_test',
      title: `API route not tested: ${route.method} ${route.path}`,
      description: `The API route \`${route.method} ${route.path}\` defined in \`${route.filePath}\` is not referenced by any test.`,
      filePath: route.filePath,
      symbolName: route.handlerName,
      lineStart: route.line,
      reason: `${authRoute ? 'Authentication endpoint' : mutation ? 'State-changing endpoint' : 'Public endpoint'} with no test that calls it`,
      evidence: [`Route defined at ${route.filePath}:${route.line}`, `Path "${route.path}" does not appear in any of ${input.testContents.size} test file(s)`],
      existingTests: [],
      recommendedTests: [
        `should return 2xx for a valid ${route.method} ${route.path}`,
        `should return 4xx for invalid input to ${route.method} ${route.path}`,
        authRoute ? `should return 401 for unauthenticated ${route.method} ${route.path}` : `should handle missing resources in ${route.method} ${route.path}`,
      ],
      whyDoctorDevBelievesThis: 'Searched every test file for this route path (route parameters treated as wildcards).',
      whyUncertain: 'Routes mounted under a prefix or built dynamically may be called with a path that does not contain this literal.',
    });
  }

  return gaps.sort((a, b) => {
    const so = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return so !== 0 ? so : b.confidence - a.confidence;
  });
}

function recommendedFor(symbol: CodeSymbol, file: string): string[] {
  const tests = [`should ${symbol.isAsync ? 'resolve' : 'return the expected result'} for valid input to ${symbol.name}`];
  if (symbol.paramCount > 0) tests.push(`should reject invalid arguments to ${symbol.name}`);
  if (symbol.isAsync) tests.push(`should propagate failures from ${symbol.name}`);
  if (isAuthRelated(`${file} ${symbol.name}`)) tests.push(`should deny access when ${symbol.name} receives bad credentials`);
  if (isPaymentRelated(`${file} ${symbol.name}`)) tests.push(`should handle a declined payment in ${symbol.name}`);
  return tests.slice(0, 4);
}

// ─── Test Generation ──────────────────────────────────────────────────────────

function frameworkImports(fw: TestFramework): string {
  switch (fw) {
    case 'vitest':    return `import { describe, it, expect } from 'vitest';`;
    case 'jest':      return `import { describe, it, expect } from '@jest/globals';`;
    case 'mocha':     return `import { describe, it } from 'mocha';\nimport assert from 'node:assert';`;
    case 'node-test': return `import { describe, it } from 'node:test';\nimport assert from 'node:assert';`;
    default:          return `import { describe, it, expect } from '@jest/globals';`;
  }
}

/** Where a generated test for `targetFile` should live: src/a/b.ts → src/__tests__/a/b.test.ts */
function testFilePathFor(targetFile: string): string {
  const ext = path.posix.extname(targetFile);
  const testExt = ext === '.tsx' ? '.test.tsx' : ext === '.jsx' ? '.test.jsx' : /^\.[mc]?js$/.test(ext) ? '.test.js' : '.test.ts';
  const withoutSrc = targetFile.replace(/^src\//, '');
  return `src/__tests__/${stripExtension(withoutSrc)}${testExt}`;
}

/** Import specifier from the generated test file to the file under test. */
function importPathFor(testFile: string, targetFile: string): string {
  const rel = path.posix.relative(path.posix.dirname(testFile), stripExtension(targetFile));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** The identifier to import for a symbol — `UserService.create` is imported as `UserService`. */
function importableName(symbolName: string | undefined): string | undefined {
  const head = symbolName?.split('.')[0];
  return head && /^[A-Za-z_$][\w$]*$/.test(head) ? head : undefined;
}

function jsTestCases(gap: TestGap, framework: TestFramework): string {
  const usesAssert = framework === 'mocha' || framework === 'node-test';
  return gap.recommendedTests.map((t) => [
    `  it(${JSON.stringify(t)}, () => {`,
    `    // TODO: implement`,
    usesAssert ? `    assert.ok(true);` : `    expect(true).toBe(true);`,
    `  });`,
  ].join('\n')).join('\n\n');
}

function pythonTestCases(gap: TestGap): string {
  return gap.recommendedTests.map((t) => {
    const fn = `test_${t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`.slice(0, 80);
    return `def ${fn}():\n    # TODO: implement — ${t}\n    assert True`;
  }).join('\n\n\n');
}

/**
 * Generate one test skeleton file per target source file, covering every gap in it.
 * Gaps in the same file share one test file instead of producing duplicate paths.
 * Never writes to disk and never overwrites existing tests.
 */
export function generateTestsForGaps(gaps: TestGap[], framework: TestFramework): GeneratedTest[] {
  const byFile = new Map<string, TestGap[]>();
  for (const gap of gaps) {
    const list = byFile.get(gap.filePath) ?? [];
    list.push(gap);
    byFile.set(gap.filePath, list);
  }

  const generated: GeneratedTest[] = [];
  for (const [targetFile, fileGaps] of byFile) {
    if (targetFile.endsWith('.py')) {
      const dir = path.posix.dirname(targetFile);
      const module = stripExtension(targetFile).replace(/\//g, '.');
      const names = [...new Set(fileGaps.flatMap((g) => (g.symbolNames ?? [g.symbolName]).map(importableName)).filter((n): n is string => !!n))];
      const content = [
        names.length > 0 ? `from ${module} import ${names.join(', ')}` : `import ${module}`,
        '',
        '',
        fileGaps.map(pythonTestCases).join('\n\n\n'),
        '',
      ].join('\n');
      generated.push({
        gapId: fileGaps[0].id,
        filePath: `tests/${dir === '.' ? '' : `${dir.replace(/^src\/?/, '')}/`}test_${path.posix.basename(stripExtension(targetFile))}.py`.replace(/\/\//g, '/'),
        content,
        targetFile,
        targetSymbol: fileGaps[0].symbolName,
        framework: 'pytest',
      });
      continue;
    }

    const testFile = testFilePathFor(targetFile);
    const names = [...new Set(fileGaps.flatMap((g) => (g.symbolNames ?? [g.symbolName]).map(importableName)).filter((n): n is string => !!n))];
    const importLine = names.length > 0
      ? `import { ${names.join(', ')} } from '${importPathFor(testFile, targetFile)}';`
      : `// Route handlers in ${targetFile} — exercise them through your HTTP test client (e.g. supertest).`;
    const blocks = fileGaps.map((gap) => {
      const title = gap.symbolName ?? gap.title.replace(/^[^:]+:\s*/, '');
      return `describe(${JSON.stringify(title)}, () => {\n${jsTestCases(gap, framework)}\n});`;
    });

    generated.push({
      gapId: fileGaps[0].id,
      filePath: testFile,
      content: `${frameworkImports(framework)}\n${importLine}\n\n${blocks.join('\n\n')}\n`,
      targetFile,
      targetSymbol: fileGaps[0].symbolName,
      framework,
    });
  }
  return generated;
}

/**
 * Generate a test file skeleton for a single gap.
 * Does not overwrite existing tests.
 */
export function generateTestForGap(
  gap: TestGap,
  framework: TestFramework,
  _repoPath?: string,
): GeneratedTest {
  return generateTestsForGaps([gap], framework)[0];
}
