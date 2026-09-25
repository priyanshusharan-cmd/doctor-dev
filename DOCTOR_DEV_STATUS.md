# Doctor Dev — Project Status

## Current Phase
**Phase 3/4/5 — Complete** ✅

---

## Phase History

### ✅ Phase 0 — Greenfield Initialization
- Root `package.json`, `AGENTS.md`, `.gitignore`
- Backend: Express + TypeScript
- Frontend: React + Vite + TypeScript + Tailwind

### ✅ Phase 1 — Product Shell & UI Foundation
- Full tabbed dashboard (Overview / Testing / Configuration / Validation / Report)
- All empty states, loading state, error state
- RepoSelector with path input + demo button
- Header with disabled-tab logic pre-result

### ✅ Phase 2 — Backend + Repository Analyzer
- `POST /api/analyze` → returns analysisId
- `GET /api/analysis/:id` → status + full result
- Repository file scanner (fast-glob, ignore dirs)
- Technology detection (language, framework, package manager, test frameworks)
- Security: path sanitization, path traversal rejection, secret redaction

### ✅ Phase 3/4/5 — TestPilot + ConfigDoctor + Unified Pipeline
### ✅ Phase 6 — Test Evidence Model & Language Adapters (Current)
- Replaced naive filename matching with Layered Evidence Model (Actual Coverage, Evidence Based, Unavailable)
- Refactored `CodeSymbol` and `RouteInfo` to track `SourceType` (production, tests, examples, fixtures)
- Updated gap detection to ignore non-production code and properly downgrade confidence when testing evidence is insufficient
- Overhauled Health Score algorithm to avoid heavily penalizing mature repositories due to heuristic blindspots
- Created `LanguageAdapter` architecture for extending support to Python, Java, Go, C++, Rust, C#, PHP (JS/TS & Python stubs implemented)
- Successfully benchmarked against Express and Fastify to ensure mature projects score realistically

**TestPilot Updates**
- Test file detection (Jest, Vitest, Mocha)
- Evidence-based test mapping using exact name, import trees, and heuristic paths
- Test gap detection: no_test, missing_error_test, missing_edge_case, missing_auth_test
- API route gap detection
- Evidence-based, confidence-scored gaps
- Test skeleton generation for critical/high gaps

**ConfigDoctor**
- Env var scanning (used vs documented)
- Port mention detection + conflict detection
- Docker analysis (npm ci, USER directive)
- CI/CD analysis (Node version, install step, test step)
- Documentation analysis (README completeness)
- Runtime analysis (test script presence)

**Unified pipeline**
- `scanning → analyzing_code → analyzing_tests → analyzing_config → prioritizing → complete`
- Priority findings derived from real findings
- Health score (0–100) based on actual gaps and issues
- Grade A–F, state: healthy / needs_attention / critical

**Frontend**
- All tabs wired to real backend data
- AnalysisProgress shows real pipeline steps
- TestGapCard: expandable with evidence, reason, recommended tests
- ConfigIssueCard: expandable with evidence, fix
- OverviewPage: priority findings + real stats
- TestingPage: coverage bar reflects `CoverageInfo` (Actual, Evidence Based, Unavailable)
- ConfigurationPage: issues, env var table, port list, config file strip
- ValidationPage: test run results + generated test code
- ReportPage: Markdown + JSON download

---

## Run Commands

```bash
# Install
npm install && npm install --prefix backend && npm install --prefix frontend

# Dev (both services)
npm run dev

# Build
npm run build

# Typecheck
npm run typecheck
```

**Backend:** http://localhost:3001
**Frontend:** http://localhost:5173
**Health:** http://localhost:3001/api/health

## Demo

```bash
# Analyze the included demo repository
curl -X POST http://localhost:3001/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repositoryPath":"/absolute/path/to/dev-guard/demo-repository","generateTests":true}'
```

Or use the **Try Demo Repository** button in the UI (set `DEMO_REPO_PATH` env).

---

## Known Issues
- Demo button in UI uses relative path `./demo-repository` which resolves from backend working dir
  → When running from `backend/`, use absolute path or set `DEMO_REPO_PATH`
- Test execution (`runTests: true`) requires the target repo to have its own `node_modules`

## Next Phase
**Phase 6 — Polish + Demo Hardening**
- Fix demo repository absolute path from UI
- Add GitHub Actions CI file to demo repo
- Add bob_sessions/ documentation
- Final end-to-end demo recording
