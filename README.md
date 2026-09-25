# Doctor Dev

**Find what will break before your developers do.**

Doctor Dev is a developer-workflow validation platform that analyzes a real software repository and identifies two major classes of problems before they become expensive:

- **TestPilot** — important application behavior that is not adequately covered by automated tests
- **ConfigDoctor** — inconsistencies between application code, environment variables, Docker configuration, CI, and documentation

> Built for the **IBM Bob 2.0 Hackathon** using IBM Bob IDE as a core development tool.

---

## Problem

Developers ship code that breaks in ways they didn't anticipate — not because they aren't skilled, but because:

- Critical functions never had a test written for them
- An environment variable referenced in code isn't in `.env.example`
- The Docker port doesn't match what the app binds to
- CI runs on Node 16 but `engines` requires Node 18
- The README says port 5000 but the app uses 3000

These aren't bugs in application logic. They're gaps in **developer workflow hygiene** — and they're invisible until something breaks in production.

**Doctor Dev makes them visible.**

---

## Solution

Doctor Dev takes a repository path, runs a full multi-stage analysis pipeline, and produces a structured health report with:

- Exactly which functions are missing tests (and why it matters)
- Exactly which configuration files are inconsistent (with a recommended fix)
- A prioritized list of what to fix first
- Generated test skeletons for the most critical gaps
- A downloadable Markdown or JSON health report

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                          DOCTOR_DEV                           │
│                                                             │
│  ┌─────────────┐   REST API   ┌──────────────────────────┐ │
│  │  Frontend   │◄────────────►│       Backend            │ │
│  │             │              │                          │ │
│  │  React      │              │  Analysis Pipeline:      │ │
│  │  TypeScript │              │  1. Scan files           │ │
│  │  Vite       │              │  2. AST code analysis    │ │
│  │  Tailwind   │              │  3. Test mapping         │ │
│  └─────────────┘              │  4. Gap detection        │ │
│                               │  5. Config analysis      │ │
│                               │  6. Prioritization       │ │
│                               └──────────────────────────┘ │
│                                        │                    │
│                     ┌──────────────────┼──────────────────┐ │
│                     ▼                  ▼                   │ │
│              ┌─────────────┐   ┌─────────────────┐        │ │
│              │  TESTPILOT  │   │  CONFIGDOCTOR   │        │ │
│              │             │   │                 │        │ │
│              │ Find missing│   │ Find config     │        │ │
│              │ tests       │   │ problems        │        │ │
│              └─────────────┘   └─────────────────┘        │ │
│                     │                  │                   │ │
│                     └──────────────────┘                   │ │
│                              │                             │ │
│                    ┌─────────────────┐                     │ │
│                    │ Health Report   │                     │ │
│                    │ Priority Risks  │                     │ │
│                    │ Recommendations │                     │ │
│                    └─────────────────┘                     │ │
└─────────────────────────────────────────────────────────────┘
```

### Analysis Pipeline

```
Repository Path (local)
         │
         ▼
   Path Validation & Security Check
         │
         ▼
   File Scanner (fast-glob)
   - Source files (.ts, .tsx, .js, .jsx)
   - Test files (*.test.ts, *.spec.ts, etc.)
   - Config files (package.json, Dockerfile, CI, .env.example)
         │
         ▼
   Repository Profiler
   - Language detection (TypeScript / JavaScript / mixed)
   - Framework detection (Express, React, NestJS, etc.)
   - Package manager (npm / yarn / pnpm)
   - Test framework (Jest / Vitest / Mocha)
         │
         ▼
   AST Code Analyzer (ts-morph)
   - Extract functions, classes, methods
   - Score symbol importance
   - Detect API routes (router.get/post/put/delete)
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
   TestPilot                                ConfigDoctor
   - Map tests to source files              - Env var analysis
   - Detect uncovered critical code         - Port mismatch detection
   - Detect missing error tests             - Docker analysis
   - Detect missing auth tests              - CI/CD analysis
   - Generate test skeletons                - README analysis
         │                                         │
         └─────────────────────────────────────────┘
                           │
                           ▼
                  Priority Finder + Health Scorer
                  - Rank findings by impact
                  - Calculate health score (0–100)
                  - Assign grade (A–F)
                           │
                           ▼
                     Structured JSON Result
                  (stored in-memory per session)
```

---

## Features

### TestPilot & Language Support
- Supports analysis via **Language Adapters** for JavaScript/TypeScript, Python, Java, Go, Rust, C#, C++, and PHP.
- Employs a **Layered Evidence Model** distinguishing between Actual Coverage (parsed), Evidence-Based (heuristic mapping), and Unavailable.
- Classifies files as production, tests, examples, benchmarks, or fixtures to avoid penalizing sample code.
- Detects important functions with no test coverage using exact names, import trees, and path heuristics.
- Identifies missing error-path tests, edge-case tests, and auth tests for production code.
- Detects API routes that have no corresponding tests without forcing brittle string matching.
- Generates test skeleton files for the top critical/high gaps.
- Confidence-scored findings (each finding explains *why* it was flagged).

### ConfigDoctor
- Scans `process.env.NAME` usage vs `.env.example` declarations
- Detects undocumented environment variables
- Checks Dockerfile for `npm install` vs `npm ci`, root USER, EXPOSE port
- Checks `docker-compose.yml` for port alignment and missing env vars
- Inspects GitHub Actions workflows for Node version, install step, test step
- Analyzes README for missing install/test instructions and port mismatches
- **Never displays secret values — all sensitive data is flagged by name only**

### Dashboard
| Tab | Contents |
|-----|---------|
| Overview | Health score (0–100, grade A–F), priority findings, key metrics |
| Testing | Coverage bar, gap list with expandable evidence, route coverage, generated tests |
| Configuration | Issue list with recommended fixes, env var table, port mentions |
| Validation | Test run results and output, generated test code |
| Report | Full summary, Markdown + JSON download |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lucide React |
| Backend | Node.js, TypeScript, Express |
| AST Analysis | ts-morph |
| File Scanning | fast-glob |
| Test Execution | execa (safe subprocess) |
| Validation | zod |
| Development | IBM Bob IDE |

---

## Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd doctor-dev

# 2. Install all dependencies
npm install
npm install --prefix backend
npm install --prefix frontend

# 3. Configure the backend
cp backend/.env.example backend/.env
# Edit backend/.env if needed (PORT defaults to 3001)
```

---

## Usage

### Development

```bash
# Start both frontend and backend
npm run dev

# Backend only
npm run dev --prefix backend

# Frontend only
npm run dev --prefix frontend
```

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001
- **Health check:** http://localhost:3001/api/health

### Analyze a repository

**Via UI:**
1. Open http://localhost:5173
2. Enter an absolute path to any Node.js/TypeScript project
3. Click **Analyze Repository**

**Via API:**
```bash
curl -X POST http://localhost:3001/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repositoryPath": "/path/to/your/project", "generateTests": true}'
```

**Try the demo repository:**
```bash
curl -X POST http://localhost:3001/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repositoryPath": "demo-repository", "generateTests": true}'
```

Or click **Try Demo Repository** in the UI.

### Build for production

```bash
npm run build
```

---

## Demo

The `demo-repository/` directory contains a realistic Node.js/TypeScript rideshare API with:

**Deliberate testing gaps:**
- `cancelRide()` — missing in-progress cancellation tests, missing auth tests
- `calculateFare()` — missing edge cases (zero/negative distance)
- `isPeakHour()` — missing weekend and non-peak tests
- `processPayment()` — missing idempotency tests
- `GET /api/users/:id/ride-history` — missing authorization test (any user can access any user's data)

**Deliberate configuration issues:**
- Dockerfile `EXPOSE 8080` but app listens on port `3000`
- `docker-compose.yml` missing `JWT_SECRET` environment variable
- CI workflow uses Node 16, `package.json` requires Node ≥ 18
- CI workflow does not run tests
- README shows port `5000` but app uses port `3000`
- README documents `npm run test:unit` which doesn't exist in `scripts`

---

## Security

Doctor Dev is designed to be safe to run against repositories you don't fully control:

- **No secret exposure** — environment variable values are never stored or displayed. Only names are reported. Secret names (matching `API_KEY`, `JWT_SECRET`, `PASSWORD`, etc.) are flagged with `isSecret: true`.
- **No arbitrary command execution** — the test runner only executes scripts whose values match known safe patterns (`jest`, `vitest`, `mocha`, `npm run ...`). Repository scripts that contain shell operators, pipes, or arbitrary commands are rejected.
- **Path traversal prevention** — all repository paths are validated and normalized before use. Null bytes, `..` traversal, and symlink escapes are rejected.
- **Read-only analysis** — Doctor Dev never modifies the repository being analyzed.
- **File size cap** — files larger than 2 MB are skipped during analysis.

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/analyze` | Start a new analysis |
| `GET` | `/api/analysis/:id` | Get analysis status and result |
| `GET` | `/api/analyses` | List all analyses |

**POST /api/analyze request body:**
```json
{
  "repositoryPath": "/absolute/path/or/relative/from/project-root",
  "runTests": false,
  "generateTests": true
}
```

---

## Limitations

- **Language support:** TypeScript and JavaScript (Node.js) only. Python, Go, Java, etc. are not supported in this version.
- **Coverage estimation:** File/symbol-level heuristic only. Not instrumented code coverage — labeled as such in the UI.
- **Test mapping:** Based on filename proximity and import analysis. May miss some valid test-to-source relationships.
- **Remote repositories:** Only local paths are supported. Git cloning is not implemented.
- **Database persistence:** In-memory only. Analyses are lost on server restart.

---

## IBM Bob Usage

This project was developed using **IBM Bob IDE** as a core development tool throughout the entire development process:

- Project architecture planning
- Backend Express server and route scaffolding
- Analysis engine design (TestPilot, ConfigDoctor)
- AST analysis with ts-morph
- Security module review and hardening
- Frontend component development
- TypeScript type system design
- Bug investigation and debugging
- Documentation

See [`docs/bob-usage.md`](docs/bob-usage.md) for detailed session documentation.

---

## Project Structure

```
doctor-dev/
├── frontend/                   React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── api/                REST client
│       ├── components/         Reusable UI components
│       ├── pages/              Tab page components
│       ├── lib/                Utility functions
│       └── types/              TypeScript types
│
├── backend/                    Node.js + TypeScript + Express
│   └── src/
│       ├── analyzers/          Core analysis engines
│       │   ├── repositoryAnalyzer.ts   File scanning + tech detection
│       │   ├── codeAnalyzer.ts         AST symbol + route extraction
│       │   ├── configAnalyzer.ts       Test profile + env var analysis
│       │   ├── testPilot.ts            Test gap detection + generation
│       │   └── configDoctor.ts         Config issue detection
│       ├── runners/            Controlled test execution
│       ├── services/           Pipeline orchestration + prioritization
│       ├── controllers/        HTTP handler logic
│       ├── routes/             Express route definitions
│       ├── models/             In-memory session store
│       ├── types/              Shared TypeScript types
│       └── utils/security.ts   Path sanitization + secret detection
│
├── demo-repository/            Sample rideshare API (deliberate gaps)
├── docs/                       Architecture + Bob usage documentation
├── bob_sessions/               IBM Bob IDE session artifacts
├── AGENTS.md                   Project rules and conventions
├── DOCTOR_DEV_STATUS.md          Phase tracking
└── README.md                   ← this file
```

---

## License

MIT
