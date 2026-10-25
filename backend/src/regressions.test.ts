import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeCode } from './analyzers/codeAnalyzer';
import { analyzeRuntime, analyzeCi, analyzeEnvVars } from './analyzers/configDoctor';
import { PythonAdapter } from './analyzers/languages/python';
import { generateTestsForGaps } from './analyzers/testPilot';
import { parseTestCounts } from './runners/testRunner';
import { isGitHubUrl, normalizeGitHubUrl } from './services/githubService';
import { buildPriorityFindings } from './services/prioritizationService';
import { repoName, resolveRepoPath, stripUrlCredentials } from './utils/security';
import type { RepositoryProfile, TestGap } from './types';

const fixtures: string[] = [];

/** Create a throwaway repository with the given files. */
function fixtureRepo(files: Record<string, string>, prefix = 'dd-regression-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  fixtures.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

function profile(overrides: Partial<RepositoryProfile> = {}): RepositoryProfile {
  return {
    name: 'fixture', language: 'typescript', primaryEcosystem: 'node', packageManager: 'npm',
    testFrameworks: ['jest'], isMonorepo: false, workspaces: [], dependencies: {}, devDependencies: {},
    scripts: {}, isGitRepo: false, totalFiles: 0, sourceFiles: [], testFiles: [], configFiles: [],
    entryPoints: [], hasTypes: true,
    ...overrides,
  } as RepositoryProfile;
}

function gap(overrides: Partial<TestGap>): TestGap {
  return {
    id: 'gap', severity: 'high', confidence: 0.8, category: 'no_test', title: 'No test for: x',
    description: '', filePath: 'src/x.ts', reason: '', evidence: [], existingTests: [],
    recommendedTests: ["should handle the user's input"],
    ...overrides,
  };
}

afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

describe('GitHub references', () => {
  it('recovers owner/repo from clone directories even when names contain dashes', () => {
    expect(repoName('/tmp/doctor-dev-priyanshusharan-cmd__doctor-dev-Ab12Cd')).toBe('priyanshusharan-cmd/doctor-dev');
  });

  it('normalizes URL variants to one HTTPS clone URL', () => {
    for (const input of [
      'https://github.com/vercel/next.js', 'https://github.com/vercel/next.js/', 'http://github.com/vercel/next.js.git',
      'git@github.com:vercel/next.js.git', 'vercel/next.js',
    ]) {
      expect(normalizeGitHubUrl(input)).toBe('https://github.com/vercel/next.js.git');
    }
  });

  it('does not treat dot paths as GitHub references', () => {
    expect(isGitHubUrl('./demo-repository')).toBe(false);
    expect(isGitHubUrl('demo/..')).toBe(false);
  });

  it('strips credentials from git remotes', () => {
    expect(stripUrlCredentials('https://user:ghp_secret@github.com/a/b.git')).toBe('https://github.com/a/b.git');
    expect(stripUrlCredentials('git@github.com:a/b.git')).toBe('git@github.com:a/b.git');
  });

  it('refuses to analyze a temporary clone owned by another analysis', () => {
    const clone = fixtureRepo({ 'package.json': '{}' }, 'doctor-dev-attacker__repo-');
    expect(() => resolveRepoPath(clone)).toThrow(/temporary clone/);
  });
});

describe('test runner output parsing', () => {
  it('reads per-test counts instead of suite counts from Jest', () => {
    const jest = 'Test Suites: 1 failed, 2 passed, 3 total\nTests:       2 failed, 10 passed, 12 total';
    expect(parseTestCounts(jest)).toEqual({ passed: 10, failed: 2, skipped: 0 });
  });

  it('reads Vitest, Mocha, and node:test summaries', () => {
    expect(parseTestCounts(' Test Files  1 passed (1)\n      Tests  8 passed | 1 skipped (9)'))
      .toEqual({ passed: 8, failed: 0, skipped: 1 });
    expect(parseTestCounts('  5 passing (20ms)\n  1 failing')).toEqual({ passed: 5, failed: 1, skipped: 0 });
    expect(parseTestCounts('# tests 4\n# pass 3\n# fail 1')).toEqual({ passed: 3, failed: 1, skipped: 0 });
  });
});

describe('route detection', () => {
  it('ignores HTTP client calls and middleware mounts', () => {
    const repo = fixtureRepo({
      'src/server.ts': [
        "app.use('/api', router);",
        "router.get('/users', listUsers);",
        "router.post('/login', (req, res) => res.send('ok'));",
        "axios.get('/users', { timeout: 10 });",
        "cache.get('/key');",
      ].join('\n'),
    });
    const { routes } = analyzeCode(repo, ['src/server.ts']);
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /users', 'POST /login']);
  });
});

describe('Python adapter', () => {
  it('stops attributing functions to a class after its body ends', () => {
    const repo = fixtureRepo({
      'app/service.py': 'class UserService:\n    def create(self, name):\n        pass\n\ndef helper():\n    pass\n',
    });
    const names = PythonAdapter.analyzeCode(repo, ['app/service.py']).symbols.map((s) => s.name);
    expect(names).toEqual(['UserService', 'UserService.create', 'helper']);
  });
});

describe('generated tests', () => {
  it('imports the file under test with a correct relative path and one file per source', () => {
    const tests = generateTestsForGaps([
      gap({ id: 'a', filePath: 'src/auth/authRouter.ts', symbolName: 'login' }),
      gap({ id: 'b', filePath: 'src/auth/authRouter.ts', symbolName: 'AuthService.verify' }),
    ], 'jest');
    expect(tests).toHaveLength(1);
    expect(tests[0].filePath).toBe('src/__tests__/auth/authRouter.test.ts');
    expect(tests[0].content).toContain("import { login, AuthService } from '../../auth/authRouter';");
    // Quotes in test names must not break the generated source
    expect(tests[0].content).toContain('it("should handle the user\'s input"');
  });

  it('writes pytest skeletons for Python files', () => {
    const [test] = generateTestsForGaps([gap({ filePath: 'app/users.py', symbolName: 'create_user' })], 'pytest');
    expect(test.filePath).toBe('tests/app/test_users.py');
    expect(test.content).toContain('from app.users import create_user');
  });
});

describe('ConfigDoctor false positives', () => {
  it('does not ask non-Node projects for a package.json test script', () => {
    const repo = fixtureRepo({ 'main.py': 'print(1)\n' });
    const issues = analyzeRuntime(repo, profile({ primaryEcosystem: 'python', sourceFiles: ['main.py'] }));
    expect(issues.filter((i) => i.category === 'scripts')).toHaveLength(0);
    expect(issues.some((i) => i.title === 'No .env.example file found')).toBe(false);
  });

  it('reports a missing test script once, naming the installed framework', () => {
    const repo = fixtureRepo({ 'package.json': '{}' });
    const issues = analyzeRuntime(repo, profile({ devDependencies: { vitest: '^3.0.0' } }));
    expect(issues.filter((i) => i.category === 'scripts').map((i) => i.title))
      .toEqual(['Test framework installed but no test script configured']);
  });

  it('accepts matrix and file-based Node versions in CI', async () => {
    const repo = fixtureRepo({
      '.github/workflows/ci.yml': 'jobs:\n  t:\n    strategy:\n      matrix:\n        node-version: [20.11.0, 22]\n    steps:\n      - run: npm ci\n      - run: npm test\n',
    });
    const { issues } = await analyzeCi(repo, profile({
      nodeVersion: '>=20', scripts: { test: 'jest' }, configFiles: ['.github/workflows/ci.yml'],
    }));
    expect(issues).toEqual([]);
  });

  it('finds env templates in sub-packages and bracket/Vite env access', async () => {
    const repo = fixtureRepo({
      'backend/.env.example': 'export API_TOKEN=\n',
      'backend/src/a.ts': "const t = process.env['API_TOKEN'];\nconst u = import.meta.env.VITE_URL;\nconst m = import.meta.env.MODE;",
    });
    const { envVars, issues } = await analyzeEnvVars(repo, ['backend/src/a.ts']);
    expect(envVars.find((v) => v.name === 'API_TOKEN')?.definedIn).toEqual(['backend/.env.example']);
    expect(envVars.some((v) => v.name === 'MODE')).toBe(false);
    expect(issues.map((i) => i.title)).toEqual(['Undocumented application environment variable: VITE_URL']);
  });
});

describe('priority findings', () => {
  it('lists untested routes by method and path', () => {
    const [finding] = buildPriorityFindings([
      gap({ id: 'r', severity: 'high', title: 'API route not tested: GET /users' }),
    ], []).filter((f) => f.title.includes('API route'));
    expect(finding.description).toBe('Routes including GET /users are not covered by any detected test.');
  });
});
