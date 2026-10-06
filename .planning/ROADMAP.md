# Roadmap: agentprobe (v0.0.1)

## Phases
- [x] **Phase 1: Project Foundation & CLI Architecture**
  - Package structure, TypeScript, tsup, vitest config
  - Types & Contracts (`src/types/index.ts`)
  - CLI framework with commander, help, version, flag validation
- [x] **Phase 2: The 4 Core Audit Engines**
  - Crawler Engine (`robots.txt`, AI bot allowance)
  - LLMs.txt Engine (`/llms.txt`, syntax, token estimate)
  - Semantic Engine (JSON-LD Schema, HTML landmarks)
  - Actionability Engine (Markdown negotiation, accessible controls)
- [x] **Phase 3: Scorer, Diagnostics & Multi-format Reporters**
  - Weighted scoring calculator (0–100)
  - High-contrast ANSI terminal dashboard with progress bars
  - Machine-readable `--json` reporter & GitHub step summary
  - Dynamic README badge generator
- [x] **Phase 4: Scaffolder (init command) & Local Directory Auditing**
  - `agentprobe init` scaffolding compliant `llms.txt` and `robots.txt`
  - Static HTML directory auditor (`./dist`, `./build`)
- [x] **Phase 5: Automated Testing & Verification**
  - Engine unit tests with mock server fixtures (14 passing tests)
  - CLI E2E tests (exit codes, threshold gates)
  - Linting & typecheck verification (clean zero errors)
- [x] **Phase 6: FOSS Polish, GitHub Action, & README Standard**
  - Standard README with badges and quickstart
  - GitHub Action definition (`action.yml`)
  - MIT License
