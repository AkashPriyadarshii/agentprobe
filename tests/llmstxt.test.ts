import { describe, it, expect } from 'vitest';
import { auditLLMsTxt, estimateTokenCount } from '../src/engines/llmstxt.js';

describe('LLMsTxtEngine', () => {
  it('correctly estimates tokens from characters', () => {
    const text = 'This is a test of token estimation for LLM agents.';
    expect(estimateTokenCount(text)).toBe(Math.ceil(text.length / 4));
  });

  it('passes fully compliant llms.txt structure', async () => {
    const validLlmsTxt = `# SuperApp

> The open platform for autonomous agents.

## Documentation
- [Quickstart](/docs/quickstart): Get started in 5 minutes
- [API](/docs/api): Full endpoints and models
`;
    const result = await auditLLMsTxt({
      url: 'https://example.com',
      llmsTxtContent: validLlmsTxt,
      statusCode: 200,
      fullStatusCode: 200,
    });

    expect(result.score).toBe(20);
    expect(result.checks.find((c) => c.id === 'llms-exists')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'llms-spec-structure')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'llms-token-budget')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'llms-full-exists')?.status).toBe('pass');
  });

  it('fails when llms.txt is missing', async () => {
    const result = await auditLLMsTxt({
      url: 'https://example.com',
      statusCode: 404,
      fullStatusCode: 404,
    });

    expect(result.checks.find((c) => c.id === 'llms-exists')?.status).toBe('fail');
    expect(result.score).toBe(1); // 1 point for optional companion status
  });
});
