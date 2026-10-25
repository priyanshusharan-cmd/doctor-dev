import path from 'path';
import fs from 'fs';
import { Project } from 'ts-morph';
import { readFileSafe, relativePath } from '../utils/security';
import type {
  CoverageInfo,
  TestProfile,
  TestSuite,
  TestFramework,
  TestFrameworkEvidence,
  EnvVarCategory,
} from '../types';

// ─── Test file analysis ───────────────────────────────────────────────────────

const JS_TS_FILE_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;

const TEST_FRAMEWORK_IMPORTS: Record<string, TestFramework> = {
  'vitest': 'vitest',
  '@jest/globals': 'jest',
  'jest': 'jest',
  'mocha': 'mocha',
  '@types/mocha': 'mocha',
  'jasmine': 'jasmine',
  'ava': 'ava',
  'node:test': 'node-test',
};

function detectFrameworkFromImports(sourceFile: ReturnType<InstanceType<typeof Project>['getSourceFiles']>[0]): TestFramework {
  for (const imp of sourceFile.getImportDeclarations()) {
    const mod = imp.getModuleSpecifierValue();
    if (TEST_FRAMEWORK_IMPORTS[mod]) return TEST_FRAMEWORK_IMPORTS[mod];
  }
  const text = sourceFile.getFullText();
  if (/\bvitest\b/.test(text)) return 'vitest';
  return 'unknown';
}

function countTestsInText(text: string, filePath: string): number {
  // 1. Standard JS/TS test runners: it(...), test(...), it.each(...), test.each(...)
  const standardMatches = text.match(/\b(?:it|test)\s*(?:\.only|\.skip|\.concurrent|\.each)?\s*[\.(]/g);
  let count = standardMatches ? standardMatches.length : 0;

  // 2. Python pytest / unittest: def test_*
  const pyMatches = text.match(/^\s*def\s+test_[a-zA-Z0-9_]+/gm);
  if (pyMatches) count += pyMatches.length;

  // 3. Go: func Test*(t *testing.T)
  const goMatches = text.match(/^\s*func\s+Test[a-zA-Z0-9_]+/gm);
  if (goMatches) count += goMatches.length;

  // 4. Rust: #[test]
  const rustMatches = text.match(/#\[(?:tokio::)?test\]/g);
  if (rustMatches) count += rustMatches.length;

  // 5. Java: @Test
  const javaMatches = text.match(/@Test\b/g);
  if (javaMatches) count += javaMatches.length;

  // 6. Standalone runnable test scripts (e.g. Node.js test/parallel/test-*.js or TAP assertion scripts)
  // If no it/test wrapper found, but file contains assertions, it represents at least 1 test case.
  if (count === 0) {
    const hasAssertions = /\b(?:assert|expect|should|common\.mustCall)\b/.test(text);
    const isTestFile = /(?:^|\/)(?:test-.*|.*[._]test)\.[a-z]+$/i.test(filePath);
    if (hasAssertions || isTestFile) {
      count = 1;
    }
  }

  return count;
}

function extractDescribeBlocks(text: string): string[] {
  const results: string[] = [];
  const re = /(?:describe|suite|context)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) results.push(m[1]);
  return results;
}

function extractItBlocks(text: string): string[] {
  const results: string[] = [];
  const re = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) results.push(m[1]);
  return results.slice(0, 20); // cap for performance
}

function extractTestImports(sourceFile: ReturnType<InstanceType<typeof Project>['getSourceFiles']>[0], repoRoot: string, testFilePath: string): string[] {
  const covered: string[] = [];
  const testDir = path.dirname(path.join(repoRoot, testFilePath));

  for (const imp of sourceFile.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (!spec.startsWith('.')) continue; // skip node_modules
    const resolved = path.resolve(testDir, spec);
    const candidates = [resolved, `${resolved}.ts`, `${resolved}.js`, `${resolved}/index.ts`, `${resolved}/index.js`];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        covered.push(relativePath(repoRoot, c));
        break;
      }
    }
  }
  return covered;
}

/** Real coverage report parsing for lcov.info, coverage-summary.json, and coverage-final.json */
export function detectCoverage(repoPath: string): { status: 'ACTUAL_COVERAGE' | 'UNAVAILABLE'; percentage?: number; reason: string } {
  // 1. coverage/coverage-summary.json
  const summaryJsonPath = path.join(repoPath, 'coverage', 'coverage-summary.json');
  if (fs.existsSync(summaryJsonPath)) {
    try {
      const content = fs.readFileSync(summaryJsonPath, 'utf8');
      const json = JSON.parse(content);
      const total = json?.total?.lines?.pct ?? json?.total?.statements?.pct;
      if (typeof total === 'number' && !isNaN(total)) {
        return {
          status: 'ACTUAL_COVERAGE',
          percentage: Math.round(total),
          reason: `Parsed coverage report at coverage/coverage-summary.json (${Math.round(total)}% line coverage)`,
        };
      }
    } catch {
      // Fall through to other formats
    }
  }

  // 2. coverage/lcov.info or lcov.info
  const lcovPaths = [
    path.join(repoPath, 'coverage', 'lcov.info'),
    path.join(repoPath, 'lcov.info'),
  ];
  for (const lp of lcovPaths) {
    if (fs.existsSync(lp)) {
      try {
        const content = fs.readFileSync(lp, 'utf8');
        let linesFound = 0;
        let linesHit = 0;
        const lfMatches = content.match(/^LF:(\d+)/gm);
        const lhMatches = content.match(/^LH:(\d+)/gm);
        if (lfMatches && lhMatches) {
          for (const m of lfMatches) linesFound += parseInt(m.slice(3), 10);
          for (const m of lhMatches) linesHit += parseInt(m.slice(3), 10);
          if (linesFound > 0) {
            const pct = Math.round((linesHit / linesFound) * 100);
            return {
              status: 'ACTUAL_COVERAGE',
              percentage: pct,
              reason: `Parsed actual coverage from LCOV report at ${relativePath(repoPath, lp)} (${pct}% lines covered)`,
            };
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  // 3. Other known coverage formats
  const otherFiles = [
    'coverage/coverage-final.json',
    'coverage.xml',
    'target/site/jacoco/jacoco.xml',
  ];
  for (const f of otherFiles) {
    if (fs.existsSync(path.join(repoPath, f))) {
      return {
        status: 'ACTUAL_COVERAGE',
        reason: `Found actual coverage report at ${f} (percentage unavailable - parsing not supported for this format)`,
      };
    }
  }

  return {
    status: 'UNAVAILABLE',
    reason: 'Coverage unavailable — no coverage report found in repository.',
  };
}

/**
 * Analyse test files and build a TestProfile.
 * Uses fast text scanning across all test files plus AST on a sample for import mapping.
 */
export function analyzeTests(
  repoPath: string,
  testFiles: string[],
  repoFrameworkEvidence?: TestFrameworkEvidence,
): TestProfile {
  const suites: TestSuite[] = [];
  const coveredFiles = new Set<string>();

  let coverage: CoverageInfo = detectCoverage(repoPath);

  if (testFiles.length === 0) {
    return {
      totalTestFiles: 0,
      totalTestCount: 0,
      totalTestSuites: 0,
      suites,
      coveredFiles,
      coverage,
      testFrameworkEvidence: repoFrameworkEvidence,
    };
  }

  let totalTestCount = 0;
  const classifiedTestFiles: TestProfile['classifiedTestFiles'] = [];

  // Fast scan of all test files (up to 2,000 files) to accurately discover test counts
  const filesToScan = testFiles.slice(0, 2000);
  for (const rel of filesToScan) {
    const abs = path.join(repoPath, rel);
    const content = readFileSafe(abs);
    if (!content) continue;

    const count = countTestsInText(content, rel);
    totalTestCount += count;

    let category: 'unit' | 'integration' | 'fixture' | 'helper' | 'benchmark' | 'example' = 'unit';
    const norm = rel.toLowerCase();
    if (norm.includes('integration') || norm.includes('e2e') || norm.includes('parallel') || norm.includes('sequential')) {
      category = 'integration';
    } else if (norm.includes('fixture')) {
      category = 'fixture';
    } else if (norm.includes('helper') || norm.includes('common')) {
      category = 'helper';
    }

    classifiedTestFiles.push({
      filePath: rel,
      category,
      testCount: count,
    });
  }

  // AST project on up to 100 files for detailed describe/it blocks & import-under-test extraction
  const project = new Project({
    useInMemoryFileSystem: false,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });

  // ts-morph only understands JavaScript/TypeScript; other languages are handled below.
  for (const rel of testFiles.filter((f) => JS_TS_FILE_RE.test(f)).slice(0, 100)) {
    try {
      project.addSourceFileAtPath(path.join(repoPath, rel));
    } catch {
      // skip unreadable
    }
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = relativePath(repoPath, sourceFile.getFilePath());
    const text = sourceFile.getFullText();
    const directFramework = detectFrameworkFromImports(sourceFile);
    const hasDirect = directFramework !== 'unknown';
    const repoFw = repoFrameworkEvidence?.framework;
    const framework: TestFramework = hasDirect
      ? directFramework
      : (repoFw && repoFw !== 'unknown' ? (repoFw as TestFramework) : 'unknown');
    const inheritedFramework = !hasDirect && framework !== 'unknown';

    const testCount = countTestsInText(text, filePath);
    const describeBlocks = extractDescribeBlocks(text);
    const itBlocks = extractItBlocks(text);
    const importsUnder = extractTestImports(sourceFile, repoPath, filePath);

    importsUnder.forEach((f) => coveredFiles.add(f));
    suites.push({
      filePath,
      framework,
      testCount,
      describeBlocks,
      itBlocks,
      importsUnder,
      inheritedFramework,
    });
  }

  // Python suites: test names come from `def test_*` functions.
  for (const rel of testFiles.filter((f) => f.endsWith('.py')).slice(0, 100)) {
    const text = readFileSafe(path.join(repoPath, rel));
    if (!text) continue;
    const itBlocks = (text.match(/^\s*(?:async\s+)?def\s+test_[A-Za-z0-9_]+/gm) ?? [])
      .map((m) => m.replace(/^\s*(?:async\s+)?def\s+/, ''))
      .slice(0, 20);
    const describeBlocks = (text.match(/^class\s+(Test[A-Za-z0-9_]*)/gm) ?? []).map((m) => m.replace(/^class\s+/, ''));
    suites.push({
      filePath: rel,
      framework: 'pytest',
      testCount: countTestsInText(text, rel),
      describeBlocks,
      itBlocks,
      importsUnder: [],
      inheritedFramework: false,
    });
  }

  if (coverage.status === 'UNAVAILABLE' && testFiles.length > 0) {
    coverage = {
      status: 'EVIDENCE_BASED',
      reason: `Estimated from ${testFiles.length} test files and ${totalTestCount} detected test cases since no coverage report was found.`,
    };
  }

  return {
    totalTestFiles: testFiles.length,
    totalTestCount: Math.max(totalTestCount, suites.reduce((acc, s) => acc + s.testCount, 0)),
    totalTestSuites: suites.length,
    classifiedTestFiles,
    suites,
    coveredFiles,
    coverage,
    testFrameworkEvidence: repoFrameworkEvidence,
  };
}

// ─── Env var analysis ─────────────────────────────────────────────────────────


export function categorizeEnvVar(name: string): EnvVarCategory {
  const upper = name.toUpperCase();

  // 1. CI/CD variables (check first before two-letter check catches 'CI')
  if (
    upper === 'CI' ||
    upper === 'CONTINUOUS_INTEGRATION' ||
    upper.startsWith('GITHUB_') ||
    upper.startsWith('GITLAB_') ||
    upper.startsWith('CIRCLE_') ||
    upper.startsWith('TRAVIS_') ||
    upper.startsWith('RUNNER_') ||
    upper.startsWith('JENKINS_') ||
    upper === 'BUILD_NUMBER' ||
    upper === 'BUILD_ID'
  ) {
    return 'CI_CD';
  }

  // 2. OS & Shell variables
  const OS_SHELL_SET = new Set([
    'PATH', 'TERM', 'SHELL', 'TMP', 'TEMP', 'TMPDIR', 'HOME', 'USER', 'USERNAME',
    'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'PWD', 'OLDPWD',
    'EDITOR', 'VISUAL', 'PAGER', 'SHLVL', 'HOSTNAME', 'DISPLAY',
    'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
    'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PS1', 'PS2',
    'UID', 'GID', 'EUID', 'PPID', 'COLUMNS', 'LINES', 'TZ', 'IFS',
    'OPTARG', 'OPTIND', 'MAIL', 'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'SSH_CLIENT',
    'SSH_CONNECTION', 'SSH_TTY', 'COLORTERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION',
    'P', 'S', '_',
  ]);
  if (OS_SHELL_SET.has(upper)) return 'OS_SHELL';

  // 3. Node Runtime
  if (upper.startsWith('NODE_') || upper.startsWith('UV_') || upper === 'V8_OPTIONS') {
    return 'NODE_RUNTIME';
  }

  // 4. Test
  if (
    upper.startsWith('JEST_') ||
    upper.startsWith('VITEST') ||
    upper.startsWith('MOCHA_') ||
    upper.startsWith('NYC_') ||
    upper.startsWith('C8_') ||
    upper === 'COVERAGE' ||
    upper.includes('TEST_') ||
    upper.endsWith('_TEST')
  ) {
    return 'TEST';
  }

  // 5. Benchmark
  if (upper.includes('BENCHMARK') || upper.includes('BENCH') || upper === 'WARMUP') {
    return 'BENCHMARK';
  }

  // 6. Database
  if (
    upper === 'DB' ||
    upper.includes('DATABASE') ||
    upper.includes('DB_') ||
    upper.startsWith('POSTGRES_') ||
    upper.startsWith('PG_') ||
    upper.startsWith('MYSQL_') ||
    upper.startsWith('MONGO_') ||
    upper.startsWith('REDIS_') ||
    upper.startsWith('PRISMA_') ||
    upper.endsWith('_DB') ||
    upper.endsWith('_DATABASE_URL')
  ) {
    return 'DATABASE';
  }

  // 7. External Service
  if (
    upper.startsWith('AWS_') ||
    upper.startsWith('S3_') ||
    upper.startsWith('STRIPE_') ||
    upper.startsWith('SENDGRID_') ||
    upper.startsWith('SLACK_') ||
    upper.startsWith('AUTH0_') ||
    upper.startsWith('FIREBASE_') ||
    upper.startsWith('TWILIO_') ||
    upper.startsWith('SENTRY_') ||
    upper.startsWith('DATADOG_')
  ) {
    return 'SERVICE';
  }

  // 8. Tooling
  if (
    upper === 'GIT' ||
    upper.startsWith('GIT_') ||
    upper === 'SHELLCHECK' ||
    upper.startsWith('SHELLCHECK_') ||
    upper === 'MAKE' ||
    upper.startsWith('MAKE_') ||
    upper === 'MAKEFLAGS' ||
    upper === 'CC' ||
    upper === 'CXX' ||
    upper === 'CFLAGS' ||
    upper === 'CXXFLAGS' ||
    upper === 'LDFLAGS' ||
    upper === 'LD' ||
    upper === 'AR' ||
    upper === 'AS' ||
    upper.startsWith('NPM_') ||
    upper.startsWith('YARN_') ||
    upper.startsWith('PNPM_') ||
    upper.startsWith('BUN_') ||
    upper.startsWith('COREPACK_') ||
    upper.startsWith('DOCKER_') ||
    upper.startsWith('PODMAN_') ||
    upper.startsWith('COMPOSE_') ||
    upper === 'DEBUG' ||
    upper === 'VERBOSE' ||
    upper === 'FORCE_COLOR' ||
    upper === 'NO_COLOR' ||
    upper === 'PORT' ||
    upper === 'HOST' ||
    upper === 'NO_PROXY' ||
    upper === 'HTTP_PROXY' ||
    upper === 'HTTPS_PROXY'
  ) {
    return 'TOOLING';
  }

  return 'APPLICATION';
}

// ─── Contextual Port analysis ──────────────────────────────────────────────────

/** Strip code comments so that numbers in comments don't create false port mentions */
export function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Line comments, but not the `//` inside URLs such as http://localhost:3000
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^#.*/gm, '');
}
