import type { RepositoryProfile } from '../types';
/**
 * Scan a repository directory and return its profile.
 * Never modifies the repository — read-only.
 */
export declare function analyzeRepository(repoPath: string): Promise<RepositoryProfile>;
