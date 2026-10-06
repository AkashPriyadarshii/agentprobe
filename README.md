# agentprobe 🤖 — The open-source Lighthouse for AI Agents

[![CI](https://img.shields.io/github/actions/workflow/status/AkashPriyadarshii/agentprobe/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/AkashPriyadarshii/agentprobe/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agentprobe?style=flat-square)](https://www.npmjs.com/package/agentprobe)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/github/license/AkashPriyadarshii/agentprobe?style=flat-square)](LICENSE)

`agentprobe` audits and scores whether websites and web applications are ready for autonomous AI agents (such as ChatGPT, Claude, Perplexity, and custom browsing bots) to discover, crawl, parse, and take actions without getting blocked or wasting tokens.

```bash
npx agentprobe https://yourdomain.com
```

## Install

Run instantly without installation:

```bash
npx agentprobe <url-or-dir>
```

Or install globally:

```bash
npm install -g agentprobe
```

## Quick start

### 1. Audit a live website
```bash
agentprobe https://docs.example.com
```

### 2. Audit a local build before deploying
```bash
agentprobe ./dist --min-score 85
```

### 3. Scaffold missing AI manifests
```bash
agentprobe init
```
Generates a compliant `llms.txt` and AI-crawler-friendly `robots.txt` in your `public/` folder.

## Core Audit Pillars

`agentprobe` runs deterministic checks across four weighted pillars (25 points each, 100 points total):

### 1. Bot Accessibility
- **Robots.txt Availability**: Verifies that `/robots.txt` is published and reachable.
- **AI Crawler Allowances**: Checks crawl access for major AI agents (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`, `Meta-ExternalAgent`, `cohere-ai`).
- **Sitemap Indexing**: Confirms XML sitemap declaration for automated agent discovery.

### 2. LLM Context Manifest (`llms.txt`)
- **Manifest Detection**: Checks `/llms.txt` HTTP status and presence.
- **Spec Compliance**: Validates H1 title, summary blockquote, and markdown link hierarchy.
- **Token Budget**: Estimates prompt token footprint and warns when manifests exceed 15,000 tokens.
- **Companion Manifest**: Detects `/llms-full.txt` for deep RAG ingestion.

### 3. Structured Context & Schema
- **HTML5 Semantic Landmarks**: Verifies `<main>`, `<nav>`, and `<header>`/`<footer>` structure.
- **Heading Hierarchy**: Enforces a single descriptive `<h1>` and clean subsection nesting.
- **Schema.org JSON-LD**: Extracts and verifies structured data entities (`WebSite`, `Product`, `Organization`, `SoftwareApplication`).
- **Metadata**: Audits page title, meta description, and OpenGraph headers.

### 4. Actionability & Content Negotiation
- **Markdown Negotiation**: Probes `Accept: text/markdown` support to save token overhead.
- **Interactive Button Labels**: Flags icon buttons lacking accessible text or `aria-label`.
- **Form Controls**: Checks `<input>` fields for accessible labels or placeholders.
- **SSR vs. Hydration Traps**: Detects empty client-side SPA shells that blind static AI crawlers.

## CI/CD Gate & GitHub Actions

Add `agentprobe` to your pull request pipeline to block regressions in agent readiness:

```yaml
- name: Agent Readiness Gate
  uses: AkashPriyadarshii/agentprobe@v1
  with:
    target: 'https://preview.yourdomain.com'
    min-score: '80'
```

Or run via CLI:

```bash
npx agentprobe ./dist --min-score 85 --json > audit.json
```

Exit codes:
- `0`: Audit passed (score ≥ threshold)
- `1`: Audit failed (score < threshold)
- `2`: Network, file, or parse error

## Dynamic README Badge

Every audit generates a Shields.io markdown badge you can paste into your project README:

```markdown
[![Agent Readiness](https://img.shields.io/badge/Agent_Readiness-94%2F100-brightgreen?style=flat-square)](https://github.com/AkashPriyadarshii/agentprobe)
```

## Development

```bash
git clone https://github.com/AkashPriyadarshii/agentprobe.git
cd agentprobe
npm install
npm test
npm run build
```

## License

[MIT](LICENSE) © Akash Priyadarshi
