import execa from 'execa';
import type { RepositoryProfile, TestRunResult, TestRunStatus } from '../types';
import { isSafeTestScript } from '../utils/security';

const SAFE_TEST_SCRIPT_KEYS = ['test', 'test:run', 'test:ci', 'test:unit'];
const MAX_DURATION_MS = 120_000; // 2 minutes hard cap

/** Pick the safest test script from the project's npm scripts. */
export function detectTestScript(profile: RepositoryProfile): string | null {
  for (const key of SAFE_TEST_SCRIPT_KEYS) {
    const cmd = profile.scripts[key];
    // Only allow known safe test runner invocations — never arbitrary shell
    if (cmd && isSafeTestScript(cmd)) {
      return key;
    }
  }
  return null;
}

/** Classify a test failure's root cause category. */
function classifyFailure(stdout: string, stderr: string): string {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  if (/cannot find module|module not found|no such file/.test(combined)) return 'configuration_issue';
  if (/permission denied|eacces/.test(combined)) return 'environment_issue';
  if (/typeerror|referenceerror|syntaxerror/.test(combined)) return 'possible_application_defect';
  if (/assertion failed|expect|assert/.test(combined)) return 'possible_test_defect';
  if (/timeout|timed out/.test(combined)) return 'possible_environment_issue';
  return 'unknown';
}

/** Parse failed test names from Jest/Vitest output. */
function parseFailures(stdout: string): Array<{ name: string; error: string }> {
  const failures: Array<{ name: string; error: string }> = [];
  // Jest/Vitest pattern: ● TestName › it description
  const re = /● (.+)\n\n([\s\S]+?)(?=\n● |\n\nTest Suites:|\n\nTests:|\nFailed|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stdout)) !== null) {
    failures.push({
      name: m[1].trim(),
      error: m[2].trim().slice(0, 500),
    });
  }
  return failures.slice(0, 20);
}

/**
 * Run the project's existing test suite.
 * Uses only the detected npm test script — never arbitrary shell commands.
 */
export async function runTests(
  repoPath: string,
  profile: RepositoryProfile,
): Promise<TestRunResult> {
  const scriptKey = detectTestScript(profile);

  if (!scriptKey) {
    return {
      status: 'error',
      command: '(none)',
      exitCode: -1,
      duration: 0,
      testsRun: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      stdout: '',
      stderr: 'No safe test script detected in package.json',
      failures: [],
    };
  }

  const pm = profile.packageManager === 'unknown' ? 'npm' : profile.packageManager;
  const command = `${pm} run ${scriptKey}`;
  const start = Date.now();

  try {
    const result = await execa(pm, ['run', scriptKey], {
      cwd: repoPath,
      timeout: MAX_DURATION_MS,
      reject: false, // don't throw on non-zero exit
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
    });

    const duration = Date.now() - start;
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.exitCode ?? 0;

    // Parse counts from output
    const passedMatch = stdout.match(/(\d+)\s+(?:test(?:s)?\s+)?pass(?:ed)?/i);
    const failedMatch = stdout.match(/(\d+)\s+(?:test(?:s)?\s+)?fail(?:ed)?/i);
    const skippedMatch = stdout.match(/(\d+)\s+(?:test(?:s)?\s+)?(?:skip(?:ped)?|pend(?:ing)?)/i);

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
    const testsRun = passed + failed + skipped;

    const status: TestRunStatus = exitCode === 0 ? 'passed' : 'failed';
    const failures = exitCode !== 0 ? parseFailures(stdout) : [];

    return {
      status,
      command,
      exitCode,
      duration,
      testsRun,
      passed,
      failed,
      skipped,
      stdout: stdout.slice(0, 8000),
      stderr: stderr.slice(0, 2000),
      failures: failures.map((f) => ({ name: f.name, error: f.error })),
    };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      command,
      exitCode: -1,
      duration,
      testsRun: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      stdout: '',
      stderr: msg,
      failures: [],
    };
  }
}
