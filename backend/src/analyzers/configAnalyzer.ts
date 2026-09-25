import path from 'path';
import fs from 'fs';
import { Project } from 'ts-morph';
import fg from 'fast-glob';
import { readFileSafe, relativePath, isSecretName } from '../utils/security';
import type {
  TestProfile,
  TestSuite,
  TestFramework,
  EnvVarInfo,
  EnvVarCategory,
  PortMention,
  PortRole,
} from '../types';

// ─── Test file analysis ───────────────────────────────────────────────────────

const TEST_FRAMEWORK_IMPORTS: Record<string, TestFramework> = {
  'vitest': 'vitest',
  '@jest/globals': 'jest',
  'jest': 'jest',
  'mocha': 'mocha',
  '@types/mocha': 'mocha',
  'jasmine': 'jasmine',
  'ava': 'ava',
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
        percentage: 80,
        reason: `Found actual coverage report at ${f}`,
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
export function analyzeTests(repoPath: string, testFiles: string[]): TestProfile {
  const suites: TestSuite[] = [];
  const coveredFiles = new Set<string>();

  const coverageBase = detectCoverage(repoPath);
  let coverage: any = coverageBase;

  if (testFiles.length === 0) {
    return {
      totalTestFiles: 0,
      totalTestCount: 0,
      totalTestSuites: 0,
      suites,
      coveredFiles,
      coverage,
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

  for (const rel of testFiles.slice(0, 100)) {
    try {
      project.addSourceFileAtPath(path.join(repoPath, rel));
    } catch {
      // skip unreadable
    }
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = relativePath(repoPath, sourceFile.getFilePath());
    const text = sourceFile.getFullText();
    const framework = detectFrameworkFromImports(sourceFile);
    const testCount = countTestsInText(text, filePath);
    const describeBlocks = extractDescribeBlocks(text);
    const itBlocks = extractItBlocks(text);
    const importsUnder = extractTestImports(sourceFile, repoPath, filePath);

    importsUnder.forEach((f) => coveredFiles.add(f));
    suites.push({ filePath, framework, testCount, describeBlocks, itBlocks, importsUnder });
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
  };
}

// ─── Env var analysis ─────────────────────────────────────────────────────────

const ENV_USAGE_RE = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
const ENV_DEFINE_RE = /^([A-Z_][A-Z0-9_]*)(?:\s*=.*)?$/;

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
    'LOGNAME', 'LANG', 'LC_ALL', 'PWD', 'OLDPWD', 'EDITOR', 'PAGER', 'SHLVL',
    'HOSTNAME', 'DISPLAY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    'XDG_CACHE_HOME', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PS1',
    'P', 'S', 'I', 'X', 'K', '_',
  ]);
  if (OS_SHELL_SET.has(upper) || upper.length <= 2) return 'OS_SHELL';

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
    upper.startsWith('NPM_') ||
    upper.startsWith('YARN_') ||
    upper.startsWith('COREPACK_') ||
    upper.startsWith('DOCKER_') ||
    upper === 'DEBUG' ||
    upper === 'VERBOSE' ||
    upper === 'FORCE_COLOR' ||
    upper === 'NO_COLOR' ||
    upper === 'PORT'
  ) {
    return 'TOOLING';
  }

  return 'APPLICATION';
}

function parseEnvFile(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const m = ENV_DEFINE_RE.exec(l);
      return m ? m[1] : null;
    })
    .filter((n): n is string => n !== null);
}

export async function analyzeEnvVars(
  repoPath: string,
  sourceFiles: string[],
): Promise<EnvVarInfo[]> {
  const defined = new Map<string, Set<string>>();
  const used = new Map<string, Set<string>>();
  const defaults = new Set<string>();

  const envFiles = await fg([
    '.env.example', '.env.sample', '.env.template', '.env.defaults',
    'docker-compose.yml', 'docker-compose.yaml',
    '.github/workflows/*.yml', '.github/workflows/*.yaml',
  ], { cwd: repoPath, absolute: false, dot: true });

  for (const relPath of envFiles) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;

    if (relPath.endsWith('.yml') || relPath.endsWith('.yaml')) {
      const yamlEnvRe = /(?:^|\s{2,})([A-Z_][A-Z0-9_]*)\s*:/gm;
      let m: RegExpExecArray | null;
      while ((m = yamlEnvRe.exec(content)) !== null) {
        const name = m[1];
        if (!defined.has(name)) defined.set(name, new Set());
        defined.get(name)!.add(relPath);
      }
    } else {
      for (const name of parseEnvFile(content)) {
        if (!defined.has(name)) defined.set(name, new Set());
        defined.get(name)!.add(relPath);
        const line = content.split('\n').find((l) => l.startsWith(`${name}=`));
        if (line && line.split('=')[1]?.trim()) defaults.add(name);
      }
    }
  }

  for (const relPath of sourceFiles.slice(0, 300)) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;

    let m: RegExpExecArray | null;
    const re = new RegExp(ENV_USAGE_RE.source, 'g');
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (!used.has(name)) used.set(name, new Set());
      used.get(name)!.add(relPath);

      const afterMatch = content.slice(m.index + m[0].length, m.index + m[0].length + 20);
      if (/^\s*(?:\?\?|[|][|])/.test(afterMatch)) defaults.add(name);
    }
  }

  const allNames = new Set([...defined.keys(), ...used.keys()]);
  const results: EnvVarInfo[] = [];

  for (const name of allNames) {
    results.push({
      name,
      category: categorizeEnvVar(name),
      definedIn: Array.from(defined.get(name) ?? []),
      usedIn: Array.from(used.get(name) ?? []),
      hasDefault: defaults.has(name),
      isSecret: isSecretName(name),
    });
  }

  return results.sort((a, b) => {
    if (a.isSecret !== b.isSecret) return a.isSecret ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── Contextual Port analysis ──────────────────────────────────────────────────

const BACKLOG_VALUES = new Set([128, 256, 511, 512, 1024, 2048, 4096]);
const VALID_PORTS = { min: 80, max: 65535 };

/** Strip code comments so that numbers in comments don't create false port mentions */
export function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/^#.*/gm, '');
}

/**
 * Find contextual port number mentions across config and source files.
 * Ignores RFC references, backlog values, benchmark counts, and comments.
 */
export async function analyzePortMentions(
  repoPath: string,
  filePaths: string[],
): Promise<PortMention[]> {
  const mentions: PortMention[] = [];
  const seen = new Set<string>();

  for (const relPath of filePaths.slice(0, 150)) {
    const rawContent = readFileSafe(path.join(repoPath, relPath));
    if (!rawContent) continue;

    const isDocker = /dockerfile|docker-compose/i.test(relPath);
    const content = isDocker ? rawContent : stripComments(rawContent);
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // 1. Docker EXPOSE
      const exposeMatch = line.match(/^\s*EXPOSE\s+(\d{2,5})/i);
      if (exposeMatch) {
        const port = parseInt(exposeMatch[1], 10);
        if (port >= VALID_PORTS.min && port <= VALID_PORTS.max) {
          const key = `${relPath}:${port}:${idx}`;
          if (!seen.has(key)) {
            seen.add(key);
            mentions.push({
              port,
              filePath: relPath,
              context: line.trim().slice(0, 80),
              line: idx + 1,
              role: 'docker_expose',
              isServerListen: true,
            });
          }
        }
      }

      // 2. Server listen: .listen(3000) or .listen({ port: 3000 })
      const listenMatch = line.match(/\.listen\s*\(\s*(?:\{\s*port:\s*)?(\d{2,5})/i);
      if (listenMatch) {
        const port = parseInt(listenMatch[1], 10);
        // Exclude backlog parameters like 511
        if (port >= VALID_PORTS.min && port <= VALID_PORTS.max && !BACKLOG_VALUES.has(port)) {
          const key = `${relPath}:${port}:${idx}`;
          if (!seen.has(key)) {
            seen.add(key);
            mentions.push({
              port,
              filePath: relPath,
              context: line.trim().slice(0, 80),
              line: idx + 1,
              role: 'server_listen',
              isServerListen: true,
            });
          }
        }
      }

      // 3. Env fallback: process.env.PORT || 3000
      const envPortMatch = line.match(/process\.env\.PORT\s*(?:\|\||\?\?)\s*(\d{2,5})/i);
      if (envPortMatch) {
        const port = parseInt(envPortMatch[1], 10);
        if (port >= VALID_PORTS.min && port <= VALID_PORTS.max) {
          const key = `${relPath}:${port}:${idx}`;
          if (!seen.has(key)) {
            seen.add(key);
            mentions.push({
              port,
              filePath: relPath,
              context: line.trim().slice(0, 80),
              line: idx + 1,
              role: 'env_fallback',
              isServerListen: true,
            });
          }
        }
      }
    });
  }

  return mentions;
}
