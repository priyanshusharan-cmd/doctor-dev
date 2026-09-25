import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

/** Matches GitHub HTTPS and SSH URLs, plus short `user/repo` forms. */
const GITHUB_HTTPS_RE = /^https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+(\.git)?$/i;
const GITHUB_SSH_RE   = /^git@github\.com:[\w.\-]+\/[\w.\-]+(\.git)?$/i;
const GITHUB_SHORT_RE = /^[\w.\-]+\/[\w.\-]+$/;

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
export function cloneGitHubRepo(repoUrl: string): string {
  const normalUrl = normalizeGitHubUrl(repoUrl);
  const safeUrl = normalUrl.replace(/\.git$/, '');

  // Extract repo name for temp dir labeling
  const parts = safeUrl.split('/');
  const repoName = parts[parts.length - 1] ?? 'repo';
  const userName = parts[parts.length - 2] ?? 'unknown';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `doctor-dev-${userName}-${repoName}-`));

  console.log(`[doctor-dev] Cloning ${normalUrl} → ${tmpDir}`);

  try {
    execSync(
      `git clone --depth 1 --single-branch "${normalUrl}" "${tmpDir}"`,
      {
        stdio: 'pipe',
        timeout: 120_000, // 2 minutes max
        encoding: 'utf-8',
      },
    );
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
    if (tmpDir.includes(os.tmpdir()) && tmpDir.includes('doctor-dev-')) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log(`[doctor-dev] Cleaned up clone: ${tmpDir}`);
    }
  } catch {
    // Best-effort cleanup
  }
}
