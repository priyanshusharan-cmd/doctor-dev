import execa from 'execa';
import path from 'path';
import fs from 'fs';
import os from 'os';

/** Matches GitHub HTTPS and SSH URLs, plus short `user/repo` forms. */
const GITHUB_HTTPS_RE = /^https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+(\.git)?$/i;
const GITHUB_SSH_RE   = /^git@github\.com:[\w.\-]+\/[\w.\-]+(\.git)?$/i;
const GITHUB_SHORT_RE = /^[a-zA-Z0-9\-]+\/[\w.\-]+$/;

/**
 * Returns true if the input looks like a GitHub repository reference.
 */
export function isGitHubUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    GITHUB_HTTPS_RE.test(trimmed) ||
    GITHUB_SSH_RE.test(trimmed) ||
    GITHUB_SHORT_RE.test(trimmed)
  );
}

/**
 * Normalize a GitHub reference to a full HTTPS clone URL.
 */
export function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim().replace(/\.git$/, '');
  if (GITHUB_SSH_RE.test(trimmed)) {
    // git@github.com:user/repo → https://github.com/user/repo
    const match = trimmed.match(/^git@github\.com:([\w.\-]+\/[\w.\-]+)$/);
    if (match) return `https://github.com/${match[1]}`;
  }
  if (GITHUB_SHORT_RE.test(trimmed) && !trimmed.startsWith('http')) {
    return `https://github.com/${trimmed}`;
  }
  return trimmed.endsWith('.git') ? trimmed : `${trimmed}.git`;
}

/**
 * Clone a GitHub repository to a temporary directory.
 * Returns the temp directory path.
 * The caller is responsible for calling cleanupClone() when done.
 */
export async function cloneGitHubRepo(repoUrl: string): Promise<string> {
  const normalUrl = normalizeGitHubUrl(repoUrl);
  const safeUrl = normalUrl.replace(/\.git$/, '');

  // Extract repo name for temp dir labeling
  const parts = safeUrl.split('/');
  const repoName = parts[parts.length - 1] ?? 'repo';
  const userName = parts[parts.length - 2] ?? 'unknown';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `doctor-dev-${userName}-${repoName}-`));

  try {
    await execa('git', ['clone', '--depth', '1', '--single-branch', normalUrl, tmpDir], {
      timeout: 120_000,
    });
  } catch (err: unknown) {
    // Clean up temp dir if clone failed
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr ?? '';
    if (stderr.includes('Repository not found') || stderr.includes('does not exist')) {
      throw new Error(`GitHub repository not found: ${normalUrl}`);
    }
    if (stderr.includes('Authentication failed')) {
      throw new Error(`GitHub repository is private or requires authentication: ${normalUrl}`);
    }
    throw new Error(`Failed to clone repository: ${msg}`);
  }

  return tmpDir;
}

/**
 * Remove a previously cloned temp directory.
 * Safe to call multiple times.
 */
export function cleanupClone(tmpDir: string): void {
  try {
    const resolvedTmp = path.resolve(os.tmpdir());
    const resolvedClone = path.resolve(tmpDir);
    const relative = path.relative(resolvedTmp, resolvedClone);
    const isManagedClone = relative.length > 0
      && !relative.startsWith('..')
      && !path.isAbsolute(relative)
      && path.basename(resolvedClone).startsWith('doctor-dev-');
    if (isManagedClone) fs.rmSync(resolvedClone, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
