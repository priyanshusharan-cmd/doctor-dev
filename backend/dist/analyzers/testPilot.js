"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTestMappings = buildTestMappings;
exports.findTestingGaps = findTestingGaps;
exports.generateTestForGap = generateTestForGap;
const uuid_1 = require("uuid");
// ─── Test Mapping ─────────────────────────────────────────────────────────────
/**
 * Map source files to their related test files using:
 * - filename proximity (foo.ts → foo.test.ts)
 * - import analysis (tests that import the source file)
 * - folder mirroring (src/services/foo.ts → tests/services/foo.test.ts)
 */
function buildTestMappings(sourceFiles, testProfile) {
    const mappings = [];
    for (const sf of sourceFiles) {
        const relatedTests = [];
        const evidence = [];
        let confidence = 0;
        const sfBase = sf.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\\/g, '/');
        const sfName = sfBase.split('/').pop() ?? '';
        for (const suite of testProfile.suites) {
            const suiteBase = suite.filePath.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\\/g, '/');
            // Direct name match: foo.ts ↔ foo.test.ts
            if (suiteBase.endsWith(`/${sfName}.test`) ||
                suiteBase.endsWith(`/${sfName}.spec`) ||
                suiteBase.endsWith(`/${sfName}`) ||
                suiteBase.endsWith(`_test`)) {
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
        let status = 'NOT_TESTED';
        if (unique.length > 0) {
            if (confidence >= 0.9)
                status = 'DIRECTLY_TESTED';
            else if (confidence >= 0.7)
                status = 'INDIRECTLY_TESTED';
            else
                status = 'PARTIALLY_TESTED';
        }
        else if (testProfile.totalTestFiles > 0) {
            const hasIntegrationSuites = testProfile.suites.some((s) => /(?:integration|e2e|system|parallel|sequential|acceptance)/i.test(s.filePath));
            if (hasIntegrationSuites) {
                status = 'INDIRECTLY_TESTED';
                confidence = 0.55;
                evidence.push('Repository has integration/system test suites that exercise application behavior indirectly.');
            }
            else {
                status = 'NOT_ENOUGH_EVIDENCE';
                confidence = 0.35;
                evidence.push('Tests exist in repository but no direct symbol or import mapping was identified.');
            }
        }
        // Actual coverage overrides
        if (testProfile.coverage.status === 'ACTUAL_COVERAGE' && unique.length === 0) {
            status = 'PARTIALLY_TESTED';
            confidence = 0.6;
            evidence.push(`Relying on repository actual coverage report (${testProfile.coverage.percentage ?? 80}%).`);
        }
        mappings.push({
            sourceFile: sf,
            relatedTests: unique,
            coverageStatus: status,
            confidence: unique.length > 0 ? confidence : (status === 'INDIRECTLY_TESTED' ? 0.55 : 0.35),
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
function detectRecommendedTests(symbol, sourceContent, category) {
    const name = symbol.name;
    const tests = [];
    switch (category) {
        case 'no_test':
            tests.push(`should execute ${name} successfully with valid input`);
            if (symbol.isAsync)
                tests.push(`should handle async rejection in ${name}`);
            if (symbol.paramCount > 0)
                tests.push(`should handle invalid parameters in ${name}`);
            if (AUTH_RE.test(sourceContent))
                tests.push(`should reject unauthorized access in ${name}`);
            if (DB_RE.test(sourceContent))
                tests.push(`should handle database errors in ${name}`);
            break;
        case 'missing_error_test':
            tests.push(`should return error when ${name} receives invalid input`);
            tests.push(`should handle exceptions thrown inside ${name}`);
            if (symbol.isAsync)
                tests.push(`should handle rejected promise in ${name}`);
            if (DB_RE.test(sourceContent))
                tests.push(`should handle database failure in ${name}`);
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
function findTestingGaps(symbols, routes, mappings, testProfile, sourceContents) {
    const gaps = [];
    const mappingByFile = new Map();
    for (const m of mappings)
        mappingByFile.set(m.sourceFile, m);
    // ── 1. Symbol-level gaps ──────────────────────────────────────────────────
    // Only check medium-importance and above to avoid noise
    const importantSymbols = symbols.filter((s) => (s.importance === 'critical' || s.importance === 'high' || s.importance === 'medium')
        && s.sourceType === 'production');
    for (const sym of importantSymbols) {
        const mapping = mappingByFile.get(sym.filePath);
        const hasDirectTests = mapping?.coverageStatus === 'DIRECTLY_TESTED';
        const hasIndirectTests = mapping?.coverageStatus === 'INDIRECTLY_TESTED';
        const isUnknown = mapping?.coverageStatus === 'NOT_ENOUGH_EVIDENCE';
        const isNotTested = mapping?.coverageStatus === 'NOT_TESTED';
        const content = sourceContents.get(sym.filePath) ?? '';
        // Determine gap category
        let category = null;
        let severity = 'low';
        let confidence = 0.5;
        let reason = '';
        let whyBelieves = '';
        let whyUncertain = undefined;
        const evidence = [];
        if (isNotTested && testProfile.totalTestFiles === 0) {
            category = 'no_test';
            severity = sym.importance === 'critical' ? 'critical' : sym.importance === 'high' ? 'high' : 'medium';
            confidence = 0.95;
            reason = `Repository has no automated test suite. ${sym.name} (${sym.importance}) is unverified.`;
            whyBelieves = `No test files or test runner configuration were found in the repository.`;
            evidence.push(`Symbol: ${sym.name} (${sym.kind}) at ${sym.filePath}:${sym.lineStart}`);
            evidence.push(`Importance signals: ${sym.importanceReasons.join(', ')}`);
        }
        else if (isNotTested) {
            category = 'no_test';
            severity = sym.importance === 'critical' ? 'high' : 'medium';
            confidence = 0.75;
            reason = `${sym.name} has importance "${sym.importance}" but no test file covers ${sym.filePath}.`;
            whyBelieves = `No direct test file, test imports, or directory matches link to ${sym.filePath}.`;
            whyUncertain = testProfile.totalTestFiles > 20
                ? `Repository has ${testProfile.totalTestFiles} test files; integration tests may exercise this indirectly.`
                : undefined;
            evidence.push(`Symbol: ${sym.name} (${sym.kind}) at ${sym.filePath}:${sym.lineStart}`);
            if (mapping)
                evidence.push(...mapping.evidence);
        }
        else if (isUnknown) {
            category = 'partial_test';
            severity = 'low';
            confidence = 0.35;
            reason = `Testing evidence is insufficient for ${sym.name}. Tests exist in the repository, but direct coverage could not be verified via static AST.`;
            whyBelieves = `No direct test file matching "${sym.filePath}" was found.`;
            whyUncertain = `Repository has ${testProfile.totalTestFiles} test files and ${testProfile.totalTestCount} test cases. This file may be covered via runtime or integration suites.`;
            evidence.push(`Symbol: ${sym.name} (${sym.kind}) at ${sym.filePath}:${sym.lineStart}`);
            if (mapping)
                evidence.push(...mapping.evidence);
        }
        else if (hasDirectTests && ERROR_HANDLING_RE.test(content)) {
            const suite = testProfile.suites.find((s) => mapping.relatedTests.includes(s.filePath));
            const allTestText = suite ? [...suite.itBlocks, ...suite.describeBlocks].join(' ').toLowerCase() : '';
            const hasErrorTest = /error|fail|reject|throw|invalid|exception/.test(allTestText);
            if (!hasErrorTest) {
                category = 'missing_error_test';
                severity = sym.importance === 'critical' ? 'high' : 'medium';
                confidence = 0.75;
                reason = `${sym.name} contains error handling logic but no error-path tests were detected in its suite`;
                whyBelieves = `Source file contains try/catch/throw/reject blocks, but test descriptions only cover happy paths.`;
                whyUncertain = `Test assertions may verify errors without mentioning them in describe/it titles.`;
                evidence.push(`Error handling detected in ${sym.filePath}`);
                if (suite)
                    evidence.push(`Existing test suite (${suite.filePath}) lacks error-path test cases.`);
            }
        }
        else if (hasIndirectTests) {
            continue;
        }
        // Auth gap
        if (AUTH_RE.test(content) &&
            AUTH_RE.test(sym.name + sym.importanceReasons.join(' '))) {
            const suite = testProfile.suites.find((s) => mapping?.relatedTests.includes(s.filePath));
            const allTestText = suite ? [...suite.itBlocks, ...suite.describeBlocks].join(' ').toLowerCase() : '';
            const hasAuthTest = /auth|unauthorized|forbidden|permission|role/.test(allTestText);
            if (!hasAuthTest && category === null) {
                category = 'missing_auth_test';
                severity = 'high';
                confidence = 0.8;
                reason = `${sym.name} involves authentication/authorization but no auth-related tests detected`;
                whyBelieves = `Function signature and body contain authentication keywords, but no security-focused test cases were found.`;
                whyUncertain = `Authorization middleware may be tested independently in a shared suite.`;
                evidence.push(`Auth pattern found in ${sym.filePath}:${sym.lineStart}`);
            }
        }
        if (!category)
            continue;
        const recommendedTests = detectRecommendedTests(sym, content, category);
        gaps.push({
            id: (0, uuid_1.v4)(),
            severity,
            confidence,
            category,
            title: `${category === 'no_test' ? 'No test for' : category === 'partial_test' ? 'Unconfirmed coverage for' : 'Incomplete tests for'}: ${sym.name}`,
            description: `The ${sym.kind} \`${sym.name}\` in \`${sym.filePath}\` ${category === 'no_test' ? 'has no automated test coverage' : category === 'partial_test' ? 'could not be linked to test files via static analysis' : 'has tests but is missing important test scenarios'}.`,
            filePath: sym.filePath,
            symbolName: sym.name,
            lineStart: sym.lineStart,
            reason,
            evidence,
            existingTests: mapping?.relatedTests ?? [],
            recommendedTests,
            whyDoctorDevBelievesThis: whyBelieves || reason,
            whyUncertain,
        });
    }
    // ── 2. Route-level gaps (API routes with no test) ─────────────────────────
    for (const route of routes) {
        if (route.sourceType !== 'production')
            continue;
        const mapping = mappingByFile.get(route.filePath);
        const isUnknown = mapping?.coverageStatus === 'NOT_ENOUGH_EVIDENCE';
        const hasTests = mapping && (mapping.coverageStatus === 'DIRECTLY_TESTED' || mapping.coverageStatus === 'INDIRECTLY_TESTED');
        let covered = false;
        if (hasTests) {
            const routePath = route.path.toLowerCase().replace(/[/:]/g, ' ');
            covered = testProfile.suites.some((s) => mapping.relatedTests.includes(s.filePath) &&
                [...s.itBlocks, ...s.describeBlocks].some((b) => {
                    const norm = b.toLowerCase();
                    return norm.includes(route.method.toLowerCase()) ||
                        routePath.split(' ').filter(Boolean).some((seg) => norm.includes(seg));
                }));
            if (covered)
                continue;
        }
        if (isUnknown) {
            continue;
        }
        const isAuthRoute = AUTH_RE.test(route.path + (route.handlerName ?? ''));
        gaps.push({
            id: (0, uuid_1.v4)(),
            severity: isAuthRoute ? 'critical' : 'high',
            confidence: 0.85,
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
            whyDoctorDevBelievesThis: `Found route registration in ${route.filePath}:${route.line}, but no test suite asserts this endpoint.`,
            whyUncertain: 'May be called indirectly during integration or system tests.',
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
function frameworkImports(fw) {
    switch (fw) {
        case 'vitest': return `import { describe, it, expect, vi } from 'vitest';`;
        case 'jest': return `import { describe, it, expect, jest } from '@jest/globals';`;
        case 'mocha': return `import { describe, it } from 'mocha';\nimport assert from 'assert';`;
        default: return `import { describe, it, expect } from '@jest/globals';`;
    }
}
/**
 * Generate a test file skeleton for a given gap.
 * Does not overwrite existing tests.
 */
function generateTestForGap(gap, framework, repoPath) {
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
//# sourceMappingURL=testPilot.js.map