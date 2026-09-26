import path from 'path';
import fs from 'fs';
import os from 'os';

/** Patterns that indicate a secret variable name — matched case-insensitively */
const SECRET_PATTERNS = [
  /secret/i,
  /password/i,
  /passwd/i,
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /access[_-]?token/i,
  /private[_-]?key/i,
  /credential/i,
  /jwt[_-]?secret/i,
  /signing[_-]?key/i,
  /encryption[_-]?key/i,
  /database[_-]?url/i,
  /db[_-]?pass/i,
  /webhook[_-]?secret/i,
];

/** Returns true if the variable name looks like it holds a secret. */
export function isSecretName(name: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(name));
}

/** Redact a secret value — NEVER returns the real value. */
export function redactValue(_value: string): string {
  return 'REDACTED';
}

function isPathInside(child: string, parent: string): boolean {
  const c = path.normalize(child);
  let p = path.normalize(parent);
  if (c === p) return true;
  if (!p.endsWith(path.sep)) {
    p += path.sep;
  }
  return c.startsWith(p);
}

/**
 * Resolve and sanitize a repository path.
 * Defends against:
 *   - path traversal (../)
 *   - symlink chains that escape the filesystem root
 *   - non-directory paths
 *   - non-existent paths
 *   - null/empty inputs
 */
export function resolveRepoPath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string' || inputPath.trim().length === 0) {
    throw new Error('Repository path must be a non-empty string');
  }

  // Reject null bytes (common in path injection attacks)
  if (inputPath.includes('\0')) {
    throw new Error('Repository path contains invalid characters');
  }

  // Resolve relative to project root (parent of backend/), not process.cwd()
  const projectRoot = path.resolve(__dirname, '../../..');
  const resolved = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(projectRoot, inputPath);

  // Must exist
  if (!fs.existsSync(resolved)) {
    throw new Error(`Repository path does not exist: ${resolved}`);
  }

  let realPath: string;
  try {
    realPath = fs.realpathSync(resolved);
  } catch {
    throw new Error('Repository path could not be resolved');
  }

  // Must be a directory (not a file, device, pipe, etc.)
  const stat = fs.statSync(realPath);
  if (!stat.isDirectory()) {
    throw new Error(`Repository path must be a directory, got: ${realPath}`);
  }

  const allowedRootsEnv = process.env.DOCTOR_DEV_ALLOWED_ROOTS;
  const rawRoots = allowedRootsEnv
    ? allowedRootsEnv.split(',').map(r => path.resolve(r.trim()))
    : [projectRoot, path.resolve(os.tmpdir())];

  const allowedRoots = rawRoots.map(r => {
    try {
      return fs.realpathSync(r);
    } catch {
      return r;
    }
  });

  const isInside = allowedRoots.some(root => isPathInside(realPath, root));
  if (!isInside) {
    throw new Error('Repository path is outside the allowed analysis roots');
  }

  return realPath;
}

/** Return the directory name as the project name. */
export function repoName(repoPath: string): string {
  const base = path.basename(repoPath);
  // Match doctor-dev-{userName}-{repoName}-{randomString}
  const match = base.match(/^doctor-dev-(.+)-(.+)-[a-zA-Z0-9]+$/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return base;
}

/**
 * Read a file safely.
 * Returns null on any error — never throws.
 * Caps file size at 2 MB to avoid reading huge binary files.
 */
export function readFileSafe(filePath: string, maxBytes = 2_000_000): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Parse JSON safely — returns null on failure. */
export function parseJsonSafe<T = unknown>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** Check if a path exists. */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/** Normalise a file path to forward slashes for consistent output. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Return the relative path from repoRoot, with forward slashes. */
export function relativePath(repoRoot: string, absPath: string): string {
  return normalizePath(path.relative(repoRoot, absPath));
}

/**
 * Validate that a shell script value only uses safe npm/yarn/pnpm invocation patterns.
 * Used to prevent command injection in the test runner.
 */
export function isSafeTestScript(scriptValue: string): boolean {
  const command = scriptValue.trim();
  if (!command || /[;&|><`$\\\r\n]/.test(command)) return false;

  const tokens = command.split(/\s+/);
  const runner = tokens[0];
  if (/^(?:jest|vitest|mocha|ts-jest|tsx?)$/.test(runner)) return true;
  if (runner === 'node') return tokens[1] === '--test';

  if (runner === 'npx') {
    const packageName = tokens[1] === '--no-install' ? tokens[2] : tokens[1];
    return /^(?:jest|vitest|mocha|ts-jest)$/.test(packageName ?? '');
  }

  if (runner === 'nyc' || runner === 'c8') {
    return /^(?:jest|vitest|mocha)$/.test(tokens[1] ?? '')
      || (tokens[1] === 'node' && tokens[2] === '--test');
  }

  return false;
}
