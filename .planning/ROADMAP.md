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

## Next Milestone: v0.1.0 — Production Agentic Diagnostics & MCP
- [ ] **Phase 7: Engine Hardening & Gap Remediation**
  - WAF / Cloudflare Bot Fight Mode detection (`cf-mitigated`, `cf-ray`, 403 challenge pages)
  - HTTP `X-Robots-Tag` header and HTML `<meta name="robots">` parsing
  - Strict `Content-Type` validation on `/llms.txt` to reject SPA HTML 200 traps
  - Sample HEAD checks on the first 3–5 links inside `llms.txt`
  - DOM-to-Text Token Density calculation (flagging heavy client hydration bloat)
  - Locator hook checks (`data-testid`, IDs, ARIA labels on interactive elements)
- [ ] **Phase 8: Model Context Protocol (MCP) Server**
  - Native stdio MCP server mode (`agentprobe mcp`) via `@modelcontextprotocol/sdk`
  - Core tools: `audit_url` and `audit_local` for Claude Desktop, Claude Code, and Cursor
- [ ] **Phase 9: Streaming SSE & High-Performance Caching**
  - Real-time Server-Sent Events endpoint (`/api/audit?stream=true`)
  - Deterministic ETag generation and HTTP 304 Not Modified caching
  - Progressive streaming audit UI in web interface
- [ ] **Phase 10: Protocol Verification & Commerce**
  - Schema validation for `/.well-known/mcp.json` and `ai-catalog.json`
  - Permissive CORS verification (`Access-Control-Allow-Origin: *`) on discovery manifests
  - Active L402 / x402 lightning micropayment header negotiation
