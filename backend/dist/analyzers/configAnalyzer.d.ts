import type { TestProfile, EnvVarInfo, EnvVarCategory, PortMention } from '../types';
/** Real coverage report parsing for lcov.info, coverage-summary.json, and coverage-final.json */
export declare function detectCoverage(repoPath: string): {
    status: 'ACTUAL_COVERAGE' | 'UNAVAILABLE';
    percentage?: number;
    reason: string;
};
/**
 * Analyse test files and build a TestProfile.
 * Uses fast text scanning across all test files plus AST on a sample for import mapping.
 */
export declare function analyzeTests(repoPath: string, testFiles: string[]): TestProfile;
export declare function categorizeEnvVar(name: string): EnvVarCategory;
export declare function analyzeEnvVars(repoPath: string, sourceFiles: string[]): Promise<EnvVarInfo[]>;
/** Strip code comments so that numbers in comments don't create false port mentions */
export declare function stripComments(content: string): string;
/**
 * Find contextual port number mentions across config and source files.
 * Ignores RFC references, backlog values, benchmark counts, and comments.
 */
export declare function analyzePortMentions(repoPath: string, filePaths: string[]): Promise<PortMention[]>;
