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

## Limitations

1. **Python / Java Support**: The `LanguageAdapter` structure is in place, but parsing Python/Java ASTs to detect routing frameworks and precise function signatures requires language-specific parsers (like Tree-Sitter or an external daemon) which are not yet fully implemented.
2. **Missing Coverage Parsers**: The `ACTUAL_COVERAGE` status successfully triggers if `lcov.info` is present, but we currently mock a high percentage rather than parsing the LCOV/JSON directly to get an exact number.
3. **Advanced Framework Mapping**: Frameworks like Fastify define routes differently than Express (`fastify.get(...)` vs `app.get(...)`). Our routing Regex may need expanding to capture all ecosystem nuances.
