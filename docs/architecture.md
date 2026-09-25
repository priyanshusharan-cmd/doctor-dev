# Doctor Dev — Architecture

## System Overview

Doctor Dev is a two-service application:

- **Frontend** (React + Vite, port 5173) — developer dashboard
- **Backend** (Node.js + Express, port 3001) — analysis engine

The frontend is a pure client that polls the backend for analysis progress and results.
No WebSockets are used — a simple polling interval of 1.2 seconds is sufficient.

## Backend Architecture

### Directory Structure

```
backend/src/
├── server.ts              Express app entry point
├── types/
│   └── index.ts           Single source of truth for all types
├── routes/
│   └── analysisRoutes.ts  Route definitions (thin layer)
├── controllers/
│   └── analysisController.ts  HTTP handler logic
├── services/
│   ├── analysisService.ts     Pipeline orchestrator
│   └── prioritizationService.ts  Health score + priority findings
├── analyzers/
│   ├── repositoryAnalyzer.ts  File scanner + tech detection
│   ├── codeAnalyzer.ts        AST symbol + route extraction (ts-morph)
│   ├── configAnalyzer.ts      Test profile + env var analysis
│   ├── testPilot.ts           Test gap detection + generation
│   └── configDoctor.ts        Config issue detection
├── runners/
│   └── testRunner.ts          Controlled test execution (execa)
├── models/
│   └── analysisStore.ts       In-memory session store
└── utils/
    └── security.ts            Path sanitization, secret detection
```

### Analysis Pipeline

The pipeline runs in 6 stages:

1. **Scanning** — fast-glob discovers all source, test, and config files
2. **Analyzing code** — ts-morph extracts symbols and routes via AST
3. **Analyzing tests** — test files are parsed; test-to-source mappings built
4. **Analyzing config** — env vars, Docker, CI, and README are inspected
5. **Prioritizing** — gaps + issues are ranked; health score calculated
6. **Complete** — result stored in memory; frontend receives it on next poll

Each stage updates the `Analysis.status` field, which the frontend reads via polling.

### Security Constraints

| Constraint | Implementation |
|-----------|---------------|
| Path traversal prevention | `resolveRepoPath()` normalizes and validates all paths |
| Null byte rejection | Checked before path normalization |
| Secret value redaction | Values are never stored; only names are reported |
| Safe test execution | `isSafeTestScript()` validates before `execa()` |
| Read-only analysis | No file is written to the target repository |
| File size cap | Files > 2 MB are skipped |

## Frontend Architecture

### Directory Structure

```
frontend/src/
├── App.tsx            Root component — session state, polling, tab routing
├── api/
│   └── client.ts      Typed fetch-based REST client
├── components/        Reusable primitives
│   ├── Header.tsx
│   ├── RepoSelector.tsx
│   ├── AnalysisProgress.tsx
│   ├── HealthScoreCard.tsx
│   ├── RepoOverviewCard.tsx
│   ├── TestGapCard.tsx
│   └── ConfigIssueCard.tsx
├── pages/             Tab-level page components
│   ├── EmptyDashboard.tsx
│   ├── OverviewPage.tsx
│   ├── TestingPage.tsx
│   ├── ConfigurationPage.tsx
│   ├── ValidationPage.tsx
│   └── ReportPage.tsx
├── lib/
│   └── utils.ts       Severity colors, labels, formatters
└── types/
    └── index.ts       Frontend types (mirrors backend)
```

### State Management

No external state library. All state lives in `App.tsx`:

```typescript
const [status, setStatus] = useState<AnalysisStatus>('pending');
const [result, setResult] = useState<AnalysisResult | null>(null);
const [error, setError] = useState<string | null>(null);
```

Polling uses `setInterval` with a `useRef` for cleanup.

## API Contract

```
POST /api/analyze
  Body: { repositoryPath: string, runTests?: boolean, generateTests?: boolean }
  Response 202: { analysisId: string, status: "pending" }
  Response 400: { error: string, detail?: string }

GET /api/analysis/:id
  Response 200: Analysis object (with result when complete)
  Response 404: { error: "Analysis not found" }

GET /api/analyses
  Response 200: Analysis[] (status summaries, no results)

GET /api/health
  Response 200: { status: "ok", service: "doctor-dev", version: "...", timestamp: "..." }
```
