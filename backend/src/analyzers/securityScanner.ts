import path from 'node:path';
import fg from 'fast-glob';
import { isSecretName, readFileSafe } from '../utils/security';
import { getSourceType } from './codeAnalyzer';
import { issue } from './issue';
import type { ConfigIssue, RepositoryProfile } from '../types';

// Secret values are never copied into findings: only the file, line, and kind of secret.

const KNOWN_SECRET_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { kind: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { kind: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'Stripe live key', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/ },
  { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'OpenAI/Anthropic API key', re: /\bsk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{32,}\b/ },
];
/** `password = "…"` style assignments of a literal. */
const ASSIGNED_SECRET_RE = /\b([A-Za-z_]*(?:password|passwd|secret|api_?key|apikey|access_?token|auth_?token|private_?key)[A-Za-z_]*)\b\s*[:=]\s*['"]([^'"\s]{8,})['"]/i;
const PLACEHOLDER_RE = /^(?:x+|\*+|\.+|<.*>|\$\{.*\}|%.*%|\{\{.*\}\})$|change.?(?:me|this|it)|replace.?me|example|your[_-]|placeholder|dummy|sample|redacted|test|fake|secret$|password$|^process\.env|(x{4,}|X{4,}|\*{4,}|0{8,}|1234)/i;

/** Literals that look generated (mixed letters and digits, no words) rather than names or messages. */
function looksLikeSecretValue(value: string): boolean {
  return value.length >= 12 && /[A-Za-z]/.test(value) && /\d/.test(value)
    && !/[_\s]/.test(value.replace(/^[A-Za-z0-9]+_/, '')) && !PLACEHOLDER_RE.test(value) && !/^https?:/.test(value);
}

const ENV_FILE_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/vendor/**'];
const TEMPLATE_ENV_RE = /\.env\.(?:example|sample|template|defaults|dist)$/i;

/** Commit-ready .env files: real values in version control. */
async function scanEnvFiles(repoPath: string): Promise<ConfigIssue[]> {
  const issues: ConfigIssue[] = [];
  const files = await fg(['**/.env', '**/.env.*'], { cwd: repoPath, dot: true, ignore: ENV_FILE_IGNORE, deep: 5, suppressErrors: true });
  for (const rel of files) {
    // Templates, and fixtures that tests load on purpose, are expected to be committed
    if (TEMPLATE_ENV_RE.test(rel) || /(^|\/)(tests?|__tests__|fixtures?|examples?|docs?|samples?)\//i.test(rel)) continue;
    const content = readFileSafe(path.join(repoPath, rel), 200_000);
    if (!content) continue;
    const keys = content.split('\n')
      .map((l) => l.trim().replace(/^export\s+/, ''))
      .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/))
      // Interpolated values (${POSTGRES_PASSWORD}) reference another variable rather than hold a secret
      .filter((m): m is RegExpMatchArray => m !== null && !/\$\{?[A-Za-z_]/.test(m[2])
        && !PLACEHOLDER_RE.test(m[2].replace(/^['"]|['"]$/g, '').trim()))
      .map((m) => m[1]);
    if (keys.length === 0) continue;
    const secretKeys = keys.filter(isSecretName);
    const testOnly = /\.env\.(?:test|ci|e2e)$/i.test(rel);
    issues.push(issue(
      secretKeys.length > 0 && !testOnly ? 'critical' : 'low',
      0.9, 'security',
      secretKeys.length > 0 ? `Secrets committed in ${rel}` : `Environment file committed: ${rel}`,
      `\`${rel}\` is in the repository with ${keys.length} value(s)${secretKeys.length > 0 ? `, including secret-looking keys ${secretKeys.slice(0, 5).join(', ')}` : ''}. Values are not shown.`,
      `Remove \`${rel}\` from version control, add it to .gitignore, and rotate any real credentials it contained. Commit a \`.env.example\` with placeholders instead.`,
      { filePath: rel, evidence: [`Keys with values: ${keys.slice(0, 8).join(', ')}`] },
    ));
  }
  return issues;
}

/** Hardcoded credentials in production source and configuration files. */
function scanSourceForSecrets(repoPath: string, files: string[]): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  for (const rel of files.slice(0, 3_000)) {
    const content = readFileSafe(path.join(repoPath, rel), 1_000_000);
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length && issues.length < 20; i++) {
      const line = lines[i];
      if (line.length > 2_000) continue; // minified
      const known = KNOWN_SECRET_PATTERNS.find((p) => {
        const hit = line.match(p.re)?.[0];
        return hit !== undefined && (p.kind === 'private key' || !PLACEHOLDER_RE.test(hit));
      });
      if (known) {
        issues.push(issue(
          'critical', 0.9, 'security',
          `Possible ${known.kind} hardcoded in ${rel}`,
          `Line ${i + 1} of \`${rel}\` contains text matching the format of a ${known.kind}. The value is not shown.`,
          'Move the credential to an environment variable or secrets manager and rotate it — it is already in version history.',
          { filePath: rel, line: i + 1, evidence: [`${rel}:${i + 1} matches the ${known.kind} format`] },
        ));
        continue;
      }
      const assigned = line.match(ASSIGNED_SECRET_RE);
      if (assigned && looksLikeSecretValue(assigned[2])) {
        issues.push(issue(
          'high', 0.55, 'security',
          `Possible hardcoded credential \`${assigned[1]}\` in ${rel}`,
          `Line ${i + 1} of \`${rel}\` assigns a literal string to \`${assigned[1]}\`. The value is not shown.`,
          `Read \`${assigned[1]}\` from configuration instead of hardcoding it.`,
          { filePath: rel, line: i + 1, evidence: [`${rel}:${i + 1}`], whyUncertain: 'The literal may be a non-secret default or a key name.' },
        ));
      }
    }
  }
  return issues;
}

/** Security checks: committed environment files and hardcoded credentials. */
export async function analyzeSecurity(repoPath: string, profile: RepositoryProfile): Promise<ConfigIssue[]> {
  const scanned = [
    ...profile.sourceFiles.filter((f) => getSourceType(f) === 'production'),
    ...profile.configFiles.filter((f) => !/readme|\.md$/i.test(f)),
  ];
  return [...await scanEnvFiles(repoPath), ...scanSourceForSecrets(repoPath, scanned)];
}
