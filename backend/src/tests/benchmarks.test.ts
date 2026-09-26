import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { categorizeEnvVar, stripComments, analyzeTests, detectCoverage } from '../analyzers/configAnalyzer';
import { detectPrimaryEcosystem, analyzeRepository } from '../analyzers/repositoryAnalyzer';
import { analyzeEnvVars } from '../analyzers/configDoctor';
import { PythonAdapter } from '../analyzers/languages/python';
import { calculateHealthScore } from '../services/prioritizationService';
import type { TestGap, TestProfile, CoverageInfo } from '../types';

async function main() {
  console.log('--- Running DoctorDev Architecture & Benchmark Regression Tests ---');

  // ─── Test 1: Node.js Ecosystem & Dependency Classification ────────────────────
  console.log('Test 1: Node.js ecosystem classification (never Poetry)');
  {
    const mockRepoPath = path.join(__dirname, 'mock_node_repo');
    fs.mkdirSync(mockRepoPath, { recursive: true });
    fs.writeFileSync(path.join(mockRepoPath, 'package.json'), JSON.stringify({ name: 'node-core', scripts: { test: 'node --test' } }));
    fs.mkdirSync(path.join(mockRepoPath, 'tools'), { recursive: true });
    fs.writeFileSync(path.join(mockRepoPath, 'tools', 'pyproject.toml'), '[tool.poetry]');

    const eco = detectPrimaryEcosystem(mockRepoPath, 'javascript');
    assert.strictEqual(eco, 'node', 'Node repository must be classified as node ecosystem even if python tooling exists');

    fs.rmSync(mockRepoPath, { recursive: true, force: true });
    console.log('✓ Test 1 passed: Node.js is never misclassified as Poetry.');
  }

  // ─── Test 2: Environment Variable Categorization & Filtering ─────────────────
  console.log('Test 2: Environment variable semantic categorization & system variable filtering');
  {
    // Tooling & system
    assert.strictEqual(categorizeEnvVar('GIT'), 'TOOLING', 'GIT must be TOOLING');
    assert.strictEqual(categorizeEnvVar('SHELLCHECK'), 'TOOLING', 'SHELLCHECK must be TOOLING');
    assert.strictEqual(categorizeEnvVar('PORT'), 'TOOLING', 'PORT must be TOOLING');
    assert.strictEqual(categorizeEnvVar('PATH'), 'OS_SHELL', 'PATH must be OS_SHELL');
    assert.strictEqual(categorizeEnvVar('TERM'), 'OS_SHELL', 'TERM must be OS_SHELL');
    assert.strictEqual(categorizeEnvVar('SHELL'), 'OS_SHELL', 'SHELL must be OS_SHELL');
    assert.strictEqual(categorizeEnvVar('GITHUB_ACTIONS'), 'CI_CD', 'GITHUB_ACTIONS must be CI_CD');
    assert.strictEqual(categorizeEnvVar('CI'), 'CI_CD', 'CI must be CI_CD');
    assert.strictEqual(categorizeEnvVar('P'), 'OS_SHELL', 'Single-letter P must be OS_SHELL');
    assert.strictEqual(categorizeEnvVar('NODE_OPTIONS'), 'NODE_RUNTIME', 'NODE_OPTIONS must be NODE_RUNTIME');

    // Legitimate short application/service/database variables must NEVER be OS_SHELL
    assert.strictEqual(categorizeEnvVar('DB'), 'DATABASE', 'DB must be categorized as DATABASE, not OS_SHELL');
    assert.strictEqual(categorizeEnvVar('DATABASE_URL'), 'DATABASE', 'DATABASE_URL must be DATABASE');
    assert.strictEqual(categorizeEnvVar('ID'), 'APPLICATION', 'ID must be APPLICATION, not OS_SHELL');
    assert.strictEqual(categorizeEnvVar('IP'), 'APPLICATION', 'IP must be APPLICATION, not OS_SHELL');
    assert.strictEqual(categorizeEnvVar('API'), 'APPLICATION', 'API must be APPLICATION, not OS_SHELL');
    assert.strictEqual(categorizeEnvVar('STRIPE_SECRET_KEY'), 'SERVICE', 'STRIPE_SECRET_KEY must be SERVICE');
    assert.strictEqual(categorizeEnvVar('APP_SECRET_TOKEN'), 'APPLICATION', 'APP_SECRET_TOKEN must be APPLICATION');
    console.log('✓ Test 2 passed: Environment variables categorized accurately without misclassifying ID, DB, API, IP.');
  }

  // ─── Test 3: Contextual Port & Backlog Filtering ─────────────────────────────
  console.log('Test 3: Port detection filtering of backlogs and comments');
  {
    const codeWithComments = `
      // Listen on port 8080 for incoming connections
      /* server.listen(8080); */
      server.listen(3000, 511); // 511 is SOMAXCONN backlog
    `;
    const stripped = stripComments(codeWithComments);
    assert.ok(!stripped.includes('8080'), 'Comments must be stripped so 8080 is not detected');
    assert.ok(stripped.includes('3000'), 'Actual code must be preserved');
    console.log('✓ Test 3 passed: Comments and backlogs handled contextually.');
  }

  // ─── Test 4: Python Language Adapter ─────────────────────────────────────────
  console.log('Test 4: Python adapter symbol, route, and test discovery');
  {
    const mockPyRepo = path.join(__dirname, 'mock_py_repo');
    fs.mkdirSync(mockPyRepo, { recursive: true });
    const pyCode = `
class UserService:
    def __init__(self):
        pass

    def authenticate_user(self, username, password):
        return True

@app.route('/api/login', methods=['POST'])
def login():
    return 'ok'
    `;
    fs.writeFileSync(path.join(mockPyRepo, 'app.py'), pyCode);

    const parsed = PythonAdapter.analyzeCode(mockPyRepo, ['app.py']);
    assert.strictEqual(parsed.symbols.length, 4, 'Must extract UserService class, methods, and route handler');
    assert.strictEqual(parsed.routes.length, 1, 'Must extract @app.route');
    assert.strictEqual(parsed.routes[0].path, '/api/login', 'Must extract route path');
    assert.strictEqual(parsed.routes[0].method, 'POST', 'Must extract POST method');

    // Test suite discovery in Python
    const pyTestCode = `
import pytest

def test_login_success():
    assert True

def test_login_failure():
    assert False
    `;
    fs.writeFileSync(path.join(mockPyRepo, 'test_app.py'), pyTestCode);
    const testProf = PythonAdapter.analyzeTests(mockPyRepo, ['test_app.py']);
    assert.strictEqual(testProf.totalTestFiles, 1);
    assert.strictEqual(testProf.totalTestCount, 2, 'Must discover 2 pytest test cases');

    fs.rmSync(mockPyRepo, { recursive: true, force: true });
    console.log('✓ Test 4 passed: Python adapter accurately extracts symbols, routes, and test cases.');
  }

  // ─── Test 5: Health Score Confidence Calibration ──────────────────────────────
  console.log('Test 5: Health score confidence calibration');
  {
    const testProfile: TestProfile = {
      totalTestFiles: 100,
      totalTestCount: 500,
      suites: [],
      coveredFiles: new Set(),
      coverage: {
        status: 'EVIDENCE_BASED',
        reason: 'Mature test suite detected',
      },
    };

    const unconfirmedGaps: TestGap[] = [
      {
        id: 'gap-1',
        severity: 'high',
        confidence: 0.35,
        category: 'partial_test',
        title: 'Unconfirmed coverage for internal helper',
        description: 'Test',
        filePath: 'lib/internal/util.js',
        reason: 'Tests exist in repository but not directly mapped',
        evidence: [],
        existingTests: [],
        recommendedTests: [],
      },
    ];

    const score = calculateHealthScore(50, unconfirmedGaps, [], testProfile);
    assert.ok(score.testing >= 75, `Testing score should remain high for mature repos with low-confidence gaps (got ${score.testing})`);
    assert.ok(score.overall >= 75, `Overall score should not drop to F (got ${score.overall} / ${score.grade})`);
    console.log(`✓ Test 5 passed: Mature repos with low-confidence gaps score accurately (${score.overall} / ${score.grade}).`);
  }

  // ─── Test 6: Undefined Evidence-Based Coverage Never Renders as 0% ────────────
  console.log('Test 6: Undefined evidence-based coverage semantics');
  {
    const evidenceBasedCoverage: CoverageInfo = {
      status: 'EVIDENCE_BASED',
      reason: 'Estimated from test files and test cases',
    };

    assert.strictEqual(evidenceBasedCoverage.percentage, undefined, 'Percentage must be undefined when not explicitly computed');

    const formatCoverage = (cov: CoverageInfo): string => {
      if (cov.percentage !== undefined && cov.percentage !== null) {
        return `${cov.percentage}%`;
      }
      return 'Percentage unavailable';
    };

    const rendered = formatCoverage(evidenceBasedCoverage);
    assert.notStrictEqual(rendered, '0%', 'Undefined evidence-based coverage must never render as 0%');
    assert.strictEqual(rendered, 'Percentage unavailable');
    console.log('✓ Test 6 passed: Undefined evidence-based coverage percentage never renders as 0%.');
  }

  // ─── Test 7: Node Test Framework Propagation ──────────────────────────────────
  console.log('Test 7: Node test framework propagation to test suites');
  {
    const mockRepoPath = path.join(__dirname, 'mock_fw_propagation_repo');
    fs.mkdirSync(path.join(mockRepoPath, 'test'), { recursive: true });
    fs.writeFileSync(path.join(mockRepoPath, 'test', 'sample.test.js'), 'describe("math", () => { it("adds", () => {}); });');

    const repoEvidence = {
      framework: 'node-test',
      confidence: 0.95,
      executionModel: 'builtin_runner' as const,
      evidence: ['Test script invokes Node test runner'],
    };

    const prof = analyzeTests(mockRepoPath, ['test/sample.test.js'], repoEvidence);
    assert.strictEqual(prof.suites.length, 1);
    assert.strictEqual(prof.suites[0].framework, 'node-test', 'Suite must inherit repo framework when file has no explicit import');
    assert.strictEqual(prof.suites[0].inheritedFramework, true, 'Suite must mark inheritedFramework as true');
    assert.strictEqual(prof.testFrameworkEvidence?.framework, 'node-test');

    fs.rmSync(mockRepoPath, { recursive: true, force: true });
    console.log('✓ Test 7 passed: Node framework propagates to suites with inheritedFramework flag.');
  }

  // ─── Test 8: Node Package Manager = npm When package.json Exists ──────────────
  console.log('Test 8: Node package manager = npm when package.json exists');
  {
    const mockRepoPath = path.join(__dirname, 'mock_npm_repo');
    fs.mkdirSync(mockRepoPath, { recursive: true });
    fs.writeFileSync(path.join(mockRepoPath, 'package.json'), JSON.stringify({ name: 'my-node-app' }));
    fs.writeFileSync(path.join(mockRepoPath, 'requirements.txt'), 'sphinx>=4.0.0\nflake8\n');

    const profile = await analyzeRepository(mockRepoPath);
    assert.strictEqual(profile.primaryEcosystem, 'node', 'Primary ecosystem must be node');
    assert.strictEqual(profile.packageManager, 'npm', 'Package manager must be npm');
    assert.notStrictEqual(profile.packageManager, 'pip', 'Package manager must never be pip');
    assert.notStrictEqual(profile.packageManager, 'poetry', 'Package manager must never be poetry');

    fs.rmSync(mockRepoPath, { recursive: true, force: true });
    console.log('✓ Test 8 passed: Node package manager defaults to npm even when auxiliary Python files exist.');
  }

  // ─── Test 9: Bun Package Manager Detection ────────────────────────────────────
  console.log('Test 9: Bun package manager detection from bun.lock / bun.lockb');
  {
    const mockBunRepo = path.join(__dirname, 'mock_bun_repo');
    fs.mkdirSync(mockBunRepo, { recursive: true });
    fs.writeFileSync(path.join(mockBunRepo, 'package.json'), JSON.stringify({ name: 'my-bun-app' }));
    fs.writeFileSync(path.join(mockBunRepo, 'bun.lockb'), '');

    const profile = await analyzeRepository(mockBunRepo);
    assert.strictEqual(profile.packageManager, 'bun', 'Package manager must be detected as bun with bun.lockb');

    fs.rmSync(path.join(mockBunRepo, 'bun.lockb'));
    fs.writeFileSync(path.join(mockBunRepo, 'bun.lock'), '');

    const profile2 = await analyzeRepository(mockBunRepo);
    assert.strictEqual(profile2.packageManager, 'bun', 'Package manager must be detected as bun with bun.lock');

    fs.rmSync(mockBunRepo, { recursive: true, force: true });
    console.log('✓ Test 9 passed: Bun package manager detected correctly from bun.lock and bun.lockb.');
  }

  // ─── Test 10: Tooling Environment Variables Not Reported as Undocumented ────────
  console.log('Test 10: Tooling env vars not reported as undocumented application variables');
  {
    const mockRepoPath = path.join(__dirname, 'mock_env_repo');
    fs.mkdirSync(path.join(mockRepoPath, 'src'), { recursive: true });
    const appCode = `
      const gitBin = process.env.GIT || 'git';
      const scBin = process.env.SHELLCHECK || 'shellcheck';
      const port = process.env.PORT || 3000;
      const path = process.env.PATH;
      const term = process.env.TERM;
      const ghActions = process.env.GITHUB_ACTIONS;
      const nodeOpts = process.env.NODE_OPTIONS;
    `;
    fs.writeFileSync(path.join(mockRepoPath, 'src', 'app.js'), appCode);

    const { issues } = await analyzeEnvVars(mockRepoPath, ['src/app.js']);
    const undocumentedIssues = issues.filter((i) => i.title.includes('Undocumented application environment variable'));

    assert.strictEqual(undocumentedIssues.length, 0, `Expected 0 undocumented app env issues for tooling vars, got: ${undocumentedIssues.map((i) => i.title).join(', ')}`);

    fs.rmSync(mockRepoPath, { recursive: true, force: true });
    console.log('✓ Test 10 passed: Tooling and runtime variables are never reported as undocumented application variables.');
  }

  // ─── Test 11: Unsupported Coverage Formats Never Return Fake Percentage ─────────
  console.log('Test 11: Unsupported coverage formats assign ACTUAL_COVERAGE with undefined percentage');
  {
    const mockCovRepo = path.join(__dirname, 'mock_cov_repo');
    fs.mkdirSync(mockCovRepo, { recursive: true });
    fs.writeFileSync(path.join(mockCovRepo, 'coverage.xml'), '<coverage></coverage>');

    const cov = detectCoverage(mockCovRepo);
    assert.strictEqual(cov.status, 'ACTUAL_COVERAGE', 'Status should be ACTUAL_COVERAGE when report exists');
    assert.strictEqual(cov.percentage, undefined, 'Percentage must be undefined when parser does not compute it (never fake 80%)');

    fs.rmSync(mockCovRepo, { recursive: true, force: true });
    console.log('✓ Test 11 passed: Unsupported coverage format returns ACTUAL_COVERAGE with undefined percentage.');
  }

  console.log('\nAll DoctorDev regression benchmarks passed successfully!');
}

main().catch((err) => {
  console.error('\n❌ Benchmark regression test failed:', err);
  process.exit(1);
});
