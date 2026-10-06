# SPEC: agentprobe (v0.0.1)

## Overview
`agentprobe` is an open-source CLI auditor and CI gate for Agentic Web Readiness.
It inspects websites (live URLs, local dev servers, or static export directories) to evaluate whether autonomous AI agents (such as ChatGPT, Claude, Perplexity, or custom browsing agents) can crawl, read, navigate, and take actions on the site without getting blocked or wasting excessive tokens.

## Target Audience
Web developers, devops engineers, technical founders, and open-source maintainers who want their documentation, apps, and web properties to be discoverable and actionable by AI agents.

## Core Pillars
1. **Crawler Access (25 pts)**: robots.txt AI rules, bot blocking, sitemap presence.
2. **LLM Manifest (25 pts)**: /llms.txt and /llms-full.txt compliance and token budgeting.
3. **Structured Context (25 pts)**: HTML5 landmarks, Schema.org JSON-LD extraction and validation.
4. **Actionability & Negotiation (25 pts)**: Markdown content negotiation (`Accept: text/markdown`), accessible interactive elements.

## Commands & UX
- `agentprobe <target>`: Audits URL or local directory, outputs terminal UI with score & recommendations.
- `agentprobe init`: Scaffolds compliant `llms.txt` and AI-friendly `robots.txt`.
- Flags: `--json`, `--min-score <n>`, `--fix`, `--no-color`, `--quiet`, `-v`, `-h`.
- Exit codes: 0 (pass), 1 (score below threshold), 2 (error).
