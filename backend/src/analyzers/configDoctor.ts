import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fg from 'fast-glob';
import { readFileSafe, fileExists, isSecretName } from '../utils/security';
import type {
  RepositoryProfile,
  ConfigHealth,
  ConfigIssue,
  EnvVarInfo,
  PortMention,
  IssueSeverity,
  IssueCategory,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issue(
  severity: IssueSeverity,
  confidence: number,
  category: IssueCategory,
  title: string,
  description: string,
  recommendedFix: string,
  extras: Partial<ConfigIssue> = {},
): ConfigIssue {
  return {
    id: uuidv4(),
    severity,
    confidence,
    category,
    title,
    description,
    evidence: [],
    recommendedFix,
    ...extras,
  };
}

// ─── ENV var analysis ─────────────────────────────────────────────────────────

const ENV_USAGE_RE = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
const ENV_DEFINE_NAME_RE = /^([A-Z_][A-Z0-9_]*)(?:\s*=.*)?$/;

function parseEnvNames(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const m = ENV_DEFINE_NAME_RE.exec(l);
      return m ? m[1] : null;
    })
    .filter((n): n is string => n !== null);
}

export async function analyzeEnvVars(
  repoPath: string,
  sourceFiles: string[],
): Promise<{ envVars: EnvVarInfo[]; issues: ConfigIssue[] }> {
  const defined = new Map<string, Set<string>>();
  const used = new Map<string, Set<string>>();
  const defaults = new Set<string>();

  const envFiles = await fg(
    ['.env.example', '.env.sample', '.env.template', '.env.defaults'],
    { cwd: repoPath, absolute: false, dot: true }
  );

  for (const relPath of envFiles) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;
    for (const name of parseEnvNames(content)) {
      if (!defined.has(name)) defined.set(name, new Set());
      defined.get(name)!.add(relPath);
      const line = content.split('\n').find((l) => l.startsWith(`${name}=`));
      if (line && line.split('=').slice(1).join('=').trim()) defaults.add(name);
    }
  }

  for (const relPath of sourceFiles.slice(0, 300)) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;
    const re = new RegExp(ENV_USAGE_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (!used.has(name)) used.set(name, new Set());
      used.get(name)!.add(relPath);
      const after = content.slice(m.index + m[0].length, m.index + m[0].length + 25);
      if (/^\s*(?:\?\?|[|][|])/.test(after)) defaults.add(name);
    }
  }

  const allNames = new Set([...defined.keys(), ...used.keys()]);
  const envVars: EnvVarInfo[] = [];
  const issues: ConfigIssue[] = [];

  for (const name of allNames) {
    const def = Array.from(defined.get(name) ?? []);
    const usedIn = Array.from(used.get(name) ?? []);
    const secret = isSecretName(name);

    envVars.push({
      name,
      definedIn: def,
      usedIn,
      hasDefault: defaults.has(name),
      isSecret: secret,
    });

    // Issue: used but not documented
    if (usedIn.length > 0 && def.length === 0 && !defaults.has(name)) {
      issues.push(issue(
        secret ? 'high' : 'medium',
        0.85,
        'environment',
        `Undocumented environment variable: ${name}`,
        `\`${name}\` is referenced in source code but not defined in any .env.example or .env.template file.`,
        `Add \`${name}=${secret ? '<secret>' : '<value>'}\` to your .env.example file.`,
        { evidence: [`Used in: ${usedIn.slice(0, 3).join(', ')}`] },
      ));
    }
  }

  return { envVars: envVars.sort((a, b) => a.name.localeCompare(b.name)), issues };
}

// ─── Port analysis ────────────────────────────────────────────────────────────

const PORT_RE = /(?:port|PORT|listen|EXPOSE)\D{0,20}(\d{2,5})/gi;
const PORT_RANGE = { min: 80, max: 65535 };

export async function analyzePortsAndDocker(
  repoPath: string,
  profile: RepositoryProfile,
): Promise<{ portMentions: PortMention[]; issues: ConfigIssue[]; dockerfiles: string[] }> {
  const mentions: PortMention[] = [];
  const issues: ConfigIssue[] = [];
  const seen = new Set<string>();

  const filesToScan = [
    ...profile.sourceFiles,
    ...profile.configFiles,
  ].slice(0, 150);

  for (const relPath of filesToScan) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const re = new RegExp(PORT_RE.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const port = parseInt(m[1], 10);
        if (port < PORT_RANGE.min || port > PORT_RANGE.max) continue;
        const key = `${relPath}:${port}`;
        if (seen.has(key)) return;
        seen.add(key);
        mentions.push({ port, filePath: relPath, context: line.trim().slice(0, 80), line: idx + 1 });
      }
    });
  }

  // Detect port conflicts
  const portsByFile = new Map<number, string[]>();
  for (const m of mentions) {
    if (!portsByFile.has(m.port)) portsByFile.set(m.port, []);
    portsByFile.get(m.port)!.push(m.filePath);
  }

  // Multiple different ports across source/docker/readme = possible mismatch
  const allPorts = Array.from(portsByFile.keys());
  const appPorts = mentions.filter((m) => /\.(ts|js)$/.test(m.filePath)).map((m) => m.port);
  const dockerPorts = mentions.filter((m) => /dockerfile|docker-compose/i.test(m.filePath)).map((m) => m.port);

  const appPortSet = new Set(appPorts);
  const dockerPortSet = new Set(dockerPorts);
  const mismatchedPorts = Array.from(appPortSet).filter((p) => dockerPortSet.size > 0 && !dockerPortSet.has(p));

  if (mismatchedPorts.length > 0) {
    issues.push(issue(
      'medium', 0.75, 'ports',
      `Port mismatch between application and Docker`,
      `Application code uses port(s) ${[...appPortSet].join(', ')} but Docker configuration uses port(s) ${[...dockerPortSet].join(', ')}.`,
      `Align port configuration across application code, Docker, and environment variables.`,
      { evidence: mismatchedPorts.map((p) => `Port ${p} in app but not in Docker`) },
    ));
  }

  // Docker-specific checks
  const dockerfiles = profile.configFiles.filter((f) =>
    /dockerfile$/i.test(f) || /docker-compose\.(yml|yaml)$/.test(f)
  );

  for (const df of dockerfiles) {
    const content = readFileSafe(path.join(repoPath, df));
    if (!content) continue;

    // Strip comment lines so patterns don't match in comments
    const nonCommentLines = content.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    const nonCommentContent = nonCommentLines.join('\n');

    // Check: Dockerfile uses npm install instead of npm ci
    if (/dockerfile$/i.test(df)) {
      if (!nonCommentContent.includes('npm ci') && /npm\s+install/.test(nonCommentContent)) {
        issues.push(issue(
          'low', 0.7, 'docker',
          `Dockerfile uses \`npm install\` instead of \`npm ci\``,
          `In \`${df}\`, using \`npm install\` in production Docker images can produce non-deterministic builds. Prefer \`npm ci\`.`,
          `Replace \`npm install\` with \`npm ci\` in your Dockerfile.`,
          { filePath: df, evidence: ['RUN npm install found in Dockerfile'] },
        ));
      }

      // Check: EXPOSE port matches app port
      const exposeMatch = nonCommentContent.match(/^EXPOSE\s+(\d+)/m);
      if (exposeMatch) {
        const exposedPort = parseInt(exposeMatch[1], 10);
        const appPort = appPorts[0];
        if (appPort && exposedPort !== appPort) {
          issues.push(issue(
            'medium', 0.85, 'docker',
            `Dockerfile EXPOSE port (${exposedPort}) does not match application port (${appPort})`,
            `\`${df}\` exposes port ${exposedPort} but the application binds to port ${appPort}. This will cause the container to be unreachable.`,
            `Change \`EXPOSE ${exposedPort}\` to \`EXPOSE ${appPort}\` in your Dockerfile.`,
            { filePath: df, evidence: [`EXPOSE ${exposedPort} in Dockerfile, app uses ${appPort}`] },
          ));
        }
      }

      // Check: running as root (look for a USER directive on a non-comment line)
      const hasNonRootUser = /^USER\s+(?!root\b)\S/m.test(nonCommentContent);
      if (!hasNonRootUser) {
        issues.push(issue(
          'medium', 0.8, 'docker',
          `Docker container may run as root`,
          `No non-root USER directive found in \`${df}\`. Running containers as root is a security risk.`,
          `Add \`USER node\` (or another non-root user) before CMD/ENTRYPOINT in your Dockerfile.`,
          { filePath: df, evidence: ['No USER directive found in Dockerfile'] },
        ));
      }
    }

    // Check: docker-compose missing required env vars from .env.example
    if (/docker-compose\.(yml|yaml)$/i.test(df)) {
      const envExampleContent = readFileSafe(path.join(repoPath, '.env.example'))
        ?? readFileSafe(path.join(repoPath, '.env.sample'))
        ?? '';
      const requiredVars = parseEnvNames(envExampleContent);
      if (requiredVars.length > 0) {
        // Extract env var names defined in docker-compose environment blocks
        const composeEnvRe = /^\s{6,}([A-Z_][A-Z0-9_]*)[:=]/gm;
        const composeVars = new Set<string>();
        let ce: RegExpExecArray | null;
        while ((ce = composeEnvRe.exec(content)) !== null) {
          composeVars.add(ce[1]);
        }
        const missingInCompose = requiredVars.filter(
          (v) => !composeVars.has(v) && isSecretName(v),
        );
        if (missingInCompose.length > 0) {
          issues.push(issue(
            'high', 0.85, 'docker',
            `docker-compose is missing required secret environment variable(s)`,
            `\`${df}\` does not define: ${missingInCompose.join(', ')}. These are listed in \`.env.example\` as required secrets and the application will fail to start without them.`,
            `Add the missing variable(s) to the \`environment:\` block in \`${df}\`. Use Docker secrets or a secrets manager — never commit real values.`,
            { filePath: df, evidence: missingInCompose.map((v) => `${v} missing from docker-compose environment`) },
          ));
        }
      }
    }
  }

  return { portMentions: mentions, issues, dockerfiles };
}

// ─── CI analysis ──────────────────────────────────────────────────────────────

export async function analyzeCi(
  repoPath: string,
  profile: RepositoryProfile,
): Promise<{ issues: ConfigIssue[]; ciFiles: string[] }> {
  const issues: ConfigIssue[] = [];
  const ciFiles = profile.configFiles.filter((f) =>
    f.includes('.github/workflows') || f.endsWith('.gitlab-ci.yml') || f.includes('.circleci/')
  );

  let anyWorkflowRunsTests = false;
  const testScriptNames = Object.keys(profile.scripts).filter((k) => k === 'test' || k.startsWith('test'));

  for (const ciFile of ciFiles) {
    const content = readFileSafe(path.join(repoPath, ciFile));
    if (!content) continue;

    const ciNonCommentContent = content.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
    const hasTestInCi = /npm (run )?test|yarn test|pnpm test|vitest|jest|mocha/.test(ciNonCommentContent);
    const hasInstall = /npm (ci|install)|yarn install|pnpm install/.test(ciNonCommentContent);

    if (hasTestInCi) {
      anyWorkflowRunsTests = true;

      if (!hasInstall) {
        issues.push(issue(
          'high', 0.9, 'ci',
          `CI workflow may not install dependencies`,
          `\`${ciFile}\` runs tests but does not appear to run a dependency install command first.`,
          `Add \`run: npm ci\` (or equivalent) to your CI workflow before the test step.`,
          { filePath: ciFile, evidence: ['No npm/yarn/pnpm install found in workflow running tests'] },
        ));
      }

      const nodeVersionMatch = content.match(/node-version[:\s]+['"]?(\d+)/i);
      if (!nodeVersionMatch) {
        if (profile.nodeVersion) {
          issues.push(issue(
            'low', 0.7, 'ci',
            `CI workflow does not pin a Node.js version`,
            `\`${ciFile}\` runs tests but does not specify a Node.js version. Without pinning, CI may behave differently from local development.`,
            `Add \`node-version: '${profile.nodeVersion}'\` to your workflow's setup-node step.`,
            { filePath: ciFile },
          ));
        }
      } else if (profile.nodeVersion) {
        const ciNode = parseInt(nodeVersionMatch[1], 10);
        const requiredMatch = profile.nodeVersion.match(/(\d+)/);
        if (requiredMatch) {
          const requiredNode = parseInt(requiredMatch[1], 10);
          if (ciNode < requiredNode) {
            issues.push(issue(
              'high', 0.9, 'ci',
              `CI uses Node.js ${ciNode} but project requires Node.js ${requiredNode}+`,
              `\`${ciFile}\` uses \`node-version: '${ciNode}'\` but \`package.json\` engines field requires Node.js ${profile.nodeVersion}.`,
              `Update the CI workflow to use \`node-version: '${requiredNode}'\` (or higher).`,
              { filePath: ciFile, evidence: [`CI node-version: ${ciNode}, engines: ${profile.nodeVersion}`] },
            ));
          }
        }
      }
    }
  }

  if (!anyWorkflowRunsTests && testScriptNames.length > 0 && ciFiles.length > 0) {
    issues.push(issue(
      'high', 0.85, 'ci',
      `Tests are not run in CI`,
      `The project has a test script defined, but none of the CI workflows run it.`,
      `Add a step that runs \`npm test\` (or equivalent) in your main CI workflow.`,
      { evidence: [`Test script exists: ${testScriptNames.join(', ')}`] },
    ));
  }

  return { issues, ciFiles };
}

// ─── Documentation analysis ───────────────────────────────────────────────────

export function analyzeDocumentation(
  repoPath: string,
  profile: RepositoryProfile,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const readmeFile = profile.configFiles.find((f) => /readme\.md$/i.test(f));
  if (!readmeFile) {
    issues.push(issue(
      'low', 1.0, 'documentation',
      'No README.md found',
      'The repository does not have a README.md file. This makes it difficult for new contributors to understand the project.',
      'Create a README.md with setup instructions, run commands, and test commands.',
    ));
    return issues;
  }

  const content = readFileSafe(path.join(repoPath, readmeFile)) ?? '';
  const lower = content.toLowerCase();

  // Check if README mentions install
  if (!lower.includes('npm install') && !lower.includes('yarn install') && !lower.includes('pnpm install')) {
    issues.push(issue(
      'info', 0.8, 'documentation',
      'README does not document how to install dependencies',
      `\`${readmeFile}\` does not include dependency installation instructions.`,
      'Add installation instructions (e.g., `npm install`) to your README.',
      { filePath: readmeFile },
    ));
  }

  // Check if README mentions test command
  const hasTestScript = Object.keys(profile.scripts).some((k) => k === 'test');
  if (hasTestScript && !lower.includes('npm test') && !lower.includes('npm run test') && !lower.includes('yarn test')) {
    issues.push(issue(
      'info', 0.75, 'documentation',
      'README does not document how to run tests',
      `\`${readmeFile}\` does not mention the test command despite a test script being defined.`,
      'Add test instructions (e.g., `npm test`) to your README.',
      { filePath: readmeFile },
    ));
  }

  // Check: README mentions a port that doesn't match code
  const readmePorts = new Set<number>();
  const portRe = /(?:port|localhost)[:\s]+(\d{2,5})/gi;
  let m: RegExpExecArray | null;
  while ((m = portRe.exec(content)) !== null) {
    const p = parseInt(m[1], 10);
    if (p >= 80 && p <= 65535) readmePorts.add(p);
  }

  if (readmePorts.size > 0) {
    // Collect ports actually used in source files
    const appPorts = new Set<number>();
    const appPortRe = /(?:port|PORT|listen)\D{0,20}(\d{2,5})/gi;
    for (const relPath of profile.sourceFiles) {
      if (!/\.(ts|js)$/.test(relPath)) continue;
      const src = readFileSafe(path.join(repoPath, relPath));
      if (!src) continue;
      let am: RegExpExecArray | null;
      const re = new RegExp(appPortRe.source, 'gi');
      while ((am = re.exec(src)) !== null) {
        const p = parseInt(am[1], 10);
        if (p >= 80 && p <= 65535) appPorts.add(p);
      }
    }

    if (appPorts.size > 0) {
      const mismatchedReadmePorts = Array.from(readmePorts).filter((p) => !appPorts.has(p));
      if (mismatchedReadmePorts.length > 0) {
        issues.push(issue(
          'medium', 0.75, 'documentation',
          `README documents port(s) not used by the application`,
          `\`${readmeFile}\` mentions port(s) ${mismatchedReadmePorts.join(', ')} but application code uses port(s) ${[...appPorts].join(', ')}. This will mislead developers trying to connect to the service.`,
          `Update \`${readmeFile}\` to reference the correct port(s): ${[...appPorts].join(', ')}.`,
          { filePath: readmeFile, evidence: mismatchedReadmePorts.map((p) => `Port ${p} in README not found in source code`) },
        ));
      }
    }
  }

  return issues;
}

// ─── Runtime / package analysis ───────────────────────────────────────────────

export function analyzeRuntime(
  repoPath: string,
  profile: RepositoryProfile,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  // Missing test script
  if (!profile.scripts['test']) {
    issues.push(issue(
      'medium', 0.95, 'scripts',
      'No "test" script defined in package.json',
      'The project does not have a `test` script in package.json. Running `npm test` will fail.',
      'Add a `"test"` script to package.json (e.g., `"test": "jest"` or `"test": "vitest run"`).',
      { filePath: 'package.json' },
    ));
  }

  // Has test framework in devDeps but no test script
  const hasTestFrameworkDep = ['jest', 'vitest', 'mocha'].some(
    (fw) => profile.devDependencies[fw]
  );
  if (hasTestFrameworkDep && !profile.scripts['test']) {
    issues.push(issue(
      'medium', 0.9, 'scripts',
      'Test framework installed but no test script configured',
      'A test framework is listed in devDependencies but no `test` script is defined.',
      'Configure the test script in package.json to use the installed framework.',
      { filePath: 'package.json', evidence: ['Test framework in devDependencies but no test script'] },
    ));
  }

  // .env.example exists check
  const hasEnvExample = fileExists(path.join(repoPath, '.env.example')) ||
    fileExists(path.join(repoPath, '.env.sample'));

  const usesEnv = profile.sourceFiles.length > 0; // simplified check — full check is done in env analysis
  if (!hasEnvExample && usesEnv) {
    issues.push(issue(
      'low', 0.7, 'environment',
      'No .env.example file found',
      'The project does not have a .env.example file. New contributors will not know which environment variables are required.',
      'Create a .env.example file documenting all required environment variables (with placeholder values, not real secrets).',
    ));
  }

  return issues;
}

// ─── Full ConfigDoctor ────────────────────────────────────────────────────────

export async function runConfigDoctor(
  repoPath: string,
  profile: RepositoryProfile,
): Promise<ConfigHealth> {
  const allFiles = [...profile.sourceFiles, ...profile.configFiles];

  const [envResult, portResult, ciResult] = await Promise.all([
    analyzeEnvVars(repoPath, allFiles),
    analyzePortsAndDocker(repoPath, profile),
    analyzeCi(repoPath, profile),
  ]);

  const docIssues = analyzeDocumentation(repoPath, profile);
  const runtimeIssues = analyzeRuntime(repoPath, profile);

  const allIssues: ConfigIssue[] = [
    ...envResult.issues,
    ...portResult.issues,
    ...ciResult.issues,
    ...docIssues,
    ...runtimeIssues,
  ];

  // Sort: critical first
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const criticalCount = allIssues.filter((i) => i.severity === 'critical').length;
  const highCount = allIssues.filter((i) => i.severity === 'high').length;

  const summary = allIssues.length === 0
    ? 'No configuration issues detected.'
    : `Found ${allIssues.length} issue(s): ${criticalCount} critical, ${highCount} high.`;

  return {
    issues: allIssues,
    envVars: envResult.envVars,
    portMentions: portResult.portMentions,
    dockerfiles: portResult.dockerfiles,
    ciFiles: ciResult.ciFiles,
    hasEnvExample: fileExists(path.join(repoPath, '.env.example')) || fileExists(path.join(repoPath, '.env.sample')),
    hasDotenv: profile.devDependencies['dotenv'] !== undefined || profile.dependencies['dotenv'] !== undefined,
    summary,
  };
}
