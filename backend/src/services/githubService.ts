import execa from 'execa';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { CLONE_DIR_PREFIX } from '../utils/security';

/** Matches GitHub HTTPS and SSH URLs, plus short `user/repo` forms. */
const GITHUB_HTTPS_RE = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;
const GITHUB_SSH_RE   = /^git@github\.com:([A-Za-z0-9-]+)\/([\w.-]+?)(?:\.git)?$/i;
const GITHUB_SHORT_RE = /^([A-Za-z0-9-]+)\/([\w.-]+?)(?:\.git)?$/;

/** Split a GitHub reference into owner and repository name. */
function parseGitHubRef(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(GITHUB_HTTPS_RE)
    ?? trimmed.match(GITHUB_SSH_RE)
    ?? trimmed.match(GITHUB_SHORT_RE);
  if (!match) return null;
  const [, owner, repo] = match;
  // "." and ".." are path segments, never repository names
  if (repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/**
 * Returns true if the input looks like a GitHub repository reference.
 */
export function isGitHubUrl(input: string): boolean {
  return parseGitHubRef(input) !== null;
}

/**
 * Normalize a GitHub reference to a full HTTPS clone URL.
 */
export function normalizeGitHubUrl(input: string): string {
  const ref = parseGitHubRef(input);
  if (!ref) throw new Error(`Not a GitHub repository reference: ${input}`);
  return `https://github.com/${ref.owner}/${ref.repo}.git`;
}

/**
 * Clone a GitHub repository to a temporary directory.
 * Returns the temp directory path.
 * The caller is responsible for calling cleanupClone() when done.
 */
export async function cloneGitHubRepo(repoUrl: string): Promise<string> {
  const ref = parseGitHubRef(repoUrl);
  if (!ref) throw new Error(`Not a GitHub repository reference: ${repoUrl}`);
  const normalUrl = normalizeGitHubUrl(repoUrl);

  // The double underscore lets repoName() recover "owner/repo" from the directory name.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${CLONE_DIR_PREFIX}${ref.owner}__${ref.repo}-`));

  try {
    await execa('git', ['clone', '--depth', '1', '--single-branch', '--no-tags', normalUrl, tmpDir], {
      timeout: 120_000,
      // Never block on an interactive credential prompt for private repositories.
      env: { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    });
  } catch (err: unknown) {
    // Clean up temp dir if clone failed
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr ?? '';
    if (stderr.includes('Repository not found') || stderr.includes('does not exist')) {
      throw new Error(`GitHub repository not found: ${normalUrl}`);
    }
    if (stderr.includes('Authentication failed') || stderr.includes('could not read Username')) {
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
      && path.basename(resolvedClone).startsWith(CLONE_DIR_PREFIX);
    if (isManagedClone) fs.rmSync(resolvedClone, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
