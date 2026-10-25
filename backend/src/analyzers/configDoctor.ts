import path from 'node:path';
import fs from 'node:fs';
import fg from 'fast-glob';
import { readFileSafe, fileExists, isSecretName } from '../utils/security';
import { categorizeEnvVar, stripComments } from './configAnalyzer';
import { getSourceType } from './codeAnalyzer';
import { analyzeCi } from './ciAnalyzer';
import { analyzeSecurity } from './securityScanner';
import { issue } from './issue';
import type {
  RepositoryProfile,
  ConfigHealth,
  ConfigIssue,
  EnvVarInfo,
  PortMention,
  RouteInfo,
} from '../types';

export { analyzeCi } from './ciAnalyzer';

// ─── Context ──────────────────────────────────────────────────────────────────

/** Frameworks whose presence in production dependencies means the repo deploys a server. */
const SERVER_DEPENDENCIES = ['express', 'fastify', 'koa', '@nestjs/core', 'next', 'nuxt', '@hapi/hapi', 'hapi', '@remix-run/node', '@sveltejs/kit', 'hono', 'restify'];
const PYTHON_SERVER_RE = /^\s*(?:flask|django|fastapi|starlette|aiohttp|tornado|sanic|uvicorn|gunicorn)\b/im;

/**
 * Whether the repository is a deployable service (rather than a library). Several checks —
 * `.env.example`, documented ports, undocumented variables — only make sense for services.
 */
export function detectService(repoPath: string, profile: RepositoryProfile, routes: RouteInfo[], portMentions: PortMention[]): boolean {
  if (profile.configFiles.some((f) => /(^|\/)dockerfile$/i.test(f))) return true;
  if (routes.some((r) => r.sourceType === 'production')) return true;
  if (SERVER_DEPENDENCIES.some((d) => profile.dependencies[d])) return true;
  const requirements = readFileSafe(path.join(repoPath, 'requirements.txt')) ?? '';
  if (PYTHON_SERVER_RE.test(requirements)) return true;
  return portMentions.some((m) => m.role !== 'docker_expose' && getSourceType(m.filePath) === 'production');
}

/** Lower-cased text of the repository's documentation (README, docs/, CONTRIBUTING, …). */
async function readDocs(repoPath: string): Promise<string> {
  const files = await fg(['*.{md,mdx,rst,txt}', 'docs/**/*.{md,mdx,rst}', 'doc/**/*.{md,mdx,rst}', '**/README*'], {
    cwd: repoPath, caseSensitiveMatch: false, ignore: ['**/node_modules/**', '**/.git/**', '**/CHANGELOG*', '**/HISTORY*'],
    deep: 4, suppressErrors: true,
  });
  let text = '';
  for (const rel of files.slice(0, 80)) {
    text += `\n${readFileSafe(path.join(repoPath, rel), 300_000) ?? ''}`;
    if (text.length > 3_000_000) break;
  }
  return text.toLowerCase();
}

/** README at the repository root, following symlinks (some repos link it into a package). */
function findReadme(repoPath: string): string | undefined {
  return ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README.rst', 'README.txt', 'README']
    .find((name) => fs.existsSync(path.join(repoPath, name)));
}

// ─── ENV var analysis ─────────────────────────────────────────────────────────

/** How application code reads environment variables (Node, Vite, and Python). */
const ENV_USAGE_PATTERNS: RegExp[] = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /process\.env\[\s*['"`]([A-Z_][A-Z0-9_]*)['"`]\s*\]/g,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  /os\.environ\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\]/g,
  /os\.(?:environ\.get|getenv)\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g,
];
/** Variables Vite always defines on import.meta.env. */
const VITE_BUILTIN_ENV = new Set(['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL']);
const ENV_DEFINE_NAME_RE = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)(?:\s*=.*)?$/;
const ENV_TEMPLATE_GLOBS = ['**/.env.example', '**/.env.sample', '**/.env.template', '**/.env.defaults'];
const ENV_GLOB_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'];
/** Files that set variables for the app at deploy time. */
const DEPLOY_CONFIG_GLOBS = ['**/docker-compose*.{yml,yaml}', '**/compose*.{yml,yaml}', '**/Dockerfile*', '.github/workflows/*.{yml,yaml}', '**/*.{tf,toml}', 'render.yaml', 'fly.toml', 'app.json', '**/k8s/**/*.{yml,yaml}', '**/helm/**/*.{yml,yaml}'];

function parseEnvNames(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim().replace(/^#\s*(?=[A-Z_][A-Z0-9_]*\s*=)/, ''))
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => ENV_DEFINE_NAME_RE.exec(l)?.[1] ?? null)
    .filter((n): n is string => n !== null);
}

export interface EnvAnalysisOptions {
  /** Libraries document configuration in prose, so missing templates matter less. */
  isService?: boolean;
  /** Lower-cased documentation text; a variable named there counts as documented. */
  docsText?: string;
}

/** Compare environment variables read by code with templates, docs, and deploy config. */
export async function analyzeEnvVars(
  repoPath: string,
  sourceFiles: string[],
  options: EnvAnalysisOptions = {},
): Promise<{ envVars: EnvVarInfo[]; issues: ConfigIssue[] }> {
  const isService = options.isService ?? true;
  const docsText = options.docsText ?? '';
  const defined = new Map<string, Set<string>>();
  const used = new Map<string, Set<string>>();
  const defaults = new Set<string>();

  // Templates may live next to each package in a monorepo (e.g. backend/.env.example).
  const envFiles = await fg(ENV_TEMPLATE_GLOBS, { cwd: repoPath, dot: true, ignore: ENV_GLOB_IGNORE, deep: 4, suppressErrors: true });
  for (const relPath of envFiles) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;
    for (const name of parseEnvNames(content)) {
      if (!defined.has(name)) defined.set(name, new Set());
      defined.get(name)!.add(relPath);
      const line = content.split('\n').map((l) => l.trim().replace(/^export\s+/, '')).find((l) => l.startsWith(`${name}=`));
      if (line && line.split('=').slice(1).join('=').trim()) defaults.add(name);
    }
  }

  for (const relPath of sourceFiles.slice(0, 1_000)) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;
    for (const pattern of ENV_USAGE_PATTERNS) {
      const re = new RegExp(pattern.source, 'g');
      const isVite = pattern.source.startsWith('import');
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const name = m[1];
        if (isVite && VITE_BUILTIN_ENV.has(name)) continue;
        if (!used.has(name)) used.set(name, new Set());
        used.get(name)!.add(relPath);
        const after = content.slice(m.index + m[0].length, m.index + m[0].length + 25);
        // JS: `?? fallback` / `|| fallback`; Python: getenv('X', fallback) / environ.get('X', fallback)
        if (/^\s*(?:\?\?|[|][|])/.test(after) || /^['"]\s*,/.test(after)) defaults.add(name);
      }
    }
  }

  // Deploy configuration that sets the variable also documents it.
  const deployFiles = await fg(DEPLOY_CONFIG_GLOBS, { cwd: repoPath, dot: true, ignore: ENV_GLOB_IGNORE, deep: 5, suppressErrors: true });
  const deployText = deployFiles.slice(0, 60).map((f) => readFileSafe(path.join(repoPath, f), 300_000) ?? '').join('\n');

  const envVars: EnvVarInfo[] = [];
  const issues: ConfigIssue[] = [];
  for (const name of new Set([...defined.keys(), ...used.keys()])) {
    const def = Array.from(defined.get(name) ?? []);
    const usedIn = Array.from(used.get(name) ?? []);
    const secret = isSecretName(name);
    const category = categorizeEnvVar(name);
    envVars.push({ name, category, definedIn: def, usedIn, hasDefault: defaults.has(name), isSecret: secret });

    // Only application, database, and service variables need documenting — OS, runtime,
    // CI, test, and tooling variables are provided by the environment.
    const isAppSpecific = category === 'APPLICATION' || category === 'DATABASE' || category === 'SERVICE';
    if (usedIn.length === 0 || def.length > 0 || defaults.has(name) || !isAppSpecific) continue;
    const nameRe = new RegExp(`\\b${name.toLowerCase()}\\b`);
    if (nameRe.test(docsText) || new RegExp(`\\b${name}\\b`).test(deployText)) continue;

    issues.push(issue(
      isService ? (secret ? 'high' : 'medium') : 'low',
      isService ? 0.85 : 0.6,
      'environment',
      `Undocumented application environment variable: ${name}`,
      `\`${name}\` is read by ${usedIn.slice(0, 2).join(', ')} but is not in any .env template, deploy configuration, or documentation.`,
      isService ? `Add \`${name}=${secret ? '<secret>' : '<value>'}\` to .env.example.` : `Document \`${name}\` in the README.`,
      {
        evidence: [`Used in: ${usedIn.slice(0, 3).join(', ')}`],
        whyDoctorDevBelievesThis: `Searched .env templates, docker/CI/deploy files, and ${docsText ? 'the documentation' : 'the README'} for "${name}".`,
      },
    ));
  }

  return { envVars: envVars.sort((a, b) => a.name.localeCompare(b.name)), issues };
}

// ─── Ports & Docker ───────────────────────────────────────────────────────────

const BACKLOG_SET = new Set([128, 256, 511, 512, 1024, 2048, 4096]);
const PORT_RANGE = { min: 80, max: 65535 };

/** Find listen/EXPOSE/PORT-fallback ports and check Docker and Compose files. */
export async function analyzePortsAndDocker(
  repoPath: string,
  profile: RepositoryProfile,
): Promise<{ portMentions: PortMention[]; issues: ConfigIssue[]; dockerfiles: string[] }> {
  const mentions: PortMention[] = [];
  const issues: ConfigIssue[] = [];
  const seen = new Set<string>();

  const filesToScan = [
    ...profile.sourceFiles.filter((f) => getSourceType(f) === 'production'),
    ...profile.configFiles,
  ].slice(0, 1_000);

  const record = (port: number, relPath: string, line: string, idx: number, role: PortMention['role']): void => {
    if (port < PORT_RANGE.min || port > PORT_RANGE.max) return;
    const key = `${relPath}:${port}`;
    if (seen.has(key)) return;
    seen.add(key);
    mentions.push({ port, filePath: relPath, context: line.trim().slice(0, 80), line: idx + 1, role, isServerListen: true });
  };

  for (const relPath of filesToScan) {
    const rawContent = readFileSafe(path.join(repoPath, relPath), 500_000);
    if (!rawContent) continue;
    const isDocker = /dockerfile|docker-compose/i.test(relPath);
    const content = isDocker ? rawContent : stripComments(rawContent);
    content.split('\n').forEach((line, idx) => {
      if (line.length > 1_000 || /\b(?:rfc|status|bytes|timeout|delay|backlog|sample|max)\b/i.test(line)) return;
      const exp = line.match(/^\s*EXPOSE\s+(\d{2,5})/i);
      if (exp) record(parseInt(exp[1], 10), relPath, line, idx, 'docker_expose');
      const lis = line.match(/\.listen\s*\(\s*(?:\{\s*port:\s*)?(\d{2,5})/i);
      if (lis && !BACKLOG_SET.has(parseInt(lis[1], 10))) record(parseInt(lis[1], 10), relPath, line, idx, 'server_listen');
      const envPort = line.match(/process\.env\.PORT\s*(?:\|\||\?\?)\s*['"`]?(\d{2,5})/i);
      if (envPort) record(parseInt(envPort[1], 10), relPath, line, idx, 'env_fallback');
    });
  }

  const appPorts = new Set(mentions.filter((m) => m.role === 'server_listen' || m.role === 'env_fallback').map((m) => m.port));
  const dockerfiles = profile.configFiles.filter((f) => /dockerfile$/i.test(f) || /docker-compose\.(yml|yaml)$/.test(f));

  for (const df of dockerfiles) {
    const content = readFileSafe(path.join(repoPath, df));
    if (!content) continue;
    const nonComment = content.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

    if (/dockerfile$/i.test(df)) {
      if (!nonComment.includes('npm ci') && /npm\s+install/.test(nonComment)) {
        issues.push(issue(
          'low', 0.7, 'docker',
          'Dockerfile uses `npm install` instead of `npm ci`',
          `\`npm install\` in \`${df}\` can resolve different versions than the lockfile. \`npm ci\` installs exactly what is locked.`,
          'Replace `npm install` with `npm ci` in the Dockerfile.',
          { filePath: df, evidence: ['RUN npm install found in Dockerfile'] },
        ));
      }
      const exposed = nonComment.match(/^EXPOSE\s+(\d+)/m);
      if (exposed && appPorts.size > 0 && !appPorts.has(parseInt(exposed[1], 10))) {
        const appPort = [...appPorts][0];
        issues.push(issue(
          'medium', 0.85, 'docker',
          `Dockerfile EXPOSE port (${exposed[1]}) does not match application port (${appPort})`,
          `\`${df}\` exposes port ${exposed[1]} but the application listens on ${[...appPorts].join(', ')}, so the container port mapping will not reach it.`,
          `Change \`EXPOSE ${exposed[1]}\` to \`EXPOSE ${appPort}\`.`,
          { filePath: df, evidence: [`EXPOSE ${exposed[1]} in Dockerfile, app uses ${[...appPorts].join(', ')}`], whyUncertain: 'PORT may be overridden at runtime.' },
        ));
      }
      // Multi-stage builds only need USER in the final stage; a FROM distroless/nonroot image is already non-root.
      const finalStage = nonComment.split(/^FROM\s/m).pop() ?? nonComment;
      const nonRoot = /^USER\s+(?!root\b|0\b)\S/m.test(finalStage) || /^\S*(distroless|nonroot|chainguard)\S*/im.test(finalStage);
      if (!nonRoot) {
        issues.push(issue(
          'medium', 0.7, 'security',
          'Docker container runs as root',
          `The final stage of \`${df}\` has no non-root USER, so a compromised process has root inside the container.`,
          'Add `USER node` (or another unprivileged user) before CMD/ENTRYPOINT.',
          { filePath: df, evidence: ['No non-root USER directive in the final stage'] },
        ));
      }
    }

    if (/docker-compose\.(yml|yaml)$/i.test(df)) {
      const template = readFileSafe(path.join(repoPath, '.env.example')) ?? readFileSafe(path.join(repoPath, '.env.sample')) ?? '';
      const requiredSecrets = parseEnvNames(template).filter(isSecretName);
      // `env_file:` passes every variable from the file through, so nothing is missing.
      if (requiredSecrets.length > 0 && !/^\s*env_file\s*:/m.test(content)) {
        const composeVars = new Set([...content.matchAll(/^\s+-?\s*([A-Z_][A-Z0-9_]*)\s*[:=]/gm)].map((m) => m[1]));
        const missing = requiredSecrets.filter((v) => !composeVars.has(v));
        if (missing.length > 0) {
          issues.push(issue(
            'high', 0.85, 'docker',
            'docker-compose is missing required secret environment variable(s)',
            `\`${df}\` does not set ${missing.join(', ')}, which \`.env.example\` lists as required, so the service will start without them.`,
            `Pass the variable(s) through the \`environment:\` block or an \`env_file:\` in \`${df}\` — never commit real values.`,
            { filePath: df, evidence: missing.map((v) => `${v} missing from docker-compose environment`) },
          ));
        }
      }
    }
  }

  return { portMentions: mentions, issues, dockerfiles };
}

// ─── Documentation ────────────────────────────────────────────────────────────

/** README presence, setup/test instructions, and (for services) documented ports. */
export function analyzeDocumentation(
  repoPath: string,
  profile: RepositoryProfile,
  context: { isService?: boolean; portMentions?: PortMention[] } = {},
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const readmeFile = findReadme(repoPath);
  if (!readmeFile) {
    issues.push(issue(
      'low', 1.0, 'documentation',
      'No README found',
      'The repository has no README at its root, so new contributors have nowhere to start.',
      'Add a README.md with setup, run, and test instructions.',
    ));
    return issues;
  }

  const content = readFileSafe(path.join(repoPath, readmeFile)) ?? '';
  const lower = content.toLowerCase();

  const installCommands = ['npm install', 'npm ci', 'npm i ', 'yarn', 'pnpm', 'bun install', 'bun add', 'pip install', 'poetry',
    'uv sync', 'uv add', 'go get', 'go install', 'go mod', 'cargo add', 'cargo build', 'cargo install', 'bundle install', 'gem install',
    'composer', 'mvn ', 'gradle', 'brew install', 'docker', 'install:all'];
  if (!installCommands.some((cmd) => lower.includes(cmd))) {
    issues.push(issue(
      'info', 0.8, 'documentation',
      'README does not document how to install dependencies',
      `\`${readmeFile}\` has no installation instructions.`,
      'Add installation instructions (e.g., `npm install`) to the README.',
      { filePath: readmeFile },
    ));
  }

  const testCommands = ['npm test', 'npm run test', 'npm t', 'yarn test', 'pnpm test', 'bun test', 'npx vitest', 'npx jest', 'pytest', 'tox', 'go test', 'cargo test', 'make test'];
  if (profile.scripts.test && !testCommands.some((cmd) => lower.includes(cmd)) && !fileExists(path.join(repoPath, 'CONTRIBUTING.md'))) {
    issues.push(issue(
      'info', 0.75, 'documentation',
      'README does not document how to run tests',
      `\`${readmeFile}\` does not mention the test command, and there is no CONTRIBUTING.md.`,
      'Add test instructions (e.g., `npm test`) to the README or a CONTRIBUTING.md.',
      { filePath: readmeFile },
    ));
  }

  // Ports only matter for services, and only as local URLs (not example ports of other systems).
  const appPorts = new Set((context.portMentions ?? []).map((m) => m.port));
  if (context.isService && appPorts.size > 0) {
    const documented = new Set([...content.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/gi)].map((m) => parseInt(m[1], 10)));
    const stale = [...documented].filter((p) => !appPorts.has(p));
    if (stale.length > 0 && ![...documented].some((p) => appPorts.has(p))) {
      issues.push(issue(
        'low', 0.7, 'documentation',
        'README points to a port the application does not use',
        `\`${readmeFile}\` links to localhost:${stale.join(', localhost:')}, but the application listens on ${[...appPorts].join(', ')}.`,
        `Update the README to use port ${[...appPorts][0]}.`,
        { filePath: readmeFile, evidence: stale.map((p) => `localhost:${p} in README`) },
      ));
    }
  }

  return issues;
}

// ─── Runtime / package scripts ────────────────────────────────────────────────

/** package.json test script and .env template checks. */
export function analyzeRuntime(
  repoPath: string,
  profile: RepositoryProfile,
  envVars: EnvVarInfo[] = [],
  context: { isService?: boolean; docsText?: string } = {},
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  // package.json scripts only make sense for Node projects
  if (fileExists(path.join(repoPath, 'package.json')) && !profile.scripts.test) {
    const installedFramework = ['jest', 'vitest', 'mocha', 'ava'].find((fw) => profile.devDependencies[fw]);
    if (profile.isMonorepo) {
      // Workspaces usually run tests per package
    } else if (installedFramework) {
      issues.push(issue(
        'medium', 0.9, 'scripts',
        'Test framework installed but no test script configured',
        `\`${installedFramework}\` is listed in devDependencies but no \`test\` script is defined, so \`npm test\` will fail.`,
        `Add \`"test": "${installedFramework === 'vitest' ? 'vitest run' : installedFramework}"\` to the scripts in package.json.`,
        { filePath: 'package.json', evidence: [`${installedFramework} in devDependencies but no test script`] },
      ));
    } else {
      issues.push(issue(
        profile.testFiles.length > 0 ? 'low' : 'medium', 0.9, 'scripts',
        'No "test" script defined in package.json',
        profile.testFiles.length > 0
          ? 'The project has test files, but `npm test` will not run them.'
          : 'The project has no `test` script, so `npm test` fails.',
        'Add a `"test"` script to package.json (e.g., `"test": "vitest run"`).',
        { filePath: 'package.json' },
      ));
    }
  }

  // .env templates only matter for services whose configuration is documented nowhere else
  const isService = context.isService ?? true;
  const hasTemplate = fileExists(path.join(repoPath, '.env.example')) || fileExists(path.join(repoPath, '.env.sample'))
    || envVars.some((v) => v.definedIn.length > 0);
  const undocumentedAppVars = envVars.filter((v) => v.usedIn.length > 0 && !v.hasDefault && v.definedIn.length === 0
    && (v.category === 'APPLICATION' || v.category === 'DATABASE' || v.category === 'SERVICE')
    && !(context.docsText ?? '').includes(v.name.toLowerCase()));
  if (isService && !hasTemplate && undocumentedAppVars.length > 0) {
    issues.push(issue(
      'low', 0.7, 'environment',
      'No .env.example file found',
      `The service reads ${undocumentedAppVars.length} configuration variable(s) (${undocumentedAppVars.slice(0, 3).map((v) => v.name).join(', ')}) with no template showing what to set.`,
      'Create a .env.example listing every required variable with placeholder values.',
    ));
  }

  return issues;
}

// ─── Full ConfigDoctor ────────────────────────────────────────────────────────

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

/** Run every configuration and security check. */
export async function runConfigDoctor(
  repoPath: string,
  profile: RepositoryProfile,
  routes: RouteInfo[] = [],
): Promise<ConfigHealth> {
  const [portResult, ciResult, securityIssues, docsText] = await Promise.all([
    analyzePortsAndDocker(repoPath, profile),
    analyzeCi(repoPath, profile),
    analyzeSecurity(repoPath, profile),
    readDocs(repoPath),
  ]);
  const isService = detectService(repoPath, profile, routes, portResult.portMentions);
  const envResult = await analyzeEnvVars(repoPath, [...profile.sourceFiles.filter((f) => getSourceType(f) === 'production'), ...profile.configFiles], { isService, docsText });

  const allIssues: ConfigIssue[] = [
    ...securityIssues,
    ...envResult.issues,
    ...portResult.issues,
    ...ciResult.issues,
    ...analyzeDocumentation(repoPath, profile, { isService, portMentions: portResult.portMentions }),
    ...analyzeRuntime(repoPath, profile, envResult.envVars, { isService, docsText }),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const criticalCount = allIssues.filter((i) => i.severity === 'critical').length;
  const highCount = allIssues.filter((i) => i.severity === 'high').length;

  return {
    issues: allIssues,
    envVars: envResult.envVars,
    portMentions: portResult.portMentions,
    dockerfiles: portResult.dockerfiles,
    ciFiles: ciResult.ciFiles,
    hasEnvExample: fileExists(path.join(repoPath, '.env.example')) || fileExists(path.join(repoPath, '.env.sample'))
      || envResult.envVars.some((v) => v.definedIn.length > 0),
    hasDotenv: profile.devDependencies.dotenv !== undefined || profile.dependencies.dotenv !== undefined,
    summary: allIssues.length === 0
      ? `No configuration issues detected (${isService ? 'service' : 'library'}).`
      : `Found ${allIssues.length} issue(s): ${criticalCount} critical, ${highCount} high (${isService ? 'service' : 'library'} checks).`,
  };
}
