import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeCi, analyzeEnvVars } from './analyzers/configDoctor';
import { buildImportGraph, createResolver, extractSpecifiers, reachFromTests } from './analyzers/importGraph';
import { isAuthRelated, scoreImportance } from './analyzers/importance';
import { PythonAdapter } from './analyzers/languages/python';
import { analyzeSecurity } from './analyzers/securityScanner';
import { calculateHealthScore } from './services/prioritizationService';
import { startAnalysis } from './services/analysisService';
import { getAnalysis } from './models/analysisStore';
import type { AnalysisResult, ConfigIssue, RepositoryProfile, TestMapping, TestProfile } from './types';

const fixtures: string[] = [];

function fixtureRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'dd-engine-'));
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
    testFrameworks: ['vitest'], isMonorepo: false, workspaces: [], dependencies: {}, devDependencies: {},
    scripts: {}, isGitRepo: false, totalFiles: 0, sourceFiles: [], testFiles: [], configFiles: [],
    entryPoints: [], hasTypes: true,
    ...overrides,
  } as RepositoryProfile;
}

async function analyze(repo: string): Promise<AnalysisResult> {
  const id = await startAnalysis(repo, { generateTests: false });
  for (;;) {
    const a = getAnalysis(id);
    if (a?.status === 'error') throw new Error(a.error);
    if (a?.result) return a.result;
    await new Promise((r) => setTimeout(r, 20));
  }
}

afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

describe('import graph', () => {
  it('extracts ESM, CommonJS, dynamic, and mock imports', () => {
    const specs = extractSpecifiers([
      "import a from './a';", "import { b,\n c } from '../b.js';", "export * from './c';",
      "const d = require('./d');", "await import('./e');", "vi.mock('./f');",
    ].join('\n'), 'src/x.ts');
    expect(specs).toEqual(expect.arrayContaining(['./a', '../b.js', './c', './d', './e', './f']));
  });

  it('keeps each Python `from x import y` on its own line', () => {
    const specs = extractSpecifiers('from .api import get, post\nfrom .sessions import Session\nfrom . import (\n  utils,\n)\n', 'pkg/__init__.py');
    expect(specs).toEqual(expect.arrayContaining(['.api', '.sessions', '.utils']));
  });

  it('follows tests through the package entry to the modules it loads', async () => {
    const repo = fixtureRepo({
      'package.json': JSON.stringify({ name: 'mylib', main: 'lib/index.js' }),
      'lib/index.js': "module.exports = require('./core');",
      'lib/core.ts': "export * from './util.js';",
      'lib/util.ts': 'export const u = 1;',
      'test/core.test.js': "const lib = require('..');\nconst again = require('mylib');",
    });
    const files = ['lib/index.js', 'lib/core.ts', 'lib/util.ts', 'test/core.test.js'];
    const graph = buildImportGraph(files, (f) => require('node:fs').readFileSync(path.join(repo, f), 'utf8'), await createResolver(repo, new Set(files)));
    const reach = reachFromTests(graph, ['test/core.test.js'], (f) => f.startsWith('lib/'));
    expect(reach.get('lib/index.js')?.depth).toBe(1);
    expect(reach.get('lib/core.ts')?.depth).toBe(2);
    expect(reach.get('lib/util.ts')?.depth).toBe(3);
  });
});

describe('importance', () => {
  it('matches whole words, not substrings', () => {
    expect(isAuthRelated('src/authRouter.ts')).toBe(true);
    expect(isAuthRelated('verifyPassword')).toBe(true);
    expect(isAuthRelated('lib/authors.js')).toBe(false);
    expect(isAuthRelated('oracleClient')).toBe(false);
    expect(isAuthRelated('requests/sessions.py')).toBe(false);
  });

  it('does not treat array lookups or tokenizers as risky code', () => {
    const { importance } = scoreImportance({ name: 'tokenize', filePath: 'src/lexer.ts', body: 'items.find(x => x.token)', isExported: false, sourceType: 'production' });
    expect(importance).toBe('low');
  });
});

describe('health score', () => {
  const testProfile = (files: number): TestProfile => ({
    totalTestFiles: files, totalTestCount: files * 5, suites: [], coveredFiles: new Set(),
    coverage: { status: files ? 'EVIDENCE_BASED' : 'UNAVAILABLE', reason: '' },
  });
  const mappings = (tested: number, total: number): TestMapping[] => Array.from({ length: total }, (_, i) => ({
    sourceFile: `src/m${i}.ts`, relatedTests: [], coverageStatus: i < tested ? 'DIRECTLY_TESTED' : 'NOT_TESTED', confidence: 0.9, evidence: [],
  }));

  it('gives a thoroughly tested, clean repository an A', () => {
    const score = calculateHealthScore({ mappings: mappings(40, 40), symbols: [], routes: [], testGaps: [], configIssues: [], testProfile: testProfile(40) });
    expect(score.grade).toBe('A');
  });

  it('fails a repository with no tests', () => {
    const score = calculateHealthScore({ mappings: mappings(0, 10), symbols: [], routes: [], testGaps: [], configIssues: [], testProfile: testProfile(0) });
    expect(score.testing).toBe(0);
    expect(score.grade).toBe('F');
  });

  it('applies config issues with diminishing returns and explains each one', () => {
    const issues = Array.from({ length: 20 }, (_, i): ConfigIssue => ({
      id: String(i), severity: 'medium', confidence: 1, category: 'documentation', title: `Issue ${i}`, description: '', evidence: [], recommendedFix: '',
    }));
    const score = calculateHealthScore({ mappings: mappings(10, 10), symbols: [], routes: [], testGaps: [], configIssues: issues, testProfile: testProfile(10) });
    expect(score.configuration).toBeGreaterThan(15); // 20 medium issues never reach 0
    expect(score.factors.filter((f) => f.dimension === 'configuration')).toHaveLength(20);
  });
});

describe('full pipeline', () => {
  it('scores a small well-tested library highly and an untested service low', async () => {
    const lib = fixtureRepo({
      'package.json': JSON.stringify({ name: 'tiny', main: 'index.js', scripts: { test: 'node --test' } }),
      'README.md': '# tiny\n\nnpm install tiny\n\nnpm test\n',
      'index.js': "exports.add = (a, b) => a + b;\nexports.sub = require('./lib/sub');",
      'lib/sub.js': 'module.exports = (a, b) => a - b;',
      'test/index.test.js': "const t = require('..');\nrequire('node:test')('adds', () => t.add(1, 2));",
    });
    const service = fixtureRepo({
      'package.json': JSON.stringify({ name: 'svc', dependencies: { express: '^4' } }),
      'src/server.js': "const app = require('express')();\napp.post('/login', (req, res) => res.send(process.env.JWT_SECRET));\napp.listen(3000);",
    });
    const good = await analyze(lib);
    const bad = await analyze(service);
    expect(good.testEvidence?.untested).toBe(0);
    expect(good.healthScore.grade).toBe('A');
    expect(bad.healthScore.grade).toBe('F');
    expect(bad.testGaps.some((g) => g.title === 'API route not tested: POST /login')).toBe(true);
  });
});

describe('ConfigDoctor context', () => {
  it('accepts a legacy workflow when another tests a supported Node version', async () => {
    const repo = fixtureRepo({
      '.github/workflows/ci.yml': 'jobs:\n  t:\n    strategy:\n      matrix:\n        node-version: [18, 20, 22]\n    steps:\n      - run: npm ci\n      - run: npm test\n',
      '.github/workflows/legacy.yml': 'jobs:\n  t:\n    strategy:\n      matrix:\n        node-version: [14, 16]\n    steps:\n      - run: npm install\n      - run: npm test\n',
    });
    const { issues } = await analyzeCi(repo, profile({ nodeVersion: '>=18', scripts: { test: 'mocha' }, configFiles: ['.github/workflows/ci.yml', '.github/workflows/legacy.yml'] }));
    expect(issues).toEqual([]);
  });

  it('recognizes tests run through make, matrix tasks, and renamed scripts', async () => {
    const repo = fixtureRepo({
      '.github/workflows/a.yml': 'steps:\n  - run: make ci\n',
      '.github/workflows/b.yml': 'strategy:\n  matrix:\n    task: [test:node, lint]\nsteps:\n  - run: pnpm i\n  - run: pnpm run ${{ matrix.task }}\n',
    });
    const base = { testFiles: ['test/a.test.js'], configFiles: ['.github/workflows/a.yml'] };
    expect((await analyzeCi(repo, profile(base))).issues).toEqual([]);
    expect((await analyzeCi(repo, profile({ ...base, scripts: { 'test:node': 'vitest' }, configFiles: ['.github/workflows/b.yml'] }))).issues).toEqual([]);
  });

  it('treats variables named in the docs as documented, and is lenient with libraries', async () => {
    const repo = fixtureRepo({ 'src/a.ts': 'const a = process.env.MYLIB_DEBUG; const b = process.env.MYLIB_COLOR;' });
    const { issues } = await analyzeEnvVars(repo, ['src/a.ts'], { isService: false, docsText: 'set mylib_debug=1 to log' });
    expect(issues.map((i) => [i.title, i.severity])).toEqual([['Undocumented application environment variable: MYLIB_COLOR', 'low']]);
  });
});

describe('security scanner', () => {
  it('flags committed secrets and known key formats without echoing values', async () => {
    const fakeKey = ['AKIA', 'Q3EGZ7X4M2NBVPLK'].join('');
    const repo = fixtureRepo({
      '.env': 'JWT_SECRET=s3cr3tValue99\nPORT=3000\n',
      '.env.example': 'JWT_SECRET=changeme\n',
      'tests/fixtures/.env': 'API_KEY=fixture123abc\n',
      'src/aws.ts': `const id = '${fakeKey}';`,
    });
    const issues = await analyzeSecurity(repo, profile({ sourceFiles: ['src/aws.ts'] }));
    expect(issues.map((i) => i.title)).toEqual(['Secrets committed in .env', 'Possible AWS access key hardcoded in src/aws.ts']);
    expect(JSON.stringify(issues)).not.toContain('s3cr3tValue99');
    expect(JSON.stringify(issues)).not.toContain(fakeKey);
  });

  it('ignores placeholders and interpolated values', async () => {
    const repo = fixtureRepo({ '.env': 'SECRET_KEY=changethis\nDATABASE_URL=postgres://u:${POSTGRES_PASSWORD}@db/app\nOPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n' });
    expect(await analyzeSecurity(repo, profile())).toEqual([]);
  });
});

describe('Python adapter', () => {
  it('ignores route examples inside docstrings', () => {
    const repo = fixtureRepo({ 'pkg/app.py': 'def route(self, rule):\n    """Example:\n\n    @app.route("/")\n    def index(): ...\n    """\n    pass\n' });
    const { routes, symbols } = PythonAdapter.analyzeCode(repo, ['pkg/app.py']);
    expect(routes).toEqual([]);
    expect(symbols.map((s) => s.name)).toEqual(['route']);
  });
});
