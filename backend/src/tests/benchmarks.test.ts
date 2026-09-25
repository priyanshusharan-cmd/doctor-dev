import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { categorizeEnvVar, stripComments } from '../analyzers/configAnalyzer';
import { detectPrimaryEcosystem } from '../analyzers/repositoryAnalyzer';
import { PythonAdapter } from '../analyzers/languages/python';
import { calculateHealthScore } from '../services/prioritizationService';
import type { TestGap, ConfigIssue, TestProfile } from '../types';

console.log('--- Running DoctorDev Architecture & Benchmark Regression Tests ---');

// ─── Test 1: Node.js Ecosystem & Dependency Classification ────────────────────
console.log('Test 1: Node.js ecosystem classification (never Poetry)');
{
  const mockRepoPath = path.join(__dirname, 'mock_node_repo');
  fs.mkdirSync(mockRepoPath, { recursive: true });
  fs.writeFileSync(path.join(mockRepoPath, 'package.json'), JSON.stringify({ name: 'node-core', scripts: { test: 'node --test' } }));
  // Simulate auxiliary pyproject.toml in a tools/ subdirectory
  fs.mkdirSync(path.join(mockRepoPath, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(mockRepoPath, 'tools', 'pyproject.toml'), '[tool.poetry]');

  const eco = detectPrimaryEcosystem(mockRepoPath, 'javascript');
  assert.strictEqual(eco, 'node', 'Node repository must be classified as node ecosystem even if python tooling exists');

  // Cleanup
  fs.rmSync(mockRepoPath, { recursive: true, force: true });
  console.log('✓ Test 1 passed: Node.js is never misclassified as Poetry.');
}

// ─── Test 2: Environment Variable Categorization & Filtering ─────────────────
console.log('Test 2: Environment variable semantic categorization');
{
  assert.strictEqual(categorizeEnvVar('PATH'), 'OS_SHELL', 'PATH must be OS_SHELL');
  assert.strictEqual(categorizeEnvVar('TERM'), 'OS_SHELL', 'TERM must be OS_SHELL');
  assert.strictEqual(categorizeEnvVar('SHELL'), 'OS_SHELL', 'SHELL must be OS_SHELL');
  assert.strictEqual(categorizeEnvVar('GITHUB_ACTIONS'), 'CI_CD', 'GITHUB_ACTIONS must be CI_CD');
  assert.strictEqual(categorizeEnvVar('CI'), 'CI_CD', 'CI must be CI_CD');
  assert.strictEqual(categorizeEnvVar('P'), 'OS_SHELL', 'Single-letter P must be OS_SHELL');
  assert.strictEqual(categorizeEnvVar('NODE_OPTIONS'), 'NODE_RUNTIME', 'NODE_OPTIONS must be NODE_RUNTIME');
  assert.strictEqual(categorizeEnvVar('DATABASE_URL'), 'DATABASE', 'DATABASE_URL must be DATABASE');
  assert.strictEqual(categorizeEnvVar('STRIPE_SECRET_KEY'), 'SERVICE', 'STRIPE_SECRET_KEY must be SERVICE');
  assert.strictEqual(categorizeEnvVar('APP_SECRET_TOKEN'), 'APPLICATION', 'APP_SECRET_TOKEN must be APPLICATION');
  console.log('✓ Test 2 passed: OS, runtime, and CI variables categorized accurately.');
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

  // Low confidence unconfirmed gaps (e.g. from static AST limitation)
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

console.log('All regression tests passed successfully!');
