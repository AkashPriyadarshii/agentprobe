<!--
Title: agentprobe: The Open-Source Lighthouse for AI Agents
Description: Production CLI auditor & CI gate for agentic web readiness. Audit robots.txt bot rules, llms.txt compliance, Schema.org JSON-LD, and DOM actionability for AI agents like ChatGPT, Claude, and Perplexity.
Keywords: agentic web, agent readiness, lighthouse for ai agents, llms.txt, robots.txt, gptbot, claudebot, perplexity, schema.org, json-ld, geo, generative engine optimization, web scraping, ai crawler, devtools, ci gate, github action
-->

**Support:** fuel the next build: [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/AkashPriyadarshi)

<div align="center">

  <img src="assets/agentprobe.svg" width="96" alt="agentprobe logo" />

  <h1><code>agentprobe</code></h1>

  <p><strong>The Open-Source Lighthouse for AI Agents. Audit agentic web readiness, llms.txt, crawler access, and DOM actionability in seconds.</strong></p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0055ff.svg?style=flat-square" alt="MIT License" /></a>
    <a href="https://www.npmjs.com/package/@akashpriyadarshii/agentprobe"><img src="https://img.shields.io/npm/v/@akashpriyadarshii/agentprobe?style=flat-square" alt="npm version" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-2a3138.svg?style=flat-square" alt="Node >=20" /></a>
    <a href="https://github.com/AkashPriyadarshii/agentprobe/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/AkashPriyadarshii/agentprobe/ci.yml?branch=main&style=flat-square&label=ci" alt="CI Status" /></a>
  </p>

  <p>By <strong><a href="https://github.com/AkashPriyadarshii">Akash Priyadarshi</a></strong> · MIT · Zero dependencies to inspect · Single command</p>

  <p><strong><a href="https://agentprobe-self.vercel.app">Try the live audit</a></strong> - paste a URL, get a 0-100 score in seconds. No signup.</p>

  <p>
    <a href="#direct-answer">Direct answer</a> &bull;
    <a href="#why-agentprobe">Why</a> &bull;
    <a href="#quickstart">Quickstart</a> &bull;
    <a href="#the-5-audit-pillars">The 5 Pillars</a> &bull;
    <a href="#cli-reference">CLI Reference</a> &bull;
    <a href="#cicd-github-action">CI/CD Gate</a> &bull;
    <a href="#dynamic-badge">Badge</a> &bull;
    <a href="#ecosystem">Ecosystem</a>
  </p>

</div>

[![stars](https://img.shields.io/github/stars/AkashPriyadarshii/agentprobe?style=flat-square&label=stars)](https://github.com/AkashPriyadarshii/agentprobe/stargazers) [![license](https://img.shields.io/github/license/AkashPriyadarshii/agentprobe?style=flat-square)](LICENSE) [![release](https://img.shields.io/github/v/release/AkashPriyadarshii/agentprobe?style=flat-square&label=release)](https://github.com/AkashPriyadarshii/agentprobe/releases)

---

## Direct answer

**What is agentprobe?** An open-source, local-first CLI auditor and CI quality gate for the agentic web. Google Lighthouse tests web performance for humans; `agentprobe` tests whether autonomous AI agents (Claude, ChatGPT, Perplexity, OpenAI Operator, and headless browser bots) can reach, parse, and take actions on your site without getting blocked or burning excessive tokens.

**Who is it for?** Frontend developers, full-stack engineers, and open-source maintainers who want their documentation, apps, and platforms to be accurately cited and executable by autonomous AI agents.

**What does it cost?** Free. MIT licensed. Runs 100% locally on your machine with zero API keys, zero accounts, and zero cloud lock-in.

**How fast?** Audits live URLs or local `./dist` static builds in under 2 seconds.

```console
$ npx @akashpriyadarshii/agentprobe https://akashpriyadarshi.is-a.dev

  ┌──────────────────────────────────────────────────────────────┐
  │                    agentprobe v0.0.2                         │
  │           The Open-Source Lighthouse for AI Agents           │
  └──────────────────────────────────────────────────────────────┘

  Target:      https://akashpriyadarshi.is-a.dev/
  Audited:     2026-10-06T20:10:30.096Z
  Gate Status: PASSED (min score: 80)

  ════════════════════════════════════════════════════════════
  TOTAL READINESS SCORE: 85 / 100
  [██████████████████████████░░░░] 85%
  ════════════════════════════════════════════════════════════
```

---

## Why agentprobe?

Websites designed only for human eyeballs break when autonomous agents attempt to interact with them:

* **Accidental AI crawler lockouts:** Over-aggressive WAF firewalls or blanket `robots.txt` disallows silently block `GPTBot`, `ClaudeBot`, or `PerplexityBot` from indexing your site.
* **Token bleed from messy DOM trees:** Agents scraping bloated, un-semantic HTML burn tens of thousands of tokens per page request, causing reasoning models to lose context.
* **Empty client-side hydration traps:** Single-page applications (SPAs) that serve empty `<div id="root"></div>` shells blind static AI crawlers that do not execute heavy client-side JavaScript.
* **Dead-end interactive controls:** Icon-only buttons without text or `aria-label` prevent autonomous browsing agents from clicking navigation items, executing searches, or submitting forms.

`agentprobe` gives you an empirical **0-100 Agent Readiness Score** with a prioritized checklist of fixes before you deploy.

---

## Quickstart

### Install & Run
Run instantly via `npx`:
```bash
npx @akashpriyadarshii/agentprobe https://docs.yourdomain.com
```

Or install globally to use the `agentprobe` command anywhere:
```bash
npm install -g @akashpriyadarshii/agentprobe
agentprobe https://docs.yourdomain.com
```

### 1. Audit a local production build before deploying
```bash
agentprobe ./dist --min-score 85
```

### 2. Auto-scaffold missing AI manifests
```bash
agentprobe init
```
Generates spec-compliant `llms.txt`, a 15-bot permissive `robots.txt`, and discovery manifests (`.well-known/ai-catalog.json`, `.well-known/mcp.json`) directly in your `public/` or root directory.

### Shell Aliases

```bash
# bash/zsh (~/.bashrc or ~/.zshrc)
alias probe='npx @akashpriyadarshii/agentprobe'
```

```powershell
# PowerShell ($PROFILE)
Set-Alias probe agentprobe
```

---

## The 5 Audit Pillars

`agentprobe` evaluates websites across five weighted pillars (20 points each, 100 points total):

| Pillar | Weight | What it inspects | Why it matters for AI Agents |
|---|:---:|---|---|
| **1. Bot Accessibility** | `20 pts` | `robots.txt` permissions (15 AI crawlers), WAF blocks, XML sitemap | Guarantees major models (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `Amazonbot`, `ByteSpider`) can crawl. |
| **2. LLM Manifest (`llms.txt`)** | `20 pts` | `/llms.txt`, `/llms-full.txt`, H1/blockquote syntax, token budget | Gives agents a lightweight, structured markdown summary of your site, saving 90%+ token costs. |
| **3. Structured Context** | `20 pts` | Schema.org JSON-LD, HTML5 landmarks (`<main>`, `<nav>`), headings | Eliminates hallucination by providing unambiguous, machine-readable entity metadata. |
| **4. Actionability & Negotiation** | `20 pts` | `Accept: text/markdown` support, button `aria-label`s, SSR vs SPA shells | Ensures agents can execute form submissions and clicks without stumbling on unlabeled DOM nodes. |
| **5. Protocol Discovery & Commerce** | `20 pts` | `/.well-known/ai-catalog.json`, `/.well-known/mcp.json`, skills index, `x402` payment headers | Enables autonomous tool discovery (ARD, MCP) and agentic commerce / micropayment protocols. |

---

## CLI Reference

`agentprobe [OPTIONS] <TARGET>`

| Option | Default | Description |
|---|:---:|---|
| `<TARGET>` | *Required* | URL (`https://...` or `http://localhost:3000`) or static directory (`./dist`). |
| `--min-score <n>` | `80` | Minimum passing score threshold (0-100) for CI quality gates. |
| `--plain` | `false` | Outputs structured plain text without ANSI codes for AI agents and scripts. |
| `--json` | `false` | Outputs machine-readable JSON to `stdout` for programmatic analysis. |
| `--summary` | `false` | Outputs GitHub Step Summary Markdown for pull request checks. |
| `--no-color` | `false` | Disables ANSI colors in terminal output (respects `NO_COLOR=1`). |
| `-q, --quiet` | `false` | Suppresses progress banners; outputs final exit code and report only. |
| `-v, --version` | *None* | Prints current `agentprobe` version. |
| `-h, --help` | *None* | Displays CLI help synopsis. |

### Commands

| Command | Description |
|---|---|
| `agentprobe <target>` | Audit a live URL or static build folder. |
| `agentprobe init` | Interactively scaffold a compliant `llms.txt` and permissive `robots.txt`. |

### Exit Codes
- `0`: Audit passed (score ≥ threshold).
- `1`: Audit failed (score < threshold).
- `2`: Invalid target, unreachable network, or parse failure.

---

## CI/CD & GitHub Action

Block pull requests that introduce regressions in agent readability or block AI crawlers:

```yaml
name: Agent Readiness Gate

on: [push, pull_request]

jobs:
  agent-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Audit Preview Deployment
        uses: AkashPriyadarshii/agentprobe@v1
        with:
          target: 'https://preview.yourdomain.com'
          min-score: '85'
```

Or via direct script:

```bash
npx agentprobe ./dist --min-score 80 --json > agent-report.json
```

---

## Dynamic Badge

Every audit generates a markdown badge you can paste into your project README:

[![Agent Readiness](https://img.shields.io/badge/Agent_Readiness-98%2F100-brightgreen?style=flat-square)](https://github.com/AkashPriyadarshii/agentprobe)

```markdown
[![Agent Readiness](https://img.shields.io/badge/Agent_Readiness-98%2F100-brightgreen?style=flat-square)](https://github.com/AkashPriyadarshii/agentprobe)
```

---

## Architecture

```
agentprobe/
├── src/
│   ├── cli.ts                 # CLI entry point (commander)
│   ├── index.ts               # Core module exports
│   ├── types/index.ts         # Diagnostic & scoring contracts
│   ├── core/
│   │   ├── runner.ts          # Parallel multi-target engine executor
│   │   └── scorer.ts          # Deterministic deduction-based scoring
│   ├── engines/
│   │   ├── crawler.ts         # robots.txt & 15 AI bot permissions
│   │   ├── llmstxt.ts         # llms.txt & llms-full.txt parser + token budget
│   │   ├── semantic.ts        # Schema.org JSON-LD & HTML5 landmark validator
│   │   ├── actionability.ts   # Markdown content negotiation & ARIA accessibility
│   │   └── protocols.ts       # Protocol discovery (ARD, MCP & x402 commerce)
│   ├── reporters/
│   │   ├── terminal.ts        # ANSI high-contrast terminal UI with grade badges
│   │   ├── plain.ts           # Structured plain text for AI agents and scripts
│   │   ├── json.ts            # Machine-readable JSON
│   │   ├── summary.ts         # GitHub Actions $GITHUB_STEP_SUMMARY
│   │   └── badge.ts           # Dynamic Shields.io badge generator
│   └── scaffolder/
│       └── init.ts            # llms.txt, robots.txt, and .well-known scaffolder
├── tests/                     # 17 passing Vitest unit tests
├── action.yml                 # Composite GitHub Action manifest
└── README.md
```

---

## Ecosystem

Built by **[Akash Priyadarshi](https://github.com/AkashPriyadarshii)** as part of the autonomous developer tools ecosystem:

* **[My-Starred-Repos](https://github.com/AkashPriyadarshii/My-Starred-Repos)** &bull; 1,350+ hand-curated developer tools & AI agent knowledge hub.
* **[ziggygrep](https://github.com/AkashPriyadarshii/ziggygrep)** &bull; Pure Zig grep replacement beating ripgrep 22 of 22 benches.
* **[jev-curate](https://github.com/AkashPriyadarshii/jev-curate)** &bull; High-throughput synthetic dataset sifter powered by TypeSafe AI.
* **[Portfolio](https://akashpriyadarshi.is-a.dev)** &bull; Projects, benchmarks, and writing.

---

## License

[MIT](LICENSE) © Akash Priyadarshi
