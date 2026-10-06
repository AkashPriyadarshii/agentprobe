import { describe, it, expect } from 'vitest';
import { auditProtocolDiscovery } from '../src/engines/protocols.js';

describe('ProtocolsEngine', () => {
  it('awards full score when ai-catalog.json, mcp.json, agent skills, and x402 are present', async () => {
    const validCatalog = JSON.stringify({
      name: 'Test App',
      protocols: ['mcp', 'openapi'],
    });
    const validMcp = JSON.stringify({
      name: 'Test MCP',
      tools: true,
    });
    const validSkills = JSON.stringify({
      skills: ['search', 'browse'],
    });

    const result = await auditProtocolDiscovery({
      url: 'https://example.com',
      aiCatalogContent: validCatalog,
      aiCatalogStatus: 200,
      mcpContent: validMcp,
      mcpStatus: 200,
      agentSkillsContent: validSkills,
      agentSkillsStatus: 200,
      x402HeaderDetected: true,
    });

    expect(result.score).toBe(20);
    expect(result.maxScore).toBe(20);
    expect(result.checks.find((c) => c.id === 'protocol-ai-catalog')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'protocol-mcp')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'protocol-agent-skills')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'protocol-commerce')?.status).toBe('pass');
  });

  it('provides helpful warnings and fallback points when protocol endpoints are missing', async () => {
    const result = await auditProtocolDiscovery({
      url: 'https://example.com',
      aiCatalogStatus: 404,
      mcpStatus: 404,
      agentSkillsStatus: 404,
      x402HeaderDetected: false,
    });

    expect(result.maxScore).toBe(20);
    expect(result.score).toBe(7); // 2 (catalog) + 2 (mcp) + 1 (skills) + 2 (open terms)
    expect(result.checks.find((c) => c.id === 'protocol-ai-catalog')?.status).toBe('warn');
    expect(result.checks.find((c) => c.id === 'protocol-mcp')?.status).toBe('warn');
    expect(result.checks.find((c) => c.id === 'protocol-agent-skills')?.status).toBe('warn');
  });
});
