# Doctor Dev Benchmarks

This document records the results of benchmarking the Doctor Dev repository health analyzer against several highly popular open-source repositories. The goal is to verify that mature projects receive realistic grades rather than being heavily penalized by naive heuristics.

## Methodology

- **Actual Coverage**: Looked for standard coverage report files. If found, a fixed high percentage was used (stub implementation).
- **Evidence-Based Coverage**: Used test imports, filename mappings, and overlapping path segments to determine if tests cover source files.
- **Source Classification**: Ensure sample code under `examples/` and test fixtures under `fixtures/` don't create false gaps.

## Benchmark Results

### Express (Node.js)
- **Repository**: `https://github.com/expressjs/express.git`
- **Initial Grade (Before Fix)**: F (Score: ~58). Testing score was 0.
- **Fixed Grade**: B (Score: 86)
- **Test Score**: 70 (Evidence-based)
- **Findings**: Fastify uses a heavily nested examples folder and dynamic routing that the previous system incorrectly interpreted as completely untested critical logic. With the new `SourceType` classifier, examples are safely ignored.

### Fastify (Node.js)
- **Repository**: `https://github.com/fastify/fastify.git`
- **Initial Grade (Before Fix)**: F (Score: ~40).
- **Fixed Grade**: C (Score: 74)
- **Test Score**: 47 (Evidence-based)
- **Findings**: Fastify has a complex plugin architecture with deep test directory trees. Our heuristics managed to link enough test suites to provide an evidence-based coverage score of 47. Because it's a massive codebase, some routes and files are still difficult to map purely via AST, which lowers the score from A/B. However, the score is no longer a naive 0.

### Axios (Node.js/Browser)
- **Repository**: `https://github.com/axios/axios.git`
- **Fixed Grade**: B (Score: ~81)
- **Findings**: Axios has a very structured `lib/` and `test/` tree, making it easy for the heuristic mapping to identify `INDIRECTLY_TESTED` coverage status.

### Node.js (Core Runtime / Monorepo)
- **Repository**: `https://github.com/nodejs/node.git`
- **Identified Issues**:
  - 18,670 test files were previously detected, but only 6 test cases were counted due to rigid `it/test` AST queries.
  - Secondary python scripts in `tools/` caused the repository to be misclassified as Poetry.
  - Standard OS/CI environment variables (`PATH`, `TERM`, `GITHUB_ACTIONS`, `P`, `S`) triggered dozens of false-positive "undocumented application env var" findings.
  - Networking and server backlog numbers (511) and RFC references (RFC 7230) triggered false-positive port drift findings.
- **Architectural Resolutions**:
  1. **Primary Ecosystem Priority**: Prioritizes `package.json` for Node.js projects, ensuring Node repositories are never misclassified as Poetry.
  2. **Test/Fixture Separation**: Separates runnable test files from test fixtures (`test/fixtures/**`), helpers (`test/common/**`), and benchmarks.
  3. **Multi-Pattern Test Discovery**: Counts standard runner assertions (`common.mustCall`, `assert`, `pytest`, `cargo test`, `go test`) in addition to `it/test` blocks.
  4. **Semantic Env Var Categorization**: Categorizes env vars into `APPLICATION`, `DATABASE`, `SERVICE`, `CI_CD`, `OS_SHELL`, `NODE_RUNTIME`, `TEST`, `BENCHMARK`, `TOOLING`. Filters out runtime, OS, and CI variables from undocumented app config warnings.
  5. **Contextual Port Detection**: Strips comments and filters backlog values (511, 128, 1024) and RFC references.
  6. **Calibrated Confidence**: Low-confidence AST mappings for mature repos with large suites are classified as unconfirmed/partial evidence, preventing false-positive 85% confidence gaps.

## Limitations & Future Extensions

1. **Additional Language ASTs**: Java, Go, Rust, and C# adapters can be expanded with Tree-sitter or external AST tools. Python adapter now supports function, class, route, and pytest discovery.
2. **Actual Coverage Parsers**: Real LCOV and `coverage-summary.json` parsers are now active.
3. **Advanced Framework Mapping**: Framework-specific routing models can be registered per framework.
