/** Returns true if the variable name looks like it holds a secret. */
export declare function isSecretName(name: string): boolean;
/** Redact a secret value — NEVER returns the real value. */
export declare function redactValue(_value: string): string;
/**
 * Resolve and sanitize a repository path.
 * Defends against:
 *   - path traversal (../)
 *   - symlink chains that escape the filesystem root
 *   - non-directory paths
 *   - non-existent paths
 *   - null/empty inputs
 */
export declare function resolveRepoPath(inputPath: string): string;
/** Return the directory name as the project name. */
export declare function repoName(repoPath: string): string;
/**
 * Read a file safely.
 * Returns null on any error — never throws.
 * Caps file size at 2 MB to avoid reading huge binary files.
 */
export declare function readFileSafe(filePath: string, maxBytes?: number): string | null;
/** Parse JSON safely — returns null on failure. */
export declare function parseJsonSafe<T = unknown>(content: string): T | null;
/** Check if a path exists. */
export declare function fileExists(filePath: string): boolean;
/** Normalise a file path to forward slashes for consistent output. */
export declare function normalizePath(p: string): string;
/** Return the relative path from repoRoot, with forward slashes. */
export declare function relativePath(repoRoot: string, absPath: string): string;
/**
 * Validate that a shell script value only uses safe npm/yarn/pnpm invocation patterns.
 * Used to prevent command injection in the test runner.
 */
export declare function isSafeTestScript(scriptValue: string): boolean;
