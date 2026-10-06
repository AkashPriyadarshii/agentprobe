import { describe, it, expect } from 'vitest';
import { auditSemanticStructure } from '../src/engines/semantic.js';

describe('SemanticEngine', () => {
  it('awards high score for rich semantic landmarks and valid JSON-LD', () => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>AgentProbe - Lighthouse for AI Agents</title>
  <meta name="description" content="Audit agentic web readiness.">
  <meta property="og:title" content="AgentProbe">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "AgentProbe",
    "applicationCategory": "DeveloperApplication"
  }
  </script>
</head>
<body>
  <header><h1>AgentProbe</h1></header>
  <nav><a href="/">Home</a></nav>
  <main><article><p>Semantic content is key for AI agents.</p></article></main>
  <footer><p>Copyright 2026</p></footer>
</body>
</html>
`;
    const result = auditSemanticStructure({ html, url: 'https://example.com' });
    expect(result.score).toBe(20);
    expect(result.checks.find((c) => c.id === 'semantic-landmarks')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'semantic-headings')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'semantic-jsonld')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'semantic-metadata')?.status).toBe('pass');
  });

  it('penalizes missing landmarks and missing JSON-LD', () => {
    const html = `
<div>
  <div>No heading, no landmarks, no schema.</div>
</div>
`;
    const result = auditSemanticStructure({ html, url: 'https://example.com' });
    expect(result.score).toBe(0);
    expect(result.checks.find((c) => c.id === 'semantic-landmarks')?.status).toBe('fail');
    expect(result.checks.find((c) => c.id === 'semantic-headings')?.status).toBe('fail');
    expect(result.checks.find((c) => c.id === 'semantic-jsonld')?.status).toBe('fail');
  });
});
