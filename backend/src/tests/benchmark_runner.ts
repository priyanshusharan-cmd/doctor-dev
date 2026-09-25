import path from 'path';
import fs from 'fs';
import { analyzeRepository } from '../analyzers/repositoryAnalyzer';
import { analyzeTests } from '../analyzers/configAnalyzer';
import { runConfigDoctor } from '../analyzers/configDoctor';
import { PythonAdapter } from '../analyzers/languages/python';
import { calculateHealthScore } from '../services/prioritizationService';

async function runAllBenchmarks() {
  console.log('====================================================');
  console.log('       DoctorDev Multi-Benchmark Verification       ');
  console.log('====================================================\n');

  const results: Record<string, any> = {};

  // 1. Node.js Benchmark
  console.log('--- 1. Testing Node.js Architecture Profile ---');
  {
    const mockNodeDir = path.join(__dirname, 'temp_bench_node');
    fs.mkdirSync(path.join(mockNodeDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(mockNodeDir, 'test', 'parallel'), { recursive: true });
    fs.mkdirSync(path.join(mockNodeDir, 'test', 'sequential'), { recursive: true });
    fs.mkdirSync(path.join(mockNodeDir, 'tools'), { recursive: true });

    fs.writeFileSync(path.join(mockNodeDir, 'Makefile'), 'test:\n\tpython tools/test.py --mode=release\n');
    fs.writeFileSync(path.join(mockNodeDir, 'pyproject.toml'), '[tool.flake8]\nmax-line-length = 88\n');
    fs.writeFileSync(path.join(mockNodeDir, '.npmrc'), 'registry=https://registry.npmjs.org/\n');
    fs.writeFileSync(path.join(mockNodeDir, 'node.gyp'), '{ "targets": [{ "target_name": "node" }] }\n');
    fs.writeFileSync(path.join(mockNodeDir, 'tools', 'test.py'), '#!/usr/bin/env python\n# Node test harness\n');

    fs.writeFileSync(path.join(mockNodeDir, 'lib', 'fs.js'), 'const git = process.env.GIT;\nconst term = process.env.TERM;\nconst port = process.env.PORT;\nmodule.exports = {};');
    fs.writeFileSync(path.join(mockNodeDir, 'lib', 'http.js'), 'const nodeOpts = process.env.NODE_OPTIONS;\nmodule.exports = {};');
    fs.writeFileSync(path.join(mockNodeDir, 'test', 'parallel', 'test-fs.js'), 'const assert = require("assert");\n// test fs\n');
    fs.writeFileSync(path.join(mockNodeDir, 'test', 'sequential', 'test-http.js'), 'const assert = require("assert");\n// test http\n');

    const repoProf = await analyzeRepository(mockNodeDir);
    const testProf = analyzeTests(mockNodeDir, repoProf.testFiles, repoProf.testFrameworkEvidence);
    const configHealth = await runConfigDoctor(mockNodeDir, repoProf);
    const health = calculateHealthScore(repoProf.sourceFiles.length, [], configHealth.issues, testProf);

    results['Node.js'] = {
      primaryEcosystem: repoProf.primaryEcosystem,
      packageManager: repoProf.packageManager,
      framework: repoProf.testFrameworkEvidence?.framework,
      executionModel: repoProf.testFrameworkEvidence?.executionModel,
      confidence: `${Math.round((repoProf.testFrameworkEvidence?.confidence ?? 0) * 100)}%`,
      coverageStatus: testProf.coverage.status,
      coveragePercentage: testProf.coverage.percentage,
      inheritedSuiteFramework: testProf.suites[0]?.framework,
      isSuiteInherited: testProf.suites[0]?.inheritedFramework,
      configIssuesCount: configHealth.issues.length,
      healthScore: `${health.overall} / ${health.grade}`,
    };

    fs.rmSync(mockNodeDir, { recursive: true, force: true });
    console.log('Result for Node.js:', results['Node.js']);
  }

  // 2. Express Benchmark
  console.log('\n--- 2. Testing Express Architecture Profile ---');
  {
    const mockExpressDir = path.join(__dirname, 'temp_bench_express');
    fs.mkdirSync(path.join(mockExpressDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(mockExpressDir, 'test'), { recursive: true });

    fs.writeFileSync(path.join(mockExpressDir, 'package.json'), JSON.stringify({
      name: 'express',
      scripts: { test: 'mocha --require test/support/env --reporter spec --bail --check-leaks test/' },
      devDependencies: { mocha: '^10.2.0' },
      dependencies: { accepts: '~1.3.8', 'body-parser': '1.20.3' }
    }, null, 2));
    fs.writeFileSync(path.join(mockExpressDir, 'lib', 'express.js'), 'const port = process.env.PORT;\nmodule.exports = {};');
    fs.writeFileSync(path.join(mockExpressDir, 'test', 'app.listen.js'), 'const express = require("../");\ndescribe("app.listen()", () => { it("should listen", () => {}); });');

    const repoProf = await analyzeRepository(mockExpressDir);
    const testProf = analyzeTests(mockExpressDir, repoProf.testFiles, repoProf.testFrameworkEvidence);
    const configHealth = await runConfigDoctor(mockExpressDir, repoProf);
    const health = calculateHealthScore(repoProf.sourceFiles.length, [], configHealth.issues, testProf);

    results['Express'] = {
      primaryEcosystem: repoProf.primaryEcosystem,
      packageManager: repoProf.packageManager,
      framework: repoProf.testFrameworkEvidence?.framework,
      executionModel: repoProf.testFrameworkEvidence?.executionModel,
      confidence: `${Math.round((repoProf.testFrameworkEvidence?.confidence ?? 0) * 100)}%`,
      coverageStatus: testProf.coverage.status,
      coveragePercentage: testProf.coverage.percentage,
      inheritedSuiteFramework: testProf.suites[0]?.framework,
      isSuiteInherited: testProf.suites[0]?.inheritedFramework,
      configIssuesCount: configHealth.issues.length,
      healthScore: `${health.overall} / ${health.grade}`,
    };

    fs.rmSync(mockExpressDir, { recursive: true, force: true });
    console.log('Result for Express:', results['Express']);
  }

  // 3. Fastify Benchmark
  console.log('\n--- 3. Testing Fastify Architecture Profile ---');
  {
    const mockFastifyDir = path.join(__dirname, 'temp_bench_fastify');
    fs.mkdirSync(path.join(mockFastifyDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(mockFastifyDir, 'test'), { recursive: true });

    fs.writeFileSync(path.join(mockFastifyDir, 'package.json'), JSON.stringify({
      name: 'fastify',
      scripts: { test: 'node --test test/*.test.js' },
      devDependencies: { '@types/node': '^20.0.0' },
      dependencies: { avvio: '^8.2.1' }
    }, null, 2));
    fs.writeFileSync(path.join(mockFastifyDir, 'lib', 'fastify.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(mockFastifyDir, 'test', 'server.test.js'), 'const { test } = require("node:test");\ntest("starts server", () => {});');

    const repoProf = await analyzeRepository(mockFastifyDir);
    const testProf = analyzeTests(mockFastifyDir, repoProf.testFiles, repoProf.testFrameworkEvidence);
    const configHealth = await runConfigDoctor(mockFastifyDir, repoProf);
    const health = calculateHealthScore(repoProf.sourceFiles.length, [], configHealth.issues, testProf);

    results['Fastify'] = {
      primaryEcosystem: repoProf.primaryEcosystem,
      packageManager: repoProf.packageManager,
      framework: repoProf.testFrameworkEvidence?.framework,
      executionModel: repoProf.testFrameworkEvidence?.executionModel,
      confidence: `${Math.round((repoProf.testFrameworkEvidence?.confidence ?? 0) * 100)}%`,
      coverageStatus: testProf.coverage.status,
      coveragePercentage: testProf.coverage.percentage,
      inheritedSuiteFramework: testProf.suites[0]?.framework,
      isSuiteInherited: testProf.suites[0]?.inheritedFramework,
      configIssuesCount: configHealth.issues.length,
      healthScore: `${health.overall} / ${health.grade}`,
    };

    fs.rmSync(mockFastifyDir, { recursive: true, force: true });
    console.log('Result for Fastify:', results['Fastify']);
  }

  // 4. Axios Benchmark
  console.log('\n--- 4. Testing Axios Architecture Profile ---');
  {
    const mockAxiosDir = path.join(__dirname, 'temp_bench_axios');
    fs.mkdirSync(path.join(mockAxiosDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(mockAxiosDir, 'test', 'unit'), { recursive: true });

    fs.writeFileSync(path.join(mockAxiosDir, 'package.json'), JSON.stringify({
      name: 'axios',
      scripts: { test: 'mocha test/unit/**/*.js' },
      devDependencies: { mocha: '^10.0.0' },
      dependencies: { 'follow-redirects': '^1.15.6' }
    }, null, 2));
    fs.writeFileSync(path.join(mockAxiosDir, 'lib', 'axios.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(mockAxiosDir, 'test', 'unit', 'adapter.js'), 'describe("adapter", () => { it("requests", () => {}); });');

    const repoProf = await analyzeRepository(mockAxiosDir);
    const testProf = analyzeTests(mockAxiosDir, repoProf.testFiles, repoProf.testFrameworkEvidence);
    const configHealth = await runConfigDoctor(mockAxiosDir, repoProf);
    const health = calculateHealthScore(repoProf.sourceFiles.length, [], configHealth.issues, testProf);

    results['Axios'] = {
      primaryEcosystem: repoProf.primaryEcosystem,
      packageManager: repoProf.packageManager,
      framework: repoProf.testFrameworkEvidence?.framework,
      executionModel: repoProf.testFrameworkEvidence?.executionModel,
      confidence: `${Math.round((repoProf.testFrameworkEvidence?.confidence ?? 0) * 100)}%`,
      coverageStatus: testProf.coverage.status,
      coveragePercentage: testProf.coverage.percentage,
      inheritedSuiteFramework: testProf.suites[0]?.framework,
      isSuiteInherited: testProf.suites[0]?.inheritedFramework,
      configIssuesCount: configHealth.issues.length,
      healthScore: `${health.overall} / ${health.grade}`,
    };

    fs.rmSync(mockAxiosDir, { recursive: true, force: true });
    console.log('Result for Axios:', results['Axios']);
  }

  // 5. Python Benchmark
  console.log('\n--- 5. Testing Python Benchmark Profile ---');
  {
    const mockPyDir = path.join(__dirname, 'temp_bench_py');
    fs.mkdirSync(path.join(mockPyDir, 'myapp'), { recursive: true });
    fs.mkdirSync(path.join(mockPyDir, 'tests'), { recursive: true });

    fs.writeFileSync(path.join(mockPyDir, 'pyproject.toml'), '[tool.poetry]\nname = "myapp"\n[tool.pytest.ini_options]\n');
    fs.writeFileSync(path.join(mockPyDir, 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(mockPyDir, 'myapp', 'app.py'), '@app.route("/items")\ndef get_items():\n    return []\n');
    fs.writeFileSync(path.join(mockPyDir, 'tests', 'test_items.py'), 'def test_get_items():\n    assert True\n');

    const repoProf = await analyzeRepository(mockPyDir);
    const pyTestProf = PythonAdapter.analyzeTests(mockPyDir, repoProf.testFiles);
    const pyParsed = PythonAdapter.analyzeCode(mockPyDir, repoProf.sourceFiles);

    results['Python'] = {
      primaryEcosystem: repoProf.primaryEcosystem,
      packageManager: repoProf.packageManager,
      framework: repoProf.testFrameworkEvidence?.framework,
      executionModel: repoProf.testFrameworkEvidence?.executionModel,
      symbolsDiscovered: pyParsed.symbols.length,
      routesDiscovered: pyParsed.routes.length,
      testFiles: pyTestProf.totalTestFiles,
      testCases: pyTestProf.totalTestCount,
      coverageStatus: pyTestProf.coverage.status,
    };

    fs.rmSync(mockPyDir, { recursive: true, force: true });
    console.log('Result for Python:', results['Python']);
  }

  console.log('\n====================================================');
  console.log('              Final Summary Comparison              ');
  console.log('====================================================');
  console.table(results);
}

runAllBenchmarks().catch(console.error);
