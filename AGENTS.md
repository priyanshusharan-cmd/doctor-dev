# Doctor Dev — Agent Rules & Project Conventions

## Project Overview

**Doctor Dev** is a developer-workflow validation platform that analyzes a real software
repository and identifies two major classes of problems before they become expensive:

1. **TestPilot** — important application behavior that is not adequately covered by automated tests.
2. **ConfigDoctor** — inconsistencies between application code, environment variables, package
   configuration, Docker, CI, documentation, ports, and runtime requirements.

**Tagline:** *Find what will break before your developers do.*

---

## Architecture

```
doctor-dev/
├── frontend/          React + TypeScript + Vite + Tailwind
├── backend/           Node.js + TypeScript + Express
├── demo-repository/   Sample repo used for hackathon demo
├── docs/              Architecture + analysis engine docs
├── bob_sessions/      IBM Bob IDE session screenshots/exports
├── AGENTS.md          ← this file
├── DOCTOR_DEV_STATUS.md Phase tracking
└── README.md
```

### Backend layers (backend/src/)
```
routes/       Express route definitions
controllers/  Route handler logic
services/     Orchestration (pipeline)
analyzers/
  repository/ Stack detection, metadata extraction
  testing/    Test-gap detection, coverage estimation
  config/     Env vars, Docker, CI, port, secret scanning
  runtime/    Node version, engine compatibility
runners/      Controlled test execution (execa-based)
models/       In-memory session store
types/        Shared TypeScript types (single source of truth)
utils/        Shared helpers
security/     Secret redaction, path sanitization
```

### Frontend layers (frontend/src/)
```
api/          Typed REST client (fetch-based)
components/   Reusable UI primitives
pages/        Route-level page components
layouts/      Shell/nav layouts
hooks/        Custom React hooks
lib/          Pure utility functions
types/        Frontend-local types (mirrors backend where needed)
```

---

## Core Workflow

```
Repository
  → Ingestion (clone or local path)
  → Repository Understanding (stack, metadata)
  → Test Health Analysis (TestPilot)
  → Configuration Health Analysis (ConfigDoctor)
  → Risk Prioritization + Health Score
  → Actionable Recommendations
  → Test Generation (optional)
  → Test Execution (optional)
  → Final Health Report
```

---

## Coding Conventions

### TypeScript
- `strict: true` always — no exceptions.
- No `any`. Use `unknown` and narrow. Use `zod` for runtime validation.
- Prefer explicit return types on all public functions.
- Prefer `type` over `interface` for data shapes; `interface` for extensible contracts.
- Name types in PascalCase; values in camelCase.
- Group imports: node built-ins → third-party → internal.

### General
- Keep files under 300 lines. Split if larger.
- One concern per file.
- Prefer pure functions. Avoid global mutable state (except the session store, which is intentional).
- No `console.log` in production paths — use structured log helpers.
- Every exported function must have a JSDoc comment for non-trivial logic.

### Express
- All route files only call controller functions — no logic in route files.
- Controllers are thin orchestrators — heavy logic lives in services/analyzers.
- Always return typed `ApiError` on failure: `{ error: string; detail?: string }`.
- Validate all request bodies with `zod` before processing.

### Frontend
- Components are functional only — no class components.
- Every async operation must have loading, success, error, and empty states.
- Never expose secret values in UI output, even if backend sends them (it must not).
- Use Tailwind utility classes directly — no custom CSS files unless strictly necessary.
- Prefer `lucide-react` for all icons.

---

## Security Rules

- **Never** expose raw secret values in Doctor Dev output, logs, reports, or UI.
- All env var values must be redacted: show key names only, not values.
- Secret detection must flag: `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE_KEY`,
  `CREDENTIAL`, `AUTH`, `ACCESS_KEY` in variable names (case-insensitive).
- Never execute arbitrary user-supplied shell commands.
- Use only detected project scripts (e.g. `npm test`, `yarn test`) for test execution.
- Sanitize all file paths: prevent directory traversal (`../`, absolute paths outside repo).
- Reject paths pointing outside the designated analysis working directory.

---

## Repository Analysis Principles

- Analyze real files — no hardcoded demo results in the main analysis pipeline.
- Demo/seed data lives **only** in `demo-repository/`.
- Analysis is read-only: Doctor Dev never modifies the target repository.
- AST-based analysis (ts-morph) is preferred over regex for structural queries.
- Regex is acceptable for config file scanning and pattern matching.
- All analysis results are structured JSON. Do not return unstructured text blobs.
- Coverage estimation is heuristic (file/symbol-level), not instrumented — label it as such.

---

## Testing Requirements

- Every analyzer must have at least one passing unit test.
- Backend route tests must cover success and error paths.
- Use `vitest` or `jest` for unit tests.
- Test files live adjacent to their source (`*.test.ts`).

---

## IBM Bob Development Rules

- IBM Bob IDE is used actively throughout the development of this project.
- All significant Bob sessions (code generation, analysis, refactoring) must be documented.
- Bob session artifacts (screenshots, exported session content) are stored in `bob_sessions/`.
- Document Bob's contribution in `docs/bob-usage.md`.
- Do not fabricate Bob usage. Only record real sessions.
- Bob is used as a senior pair-programmer: architecture decisions, implementation, review.

---

## What Doctor Dev Is NOT

- Not a generic AI chatbot.
- Not a code formatter or linter wrapper.
- Not a replacement for a real test runner — it uses the project's own test runner.
- Not a cloud deployment platform.
- Not a CI/CD system.

---

## Phase Gate Rule

> **Never move to the next phase until the current phase passes its acceptance criteria.**
> Keep the application runnable after every phase.
