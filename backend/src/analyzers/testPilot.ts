import { v4 as uuidv4 } from 'uuid';
import type {
  CodeSymbol,
  RouteInfo,
  TestProfile,
  TestMapping,
  TestGap,
  GeneratedTest,
  GapCategory,
  GapSeverity,
  CoverageStatus,
  TestFramework,
} from '../types';

// ─── Test Mapping ─────────────────────────────────────────────────────────────

/**
 * Map source files to their related test files using:
 * - filename proximity (foo.ts → foo.test.ts)
 * - import analysis (tests that import the source file)
 * - folder mirroring (src/services/foo.ts → tests/services/foo.test.ts)
 */
export function buildTestMappings(
  sourceFiles: string[],
  testProfile: TestProfile,
): TestMapping[] {
  const mappings: TestMapping[] = [];

  for (const sf of sourceFiles) {
    const relatedTests: string[] = [];
    const evidence: string[] = [];
    let confidence = 0;

    const sfBase = sf.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\\/g, '/');
    const sfName = sfBase.split('/').pop() ?? '';

    for (const suite of testProfile.suites) {
      const suiteBase = suite.filePath.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\\/g, '/');

      // Direct name match: foo.ts ↔ foo.test.ts
      if (
        suiteBase.endsWith(`/${sfName}.test`) ||
        suiteBase.endsWith(`/${sfName}.spec`) ||
        suiteBase.endsWith(`/${sfName}`) ||
        suiteBase.endsWith(`_test`)
      ) {
        relatedTests.push(suite.filePath);
        evidence.push(`Direct file name match with ${suite.filePath}`);
        confidence = Math.max(confidence, 0.95);
        continue;
      }

      // Import-based coverage
      if (suite.importsUnder.includes(sf)) {
        relatedTests.push(suite.filePath);
        evidence.push(`Imported directly by ${suite.filePath}`);
        confidence = Math.max(confidence, 0.9);
        continue;
      }

      // Path segment match: auth/user → user.test
      const sfSegments = sfBase.split('/');
      const suiteSegments = suiteBase.split('/');
      const overlap = sfSegments.filter((s) => suiteSegments.includes(s)).length;
      if (overlap >= 2 && sfName.length > 3 && suite.filePath.toLowerCase().includes(sfName.toLowerCase())) {
        relatedTests.push(suite.filePath);
        evidence.push(`Heuristic path and name match with ${suite.filePath}`);
        confidence = Math.max(confidence, 0.6);
      }
    }

    // De-duplicate
    const unique = [...new Set(relatedTests)];
    
    let status: CoverageStatus = 'NOT_TESTED';
    if (unique.length > 0) {
      if (confidence >= 0.9) status = 'DIRECTLY_TESTED';
      else if (confidence >= 0.7) status = 'INDIRECTLY_TESTED';
      else status = 'PARTIALLY_TESTED';
    } else if (testProfile.totalTestFiles > 0) {
      // If there are tests in the repo, but we just can't map them
      status = 'NOT_ENOUGH_EVIDENCE';
      evidence.push('Tests exist in repository but no direct mapping found.');
    }

    // Actual coverage overrides
    if (testProfile.coverage.status === 'ACTUAL_COVERAGE' && unique.length === 0) {
       status = 'NOT_ENOUGH_EVIDENCE';
       confidence = 0.5;
       evidence.push('Relying on actual coverage report rather than heuristics.');
    }

    mappings.push({
      sourceFile: sf,
      relatedTests: unique,
      coverageStatus: status,
      confidence: unique.length > 0 ? confidence : 0,
      evidence,
    });
  }

  return mappings;
}

// ─── Gap Detection ────────────────────────────────────────────────────────────

const AUTH_RE = /\b(auth|login|logout|register|signup|password|jwt|token|bearer|session|permission|role|guard|middleware|protect|authorize|authenticate)\b/i;
const DB_RE = /\b(create|update|delete|remove|save|insert|upsert|destroy|drop|truncate)\b/i;
const PAYMENT_RE = /\b(payment|stripe|paypal|checkout|charge|invoice|billing|subscription)\b/i;
const ERROR_HANDLING_RE = /\b(try|catch|throw|Error|reject|Promise\.reject|status\(4|status\(5)\b/;
const EDGE_CASE_RE = /\b(null|undefined|empty|zero|negative|invalid|missing|duplicate|overflow)\b/i;

function detectRecommendedTests(
  symbol: CodeSymbol,
  sourceContent: string,
  category: GapCategory,
): string[] {
  const name = symbol.name;
  const tests: string[] = [];

  switch (category) {
    case 'no_test':
      tests.push(`should execute ${name} successfully with valid input`);
      if (symbol.isAsync) tests.push(`should handle async rejection in ${name}`);
      if (symbol.paramCount > 0) tests.push(`should handle invalid parameters in ${name}`);
      if (AUTH_RE.test(sourceContent)) tests.push(`should reject unauthorized access in ${name}`);
      if (DB_RE.test(sourceContent)) tests.push(`should handle database errors in ${name}`);
      break;
    case 'missing_error_test':
      tests.push(`should return error when ${name} receives invalid input`);
      tests.push(`should handle exceptions thrown inside ${name}`);
      if (symbol.isAsync) tests.push(`should handle rejected promise in ${name}`);
      if (DB_RE.test(sourceContent)) tests.push(`should handle database failure in ${name}`);
      break;
    case 'missing_edge_case':
      tests.push(`should handle null/undefined input in ${name}`);
      tests.push(`should handle empty collection/string in ${name}`);
      tests.push(`should handle boundary values in ${name}`);
      break;
    case 'missing_auth_test':
      tests.push(`should reject unauthenticated request to ${name}`);
      tests.push(`should reject insufficient permissions in ${name}`);
      tests.push(`should prevent cross-user data access in ${name}`);
      break;
    case 'missing_integration_test':
      tests.push(`should integrate ${name} end-to-end with real dependencies`);
      tests.push(`should verify ${name} against the database`);
      break;
    case 'partial_test':
      tests.push(`should test failure path in ${name}`);
      tests.push(`should test edge cases in ${name}`);
      break;
  }

  return tests.slice(0, 4);
}

/**
 * Analyse symbols, routes, and test mappings to find testing gaps.
 * Returns concrete TestGap objects with evidence.
 */
export function findTestingGaps(
  symbols: CodeSymbol[],
  routes: RouteInfo[],
  mappings: TestMapping[],
  testProfile: TestProfile,
  sourceContents: Map<string, string>,
): TestGap[] {
  const gaps: TestGap[] = [];
  const mappingByFile = new Map<string, TestMapping>();
  for (const m of mappings) mappingByFile.set(m.sourceFile, m);

  // ── 1. Symbol-level gaps ──────────────────────────────────────────────────
  // Only check medium-importance and above to avoid noise
  const importantSymbols = symbols.filter(
    (s) => (s.importance === 'critical' || s.importance === 'high' || s.importance === 'medium') 
        && s.sourceType === 'production'
  );

  for (const sym of importantSymbols) {
    const mapping = mappingByFile.get(sym.filePath);
    const hasTests = mapping && mapping.coverageStatus === 'DIRECTLY_TESTED' || mapping?.coverageStatus === 'INDIRECTLY_TESTED';
    const isUnknown = mapping?.coverageStatus === 'NOT_ENOUGH_EVIDENCE';
    const content = sourceContents.get(sym.filePath) ?? '';

    // Determine gap category
    let category: GapCategory | null = null;
    let severity: GapSeverity = 'low';
    let reason = '';
    const evidence: string[] = [];

    if (!hasTests) {
      category = 'no_test';
      severity = sym.importance === 'critical' ? 'critical' : sym.importance === 'high' ? 'high' : 'medium';
      if (isUnknown) {
         severity = 'low'; // Downgrade severity if we just can't map it properly
         reason = `Testing evidence insufficient for ${sym.name} (tests exist but could not confidently link to this file).`;
      } else {
         reason = `${sym.name} has importance "${sym.importance}" (${sym.importanceReasons.join(', ')}) but no test file appears to cover ${sym.filePath}`;
      }
      evidence.push(`Symbol: ${sym.name} (${sym.kind}) at ${sym.filePath}:${sym.lineStart}`);
      evidence.push(`Importance signals: ${sym.importanceReasons.join(', ')}`);
      if (mapping) evidence.push(...mapping.evidence);
    } else if (hasTests && ERROR_HANDLING_RE.test(content)) {
      // Has tests but likely missing error coverage
      const suite = testProfile.suites.find((s) => mapping!.relatedTests.includes(s.filePath));
      const allTestText = suite ? [...suite.itBlocks, ...suite.describeBlocks].join(' ').toLowerCase() : '';
      const hasErrorTest = /error|fail|reject|throw|invalid|exception/.test(allTestText);
      if (!hasErrorTest) {
        category = 'missing_error_test';
        severity = sym.importance === 'critical' ? 'high' : 'medium';
        reason = `${sym.name} contains error handling logic but no error-path tests were detected`;
        evidence.push(`Error handling found in ${sym.filePath}`);
        if (suite) evidence.push(`Existing test descriptions do not mention error/fail/reject`);
      }
    }

    // Auth gap: has auth logic, no auth test
    if (
      AUTH_RE.test(content) &&
      AUTH_RE.test(sym.name + sym.importanceReasons.join(' '))
    ) {
      const suite = testProfile.suites.find((s) => mapping?.relatedTests.includes(s.filePath));
      const allTestText = suite ? [...suite.itBlocks, ...suite.describeBlocks].join(' ').toLowerCase() : '';
      const hasAuthTest = /auth|unauthorized|forbidden|permission|role/.test(allTestText);
      if (!hasAuthTest) {
        // Only add auth gap if we haven't already added a no_test gap for this symbol
        if (category === null) {
          category = 'missing_auth_test';
          severity = 'high';
          reason = `${sym.name} involves authentication/authorization but no auth-related tests detected`;
          evidence.push(`Auth pattern found in ${sym.filePath}:${sym.lineStart}`);
        }
      }
    }

    if (!category) continue;

    const recommendedTests = detectRecommendedTests(sym, content, category);

    gaps.push({
      id: uuidv4(),
      severity,
      confidence: hasTests ? 0.7 : 0.85,
      category,
      title: `${category === 'no_test' ? 'No test for' : 'Incomplete tests for'}: ${sym.name}`,
      description: `The ${sym.kind} \`${sym.name}\` in \`${sym.filePath}\` ${category === 'no_test' ? 'has no automated test coverage' : 'has tests but is missing important test scenarios'}.`,
      filePath: sym.filePath,
      symbolName: sym.name,
      lineStart: sym.lineStart,
      reason,
      evidence,
      existingTests: mapping?.relatedTests ?? [],
      recommendedTests,
    });
  }

  // ── 2. Route-level gaps (API routes with no test) ─────────────────────────
  for (const route of routes) {
    if (route.sourceType !== 'production') continue;

    const mapping = mappingByFile.get(route.filePath);
    const isUnknown = mapping?.coverageStatus === 'NOT_ENOUGH_EVIDENCE';
    const hasTests = mapping && mapping.coverageStatus === 'DIRECTLY_TESTED' || mapping?.coverageStatus === 'INDIRECTLY_TESTED';
    let covered = false;

    if (hasTests) {
      // Check if any test mentions this route path
      const routePath = route.path.toLowerCase().replace(/[/:]/g, ' ');
      covered = testProfile.suites.some((s) =>
        mapping.relatedTests.includes(s.filePath) &&
        [...s.itBlocks, ...s.describeBlocks].some((b) => {
          const norm = b.toLowerCase();
          return norm.includes(route.method.toLowerCase()) ||
            routePath.split(' ').filter(Boolean).some((seg) => norm.includes(seg));
        })
      );
      if (covered) continue;
    }

    // If it's an unknown framework/coverage state, we shouldn't penalize harshly
    if (isUnknown) {
      continue; // Skip creating a false positive route gap if we just don't understand the testing setup well enough
    }

    // Route has no test coverage
    const isAuthRoute = AUTH_RE.test(route.path + (route.handlerName ?? ''));
    gaps.push({
      id: uuidv4(),
      severity: isAuthRoute ? 'critical' : 'high',
      confidence: 0.9,
      category: 'no_test',
      title: `API route not tested: ${route.method} ${route.path}`,
      description: `The API route \`${route.method} ${route.path}\` defined in \`${route.filePath}\` has no detected test coverage.`,
      filePath: route.filePath,
      symbolName: route.handlerName,
      lineStart: route.line,
      reason: `Route ${route.method} ${route.path} is a public API endpoint${isAuthRoute ? ' with auth logic' : ''} — untested routes are a reliability risk`,
      evidence: [`Route defined at ${route.filePath}:${route.line}`],
      existingTests: [],
      recommendedTests: [
        `should return 200 for valid ${route.method} ${route.path}`,
        `should return 4xx for invalid input to ${route.method} ${route.path}`,
        isAuthRoute ? `should return 401 for unauthenticated ${route.method} ${route.path}` : `should handle edge cases in ${route.method} ${route.path}`,
      ],
    });
  }

  // Sort: critical first, then by confidence desc
  return gaps
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      const so = order[a.severity] - order[b.severity];
      return so !== 0 ? so : b.confidence - a.confidence;
    })
    .slice(0, 40); // cap to avoid overwhelming the UI
}

// ─── Test Generation ──────────────────────────────────────────────────────────

function frameworkImports(fw: TestFramework): string {
  switch (fw) {
    case 'vitest': return `import { describe, it, expect, vi } from 'vitest';`;
    case 'jest':   return `import { describe, it, expect, jest } from '@jest/globals';`;
    case 'mocha':  return `import { describe, it } from 'mocha';\nimport assert from 'assert';`;
    default:       return `import { describe, it, expect } from '@jest/globals';`;
  }
}

/**
 * Generate a test file skeleton for a given gap.
 * Does not overwrite existing tests.
 */
export function generateTestForGap(
  gap: TestGap,
  framework: TestFramework,
  repoPath: string,
): GeneratedTest {
  const targetFile = gap.filePath;
  const symbolName = gap.symbolName ?? 'subject';
  const importPath = targetFile
    .replace(/\.(ts|tsx|js|jsx)$/, '')
    .replace(/^src\//, '../src/');

  const testFileName = targetFile
    .replace(/\.(ts|tsx|js|jsx)$/, '.test.ts')
    .replace(/^src\//, 'src/__tests__/')
    .replace(/^(?!src\/)/, 'src/__tests__/');

  const imports = frameworkImports(framework);
  const ext = framework === 'mocha' ? '' : '';

  const cases = gap.recommendedTests.map((t) => {
    if (framework === 'mocha') {
      return `  it('${t}', () => {\n    // TODO: implement\n    assert.ok(true);\n  });`;
    }
    return `  it('${t}', () => {\n    // TODO: implement\n    expect(true).toBe(true);\n  });`;
  }).join('\n\n');

  const content = `${imports}
import { ${symbolName} } from '${importPath}';

describe('${symbolName}', () => {
${cases}
});
`;

  return {
    gapId: gap.id,
    filePath: testFileName,
    content,
    targetFile,
    targetSymbol: gap.symbolName,
    framework,
  };
}
