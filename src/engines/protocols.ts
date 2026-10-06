import { PillarResult, AuditCheck } from '../types/index.js';

export interface ProtocolAuditInput {
  url: string;
  aiCatalogContent?: string;
  aiCatalogStatus?: number;
  mcpContent?: string;
  mcpStatus?: number;
  agentSkillsContent?: string;
  agentSkillsStatus?: number;
  x402HeaderDetected?: boolean;
}

export async function fetchWellKnownEndpoint(url: string, endpoint: string): Promise<{ status: number; content?: string }> {
  try {
    const targetUrl = new URL(endpoint, url).toString();
    const res = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const content = await res.text();
      return { status: res.status, content };
    }
    return { status: res.status };
  } catch {
    return { status: 0 };
  }
}

export async function auditProtocolDiscovery(input: ProtocolAuditInput): Promise<PillarResult> {
  const checks: AuditCheck[] = [];
  const baseTarget = new URL(input.url);

  // 1. Check /.well-known/ai-catalog.json (ARD standard) (7 pts)
  let catalogStatus = input.aiCatalogStatus;
  let catalogContent = input.aiCatalogContent;

  if (catalogStatus === undefined) {
    const res = await fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/ai-catalog.json');
    catalogStatus = res.status;
    catalogContent = res.content;
  }

  let validCatalog = false;
  if (catalogStatus === 200 && catalogContent) {
    try {
      JSON.parse(catalogContent);
      validCatalog = true;
    } catch {
      validCatalog = false;
    }
  }

  if (validCatalog) {
    checks.push({
      id: 'protocol-ai-catalog',
      name: 'Agentic Resource Discovery (ai-catalog.json)',
      description: 'Publishes /.well-known/ai-catalog.json for federated agent resource discovery',
      status: 'pass',
      score: 7,
      maxScore: 7,
      details: 'Valid JSON manifest found at /.well-known/ai-catalog.json',
    });
  } else {
    checks.push({
      id: 'protocol-ai-catalog',
      name: 'Agentic Resource Discovery (ai-catalog.json)',
      description: 'Publishes /.well-known/ai-catalog.json for federated agent resource discovery',
      status: 'warn',
      score: 2,
      maxScore: 7,
      details: catalogStatus ? `HTTP ${catalogStatus}` : 'Not found',
      recommendation: 'Publish /.well-known/ai-catalog.json to declare your tools and APIs to AI agents (Agentic Resource Discovery standard).',
    });
  }

  // 2. Check /.well-known/mcp.json (Model Context Protocol) (6 pts)
  let mcpStatus = input.mcpStatus;
  let mcpContent = input.mcpContent;

  if (mcpStatus === undefined) {
    const res = await fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/mcp.json');
    mcpStatus = res.status;
    mcpContent = res.content;
  }

  let validMcp = false;
  if (mcpStatus === 200 && mcpContent) {
    try {
      JSON.parse(mcpContent);
      validMcp = true;
    } catch {
      validMcp = false;
    }
  }

  if (validMcp) {
    checks.push({
      id: 'protocol-mcp',
      name: 'Model Context Protocol (mcp.json)',
      description: 'Publishes /.well-known/mcp.json server card for autonomous tool connections',
      status: 'pass',
      score: 6,
      maxScore: 6,
      details: 'Valid MCP server manifest found at /.well-known/mcp.json',
    });
  } else {
    checks.push({
      id: 'protocol-mcp',
      name: 'Model Context Protocol (mcp.json)',
      description: 'Publishes /.well-known/mcp.json server card for autonomous tool connections',
      status: 'warn',
      score: 2,
      maxScore: 6,
      details: mcpStatus ? `HTTP ${mcpStatus}` : 'Not found',
      recommendation: 'Publish /.well-known/mcp.json to allow coding agents and assistants (Claude, Cursor) to auto-discover tool capabilities.',
    });
  }

  // 3. Check /.well-known/agent-skills/index.json (4 pts)
  let skillsStatus = input.agentSkillsStatus;
  let skillsContent = input.agentSkillsContent;

  if (skillsStatus === undefined) {
    const res = await fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/agent-skills/index.json');
    skillsStatus = res.status;
    skillsContent = res.content;
  }

  if (skillsStatus === 200 && skillsContent && skillsContent.trim().length > 0) {
    checks.push({
      id: 'protocol-agent-skills',
      name: 'Agent Skills Index Discovery',
      description: 'Publishes discoverable agent skills via /.well-known/agent-skills/index.json',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: 'Agent skills index found at /.well-known/agent-skills/index.json',
    });
  } else {
    checks.push({
      id: 'protocol-agent-skills',
      name: 'Agent Skills Index Discovery',
      description: 'Publishes discoverable agent skills via /.well-known/agent-skills/index.json',
      status: 'warn',
      score: 1,
      maxScore: 4,
      details: skillsStatus ? `HTTP ${skillsStatus}` : 'Not found',
      recommendation: 'Expose agent skills index at /.well-known/agent-skills/index.json if offering repeatable AI workflows.',
    });
  }

  // 4. Check Agentic Commerce & x402 Support (3 pts)
  if (input.x402HeaderDetected) {
    checks.push({
      id: 'protocol-commerce',
      name: 'Agentic Commerce & x402 Protocol',
      description: 'Supports autonomous agent micropayments via HTTP 402 or x402 standard',
      status: 'pass',
      score: 3,
      maxScore: 3,
      details: 'x402 / HTTP 402 payment headers detected.',
    });
  } else {
    checks.push({
      id: 'protocol-commerce',
      name: 'Agentic Commerce & x402 Protocol',
      description: 'Supports autonomous agent micropayments via HTTP 402 or x402 standard',
      status: 'pass',
      score: 2,
      maxScore: 3,
      details: 'Open / free resource access (zero payment barriers for reading agents).',
      recommendation: 'Implement x402 protocol if you intend to meter and monetize autonomous agent requests.',
    });
  }

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

  return {
    name: 'Protocol Discovery & Commerce',
    score,
    maxScore,
    checks,
  };
}
