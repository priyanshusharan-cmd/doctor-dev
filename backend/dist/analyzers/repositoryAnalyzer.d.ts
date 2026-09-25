import type { RepositoryProfile, Language } from '../types';
/** Detect primary ecosystem from root files and language presence */
export declare function detectPrimaryEcosystem(repoPath: string, language: Language): string;
/**
 * Scan a repository directory and return its profile.
 * Never modifies the repository — read-only.
 */
export declare function analyzeRepository(repoPath: string): Promise<RepositoryProfile>;
