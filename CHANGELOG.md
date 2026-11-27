# Changelog

All notable changes to `@akashpriyadarshii/agentprobe` are documented in this file.

## [0.1.0] - 2026-11-28

### Added
- **2026 Agentic Standards:** `Content-Signal` parsing (`robots.txt` and HTTP headers), WAF/bot-wall detection, `X-Robots-Tag` and `<meta name="robots">` checks, `llms.txt` `Content-Type` validation, soft-404 probe, HTML-to-text token density, WebMCP detection, A2A `agent-card.json`, ARD `ard.json` + RFC 9727 `api-catalog`, SEP-1649 `mcp.json` + RFC 9728, x402 v2 headers, and `L0`–`L5` maturity levels.
- **CI Reporters & Config:** `--format sarif|junit|agent|github`, `--output`, `--profile`, `--header`, `--baseline` / `--save-baseline`, `diff <base> <head>`, and `.agentproberc.json` / `agentprobe.config.json` support.
- **Web App & API:** Added `/api/badge` (edge-cached SVG and Shields.io JSON), Top Fixes panel, status filter pills, inline fix generators, Markdown/JSON/PDF exports, `Cmd+K` command palette, Compare mode, and Offline Draft validator.

### Fixed
- Fixed `--min-score 0` coercion to `80`, `--no-color` forwarding, deep-URL trailing-slash corruption, `auditLocalDirectory` without root `index.html`, and `action.yml` stdout + `GITHUB_STEP_SUMMARY` output.

## [0.0.2] - 2026-11-09

- Initial public release with 5-pillar scoring (`crawler`, `llmstxt`, `semantic`, `actionability`, `protocols`), CLI, GitHub Action, and `agentprobe init`.
