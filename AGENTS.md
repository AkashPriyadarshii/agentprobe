# AGENTS.md — Agent & Contributor Instructions for agentprobe

## Overview
agentprobe is an open-source diagnostic CLI, CI/CD action, and Node.js library for auditing web properties against autonomous AI agent readiness standards (the "Lighthouse for AI Agents").

## Project Architecture
- `src/cli.ts`: CLI entrypoint built on Commander.js supporting `--json`, `--plain`, `--summary`, and threshold checks.
- `src/index.ts`: Public API exporting audit runners, engines, and report formatters.
- `src/types/index.ts`: TypeScript contracts for audit checks, rule status, grade tiers, pillar results, and final audit reports.
- `src/core/runner.ts`: Orchestrates parallel audit engines across URLs or static distribution directories with duration benchmarking.
- `src/core/scorer.ts`: Deterministic 100-point scoring algorithm and academic grade assignments (`A+` to `F`).
- `src/engines/`: Five focused audit pillars:
  1. `crawler.ts`: Monitored access across 15 production AI bot User-Agents in `robots.txt`.
  2. `llmstxt.ts`: Standard `/llms.txt` and `/llms-full.txt` spec compliance and token budgeting.
  3. `semantic.ts`: HTML5 semantic landmarks, single-H1 hierarchy, and Schema.org JSON-LD.
  4. `actionability.ts`: Markdown content negotiation (`text/markdown`), accessible interactive elements, and SSR content presence.
  5. `protocols.ts`: Agentic Resource Discovery (`/.well-known/ai-catalog.json`), Model Context Protocol (`/.well-known/mcp.json`), skills index, and `x402` payment headers.
- `src/reporters/`: Formatters for terminal TUI (`terminal.ts`), AI-agent plain text (`plain.ts`), machine JSON (`json.ts`), and GitHub Step Summary markdown (`summary.ts`).
- `src/scaffolder/init.ts`: Scaffolds compliant `llms.txt` and permissive `robots.txt` manifests.

## Standards & Quality Gates
- **Engine Rules**: Keep scoring deterministic. All deductions must be accompanied by concrete `recommendation` strings so the CLI can format actionable fix guidance.
- **Dual Build**: Build targets both ESM (`dist/cli.js`, `dist/index.js`) and CJS (`dist/cli.cjs`, `dist/index.cjs`) using `tsup`. All source imports must include `.js` extensions for strict ESM resolution.
- **Verification Before Completion**:
  - Tests: `npm test` (Vitest unit tests covering all engines, scorers, and scaffolders).
  - Types: `npm run typecheck` (`tsc --noEmit`).
  - Build: `npm run build` (`tsup`).
- **No AI Slop**: Keep code comments minimal and focused on tricky logic. Zero generic fluff comments. Zero marketing prose or synthetic claims in documentation.

## Git & Release Conventions
- **Identity**: Commits must use `AkashPriyadarshii` and `272530059+AkashPriyadarshii@users.noreply.github.com`.
- **Commit Messages**: Follow Conventional Commits format (`feat:`, `fix:`, `docs:`, `chore:`).
- **Public Push Gate**: Do NOT push to remote repositories without explicit user instruction.
