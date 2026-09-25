import type { CodeSymbol, RouteInfo, TestProfile, TestMapping, TestGap, GeneratedTest, TestFramework } from '../types';
/**
 * Map source files to their related test files using:
 * - filename proximity (foo.ts → foo.test.ts)
 * - import analysis (tests that import the source file)
 * - folder mirroring (src/services/foo.ts → tests/services/foo.test.ts)
 */
export declare function buildTestMappings(sourceFiles: string[], testProfile: TestProfile): TestMapping[];
/**
 * Analyse symbols, routes, and test mappings to find testing gaps.
 * Returns concrete TestGap objects with evidence.
 */
export declare function findTestingGaps(symbols: CodeSymbol[], routes: RouteInfo[], mappings: TestMapping[], testProfile: TestProfile, sourceContents: Map<string, string>): TestGap[];
/**
 * Generate a test file skeleton for a given gap.
 * Does not overwrite existing tests.
 */
export declare function generateTestForGap(gap: TestGap, framework: TestFramework, repoPath: string): GeneratedTest;
