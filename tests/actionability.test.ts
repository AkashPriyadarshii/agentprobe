import { describe, it, expect } from 'vitest';
import { auditActionability } from '../src/engines/actionability.js';

describe('ActionabilityEngine', () => {
  it('passes when buttons and inputs have accessible names', () => {
    const html = `
<body>
  <main>
    <p>${'Real content '.repeat(20)}</p>
    <button aria-label="Submit search">Search</button>
    <form>
      <label for="username">Username</label>
      <input id="username" type="text" />
    </form>
  </main>
</body>
`;
    const result = auditActionability({
      html,
      url: 'https://example.com',
      markdownNegotiationSupported: true,
    });

    expect(result.score).toBe(20);
    expect(result.checks.find((c) => c.id === 'action-markdown-negotiation')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'action-button-labels')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'action-input-labels')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'action-prerendered-content')?.status).toBe('pass');
  });

  it('warns when buttons lack text/aria-labels and body is empty SPA shell', () => {
    const html = `
<body>
  <div id="root">
    <button><svg></svg></button>
    <input type="text" />
  </div>
</body>
`;
    const result = auditActionability({
      html,
      url: 'https://example.com',
      markdownNegotiationSupported: false,
    });

    expect(result.score).toBeLessThan(15);
    expect(result.checks.find((c) => c.id === 'action-prerendered-content')?.status).toBe('fail');
    expect(result.checks.find((c) => c.id === 'action-button-labels')?.status).toBe('warn');
    expect(result.checks.find((c) => c.id === 'action-input-labels')?.status).toBe('warn');
  });
});
