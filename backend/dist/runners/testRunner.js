"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectTestScript = detectTestScript;
exports.runTests = runTests;
const execa_1 = __importDefault(require("execa"));
const security_1 = require("../utils/security");
const SAFE_TEST_SCRIPT_KEYS = ['test', 'test:run', 'test:ci', 'test:unit'];
const MAX_DURATION_MS = 120000; // 2 minutes hard cap
/** Pick the safest test script from the project's npm scripts. */
function detectTestScript(profile) {
    for (const key of SAFE_TEST_SCRIPT_KEYS) {
        const cmd = profile.scripts[key];
        // Only allow known safe test runner invocations — never arbitrary shell
        if (cmd && (0, security_1.isSafeTestScript)(cmd)) {
            return key;
        }
    }
    return null;
}
/** Classify a test failure's root cause category. */
function classifyFailure(stdout, stderr) {
    const combined = `${stdout}\n${stderr}`.toLowerCase();
    if (/cannot find module|module not found|no such file/.test(combined))
        return 'configuration_issue';
    if (/permission denied|eacces/.test(combined))
        return 'environment_issue';
    if (/typeerror|referenceerror|syntaxerror/.test(combined))
        return 'possible_application_defect';
    if (/assertion failed|expect|assert/.test(combined))
        return 'possible_test_defect';
    if (/timeout|timed out/.test(combined))
        return 'possible_environment_issue';
    return 'unknown';
}
/** Parse failed test names from Jest/Vitest output. */
function parseFailures(stdout) {
    const failures = [];
    // Jest/Vitest pattern: ● TestName › it description
    const re = /● (.+)\n\n([\s\S]+?)(?=\n● |\n\nTest Suites:|\n\nTests:|\nFailed|$)/g;
    let m;
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
async function runTests(repoPath, profile) {
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
        const result = await (0, execa_1.default)(pm, ['run', scriptKey], {
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
        const status = exitCode === 0 ? 'passed' : 'failed';
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
    }
    catch (err) {
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
//# sourceMappingURL=testRunner.js.map