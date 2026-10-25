/**
 * Score real repositories with the full analysis pipeline and print a summary table.
 *
 *   npm run eval --prefix backend -- /path/to/repo-a /path/to/repo-b [--details]
 *
 * Paths are added to DOCTOR_DEV_ALLOWED_ROOTS for this process only.
 */
import path from 'node:path';
import { startAnalysis } from '../services/analysisService';
import { getAnalysis } from '../models/analysisStore';
import type { Analysis } from '../types';

async function waitFor(id: string): Promise<Analysis> {
  for (;;) {
    const a = getAnalysis(id);
    if (a && (a.status === 'complete' || a.status === 'error')) return a;
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const details = args.includes('--details');
  const repos = args.filter((a) => !a.startsWith('--')).map((p) => path.resolve(p));
  if (repos.length === 0) {
    process.stderr.write('usage: evalRepos <repo-path>... [--details]\n');
    process.exit(2);
  }
  process.env.DOCTOR_DEV_ALLOWED_ROOTS = [...new Set(repos.map((r) => path.dirname(r)))].join(',');

  const rows: string[][] = [['repo', 'grade', 'overall', 'testing', 'config', 'security', 'gaps', 'issues', 'tested files', 'secs']];
  for (const repo of repos) {
    const started = Date.now();
    const id = await startAnalysis(repo, { generateTests: false });
    const a = await waitFor(id);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (a.status === 'error' || !a.result) {
      rows.push([path.basename(repo), 'ERR', a.error ?? '', '', '', '', '', '', '', secs]);
      continue;
    }
    const r = a.result;
    const s = r.healthScore;
    const tested = r.testMappings.filter((m) => m.coverageStatus === 'DIRECTLY_TESTED' || m.coverageStatus === 'INDIRECTLY_TESTED').length;
    rows.push([
      path.basename(repo), s.grade, String(s.overall), String(s.testing), String(s.configuration), String(s.security),
      String(r.testGaps.length), String(r.configHealth.issues.length), `${tested}/${r.testMappings.length}`, secs,
    ]);
    if (details) {
      process.stdout.write(`\n── ${path.basename(repo)} ──\n`);
      for (const g of r.testGaps.slice(0, 8)) process.stdout.write(`  gap   [${g.severity}] ${g.title} (${g.filePath}) conf=${g.confidence}\n`);
      for (const i of r.configHealth.issues) process.stdout.write(`  issue [${i.severity}] ${i.title}\n`);
    }
  }

  const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => (row[c] ?? '').length)));
  process.stdout.write(`\n${rows.map((row) => row.map((cell, c) => cell.padEnd(widths[c])).join('  ')).join('\n')}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
