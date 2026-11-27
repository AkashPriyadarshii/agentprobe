# Contributing to agentprobe

Contributions are welcome.

## Local Setup

```bash
git clone https://github.com/AkashPriyadarshii/agentprobe.git
cd agentprobe
npm ci
```

## Verification

Run the full check suite before opening a pull request:

```bash
npm test
npm run typecheck
npm run build
```

## Guidelines

- Keep changes focused and add Vitest unit tests under `tests/` for new checks, reporters, or CLI flags.
- Do not introduce unnecessary runtime dependencies.
- Use clear, factual documentation without synthetic benchmarks or filler prose.
