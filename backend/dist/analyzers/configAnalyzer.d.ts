import type { TestProfile, EnvVarInfo, PortMention } from '../types';
/**
 * Analyse test files and build a TestProfile.
 */
export declare function analyzeTests(repoPath: string, testFiles: string[]): TestProfile;
/**
 * Scan all env var usage and declarations across the repository.
 * Values are never read or stored.
 */
export declare function analyzeEnvVars(repoPath: string, sourceFiles: string[]): Promise<EnvVarInfo[]>;
/**
 * Find all port number mentions across config and source files.
 */
export declare function analyzePortMentions(repoPath: string, filePaths: string[]): Promise<PortMention[]>;
