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

/** Pull a count such as "5 passed" out of a summary line. */
function countIn(line: string, words: RegExp): number {
  const m = line.match(new RegExp(`(\\d+)\\s+(?:tests?\\s+)?(?:${words.source})`, 'i'));
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Parse pass/fail/skip counts from Jest, Vitest, Mocha, and node:test output.
 * Jest and Vitest print a "Test Suites"/"Test Files" line before the "Tests" line,
 * so the per-test line is located first to avoid reporting suite counts.
 */
export function parseTestCounts(output: string): { passed: number; failed: number; skipped: number } {
  // node:test (TAP) — "# pass 5", "# fail 1", "# skipped 2"
  const tapPass = output.match(/^# pass (\d+)/m);
  if (tapPass) {
    const tapFail = output.match(/^# fail (\d+)/m);
    const tapSkip = output.match(/^# skipped (\d+)/m);
    return {
      passed: parseInt(tapPass[1], 10),
      failed: tapFail ? parseInt(tapFail[1], 10) : 0,
      skipped: tapSkip ? parseInt(tapSkip[1], 10) : 0,
    };
  }

  // Jest "Tests:  1 failed, 5 passed, 6 total" / Vitest " Tests  1 failed | 5 passed (6)"
  const testsLine = output.match(/^\s*Tests:?\s+(.*\d.*)$/m)?.[1];
  const summary = testsLine ?? output;
  return {
    passed: countIn(summary, /pass(?:ed|ing)?/),
    failed: countIn(summary, /fail(?:ed|ing)?/),
    skipped: countIn(summary, /skip(?:ped)?|pending|todo/),
  };
}

/** Parse failed test names from Jest/Vitest output. */
function parseFailures(output: string): Array<{ name: string; error: string }> {
  const failures: Array<{ name: string; error: string }> = [];
  // Jest/Vitest pattern: ● TestName › it description
  const re = /● (.+)\n\n([\s\S]+?)(?=\n● |\n\nTest Suites:|\n\nTests:|\nFailed|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    failures.push({
      name: m[1].trim(),
      error: m[2].trim().slice(0, 500),
    });
  }
  return failures.slice(0, 20);
}

/**
 * Environment for the child test process. The server's own environment (which can hold
 * deployment secrets) is deliberately not inherited by the repository's test code.
 */
function testEnvironment(): NodeJS.ProcessEnv {
  const passthrough = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'SystemRoot', 'APPDATA'];
  const env: NodeJS.ProcessEnv = { CI: 'true', FORCE_COLOR: '0', NODE_ENV: 'test' };
  for (const key of passthrough) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
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

  // Run the validated script command directly instead of `npm run <script>`, so that
  // package-manager lifecycle hooks such as "pretest" (which are never validated) do not run.
  const command = profile.scripts[scriptKey].trim();
  const [runner, ...args] = command.split(/\s+/);
  const start = Date.now();

  try {
    const result = await execa(runner, args, {
      cwd: repoPath,
      timeout: MAX_DURATION_MS,
      reject: false, // don't throw on non-zero exit
      preferLocal: true, // resolve jest/vitest/mocha from the repository's node_modules/.bin
      extendEnv: false,
      env: testEnvironment(),
    });

    const duration = Date.now() - start;
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.exitCode ?? 0;

    // Jest writes its summary and failures to stderr, so parse both streams.
    const combined = `${stdout}\n${stderr}`;
    const { passed, failed, skipped } = parseTestCounts(combined);
    const testsRun = passed + failed + skipped;

    const status: TestRunStatus = result.timedOut ? 'error' : exitCode === 0 ? 'passed' : 'failed';
    const failures = exitCode !== 0 ? parseFailures(combined) : [];

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
