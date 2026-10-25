import path from 'node:path';
import { readFileSafe } from '../utils/security';
import { issue } from './issue';
import type { ConfigIssue, RepositoryProfile } from '../types';

/** Commands that run a test suite directly. */
const TEST_COMMAND_RE = /\b(?:npm|pnpm|yarn|bun|nub)\s+(?:run\s+)?(?:test|t)\b|\bnpx\s+(?:vitest|jest|mocha|ava|playwright)\b|\b(?:vitest|jest|mocha|ava|borp|playwright\s+test|cypress\s+run|pytest|tox|nox|go\s+test|cargo\s+test|mvn\s+(?:-\S+\s+)*(?:test|verify)|gradle\w*\s+test|rspec|phpunit|deno\s+test|node\s+--test|make\s+(?:test|tests|check|ci|coverage))\b/;
/** Any package-manager install, whatever the tool. */
const INSTALL_RE = /\b(?:npm|pnpm|yarn|bun|nub|deno)\s+(?:ci|install|i)\b|^\s*-?\s*(?:run:\s*)?yarn\s*$|\bpip3?\s+install\b|\b(?:poetry|pdm|hatch|uv|rye)\s+(?:install|sync)\b|\bbundle\s+install\b|\bcomposer\s+install\b|\bgo\s+(?:mod\s+download|build)\b|\bcargo\s+(?:build|fetch)\b|bahmutov\/npm-install|run_install:\s*true/m;
/** Steps that delegate to another workflow, whose contents are not visible here. */
const DELEGATES_RE = /uses:\s*(?:\.\/\.github\/workflows\/|\S+\/\.github\/workflows\/)/;
const SCRIPT_RUNNER_RE = /\b(vitest|jest|mocha|ava|tap|borp|playwright|cypress|node\s+--test|tsx\s+--test|uvu|karma|pytest)\b/;

/** Package scripts that run tests: named like tests or invoking a test runner. */
function testScriptNames(scripts: Record<string, string>): string[] {
  return Object.entries(scripts)
    .filter(([name, cmd]) => /^(test|unit|spec|e2e|integration|coverage|check)(:|$)/i.test(name) || SCRIPT_RUNNER_RE.test(cmd))
    .map(([name]) => name);
}

/** True when the workflow runs tests, directly or through a test-like package script. */
export function workflowRunsTests(content: string, scripts: Record<string, string>): boolean {
  if (TEST_COMMAND_RE.test(content)) return true;
  for (const name of testScriptNames(scripts)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b(?:run|run-script)\\s+${escaped}(?![\\w:-])`).test(content)) return true;
    // Matrix-driven scripts: `pnpm run ${{ matrix.task }}` with `task: [test:nodejs, ...]`
    if (/run\s+\$\{\{\s*matrix\./.test(content) && new RegExp(`[\\[\\s,'"]${escaped}[\\]\\s,'"]`).test(content)) return true;
  }
  return false;
}

/** Major Node versions a workflow pins: scalars, matrix lists, `18.x`, `'20.11.0'`. */
export function pinnedNodeMajors(content: string): number[] {
  const majors: number[] = [];
  for (const m of content.matchAll(/node(?:-version|_version|js)?\s*:\s*(.+)/gi)) {
    for (const part of m[1].split(',')) {
      const v = part.match(/^\s*\[?\s*['"]?v?(\d{1,2})(?:\.|x|['"\]\s]|$)/);
      if (v) majors.push(parseInt(v[1], 10));
    }
  }
  return majors;
}

/**
 * CI checks across all workflow files together: a repository with a dedicated "legacy"
 * workflow for old Node versions, or tests delegated to a reusable workflow, is fine.
 */
export async function analyzeCi(
  repoPath: string,
  profile: RepositoryProfile,
): Promise<{ issues: ConfigIssue[]; ciFiles: string[] }> {
  const issues: ConfigIssue[] = [];
  const ciFiles = profile.configFiles.filter((f) =>
    f.includes('.github/workflows') || f.endsWith('.gitlab-ci.yml') || f.includes('.circleci/'));
  if (ciFiles.length === 0) return { issues, ciFiles };

  let anyRunsTests = false;
  let anyDelegates = false;
  const testedMajors: number[] = [];
  const noInstall: string[] = [];

  for (const ciFile of ciFiles) {
    const raw = readFileSafe(path.join(repoPath, ciFile));
    if (!raw) continue;
    const content = raw.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
    const delegates = DELEGATES_RE.test(content);
    anyDelegates ||= delegates;
    testedMajors.push(...pinnedNodeMajors(content));
    if (!workflowRunsTests(content, profile.scripts)) continue;
    anyRunsTests = true;
    const nodeTests = /\b(?:npm|pnpm|yarn|bun|nub)\b/.test(content);
    if (nodeTests && !INSTALL_RE.test(content) && !delegates) noInstall.push(ciFile);
  }

  const hasTests = profile.testFiles.length > 0 || testScriptNames(profile.scripts).length > 0;
  if (!anyRunsTests && hasTests && !anyDelegates) {
    issues.push(issue(
      'medium', 0.75, 'ci',
      'Tests are not run in CI',
      `The project has tests, but none of its ${ciFiles.length} CI workflow(s) appears to run them.`,
      'Add a step that runs the test suite (e.g. `npm test`) to the main CI workflow.',
      { evidence: [`CI files: ${ciFiles.slice(0, 4).join(', ')}`], whyUncertain: 'Tests may run in an external CI system this repository does not configure.' },
    ));
  }

  for (const ciFile of noInstall) {
    issues.push(issue(
      'medium', 0.6, 'ci',
      'CI workflow may not install dependencies',
      `\`${ciFile}\` runs tests but no dependency install step was found in it.`,
      'Add an install step (e.g. `npm ci`) before the test step.',
      { filePath: ciFile, whyUncertain: 'Dependencies may be restored from a cache or a custom setup action.' },
    ));
  }

  const required = profile.nodeVersion?.match(/(\d+)/)?.[1];
  if (required && testedMajors.length > 0) {
    const requiredMajor = parseInt(required, 10);
    const newest = Math.max(...testedMajors);
    if (newest < requiredMajor) {
      issues.push(issue(
        'high', 0.85, 'ci',
        `CI uses Node.js ${newest} at most, but the project requires Node.js ${requiredMajor}+`,
        `\`package.json\` engines requires Node.js ${profile.nodeVersion}, and no CI workflow runs on a supported version.`,
        `Run CI on Node.js ${requiredMajor} or newer.`,
        { evidence: [`CI Node versions: ${[...new Set(testedMajors)].sort((a, b) => a - b).join(', ')}`, `engines.node: ${profile.nodeVersion}`] },
      ));
    }
  }

  return { issues, ciFiles };
}
