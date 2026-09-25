import type { RepositoryProfile, TestRunResult } from '../types';
/** Pick the safest test script from the project's npm scripts. */
export declare function detectTestScript(profile: RepositoryProfile): string | null;
/**
 * Run the project's existing test suite.
 * Uses only the detected npm test script — never arbitrary shell commands.
 */
export declare function runTests(repoPath: string, profile: RepositoryProfile): Promise<TestRunResult>;
