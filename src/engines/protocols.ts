import { PillarResult, AuditCheck } from '../types/index.js';

export interface ProtocolAuditInput {
  url: string;
  aiCatalogContent?: string;
  aiCatalogStatus?: number;
  ardContent?: string;
  ardStatus?: number;
  apiCatalogContent?: string;
  apiCatalogStatus?: number;
  mcpContent?: string;
  mcpStatus?: number;
  oauthProtectedResourceContent?: string;
  oauthProtectedResourceStatus?: number;
  agentSkillsContent?: string;
  agentSkillsStatus?: number;
  agentCardContent?: string;
  agentCardStatus?: number;
  x402HeaderDetected?: boolean;
  x402Headers?: Record<string, string>;
  headers?: Record<string, string>;
  status?: number;
}

export interface WellKnownResponse {
  status: number;
  content?: string;
  headers?: Record<string, string>;
}

const X402_V2_HEADERS = ['payment-required', 'payment-signature', 'payment-response'] as const;
const X402_V1_HEADERS = ['x-402', 'x-payment', 'x-payment-response'] as const;

function normalizeHeaders(headers?: Headers | Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

function tryParseJson(raw?: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function detectX402FromHeaders(
  headers?: Record<string, string>,
  status?: number
): { detected: boolean; version?: 'v2' | 'v1'; matched: string[] } {
  const matched: string[] = [];
  let version: 'v2' | 'v1' | undefined;

  if (headers) {
    for (const h of X402_V2_HEADERS) {
      if (headers[h] !== undefined) {
        matched.push(h.toUpperCase());
        version = 'v2';
      }
    }
    for (const h of X402_V1_HEADERS) {
      if (headers[h] !== undefined) {
        matched.push(h);
        if (!version) version = 'v1';
      }
    }
  }

  if (status === 402) {
    matched.push('HTTP 402');
    if (!version) version = 'v1';
  }

  return {
    detected: matched.length > 0,
    version,
    matched,
  };
}

export async function fetchWellKnownEndpoint(url: string, endpoint: string): Promise<WellKnownResponse> {
  try {
    const targetUrl = new URL(endpoint, url).toString();
    const res = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json, application/linkset+json, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
      },
      signal: AbortSignal.timeout(4000),
    });

    const headers = normalizeHeaders(res.headers);
    if (res.ok) {
      const content = await res.text();
      return { status: res.status, content, headers };
    }
    return { status: res.status, headers };
  } catch {
    return { status: 0 };
  }
}

async function probeX402Headers(url: string): Promise<{ status: number; headers: Record<string, string> }> {
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 405) {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
        },
        signal: AbortSignal.timeout(4000),
      });
    }
    return { status: res.status, headers: normalizeHeaders(res.headers) };
  } catch {
    return { status: 0, headers: {} };
  }
}

export async function auditProtocolDiscovery(input: ProtocolAuditInput): Promise<PillarResult> {
  const checks: AuditCheck[] = [];
  const baseTarget = new URL(input.url);
  const isLiveMode =
    input.aiCatalogStatus === undefined &&
    input.mcpStatus === undefined &&
    input.agentSkillsStatus === undefined;

  // Resolve all endpoints (in parallel when live)
  const [
    catalogRes,
    ardRes,
    apiCatalogRes,
    mcpRes,
    oauthRes,
    skillsRes,
    agentCardRes,
    x402ProbeRes,
  ] = await Promise.all([
    input.aiCatalogStatus === undefined
      ? fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/ai-catalog.json')
      : Promise.resolve({ status: input.aiCatalogStatus, content: input.aiCatalogContent } as WellKnownResponse),
    input.ardStatus === undefined && isLiveMode
      ? fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/ard.json')
      : Promise.resolve({ status: input.ardStatus ?? 0, content: input.ardContent } as WellKnownResponse),
    input.apiCatalogStatus === undefined && isLiveMode
      ? fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/api-catalog')
      : Promise.resolve({ status: input.apiCatalogStatus ?? 0, content: input.apiCatalogContent } as WellKnownResponse),
    input.mcpStatus === undefined
      ? fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/mcp.json')
      : Promise.resolve({ status: input.mcpStatus, content: input.mcpContent } as WellKnownResponse),
    input.oauthProtectedResourceStatus === undefined && isLiveMode
      ? fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/oauth-protected-resource')
      : Promise.resolve({
          status: input.oauthProtectedResourceStatus ?? 0,
          content: input.oauthProtectedResourceContent,
        } as WellKnownResponse),
    input.agentSkillsStatus === undefined
      ? fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/agent-skills/index.json')
      : Promise.resolve({ status: input.agentSkillsStatus, content: input.agentSkillsContent } as WellKnownResponse),
    input.agentCardStatus === undefined && isLiveMode
      ? fetchWellKnownEndpoint(baseTarget.origin, '/.well-known/agent-card.json')
      : Promise.resolve({ status: input.agentCardStatus ?? 0, content: input.agentCardContent } as WellKnownResponse),
    isLiveMode && !input.x402HeaderDetected && !input.x402Headers && !input.headers
      ? probeX402Headers(baseTarget.href)
      : Promise.resolve(undefined),
  ]);

  // 1. ARD (/.well-known/ard.json & ai-catalog.json) + RFC 9727 (/.well-known/api-catalog) (7 pts)
  const validArd = ardRes.status === 200 && Boolean(tryParseJson(ardRes.content));
  const validAiCatalog = catalogRes.status === 200 && Boolean(tryParseJson(catalogRes.content));
  const parsedApiCatalog = apiCatalogRes.status === 200 ? tryParseJson(apiCatalogRes.content) : undefined;
  const validApiCatalog = Boolean(parsedApiCatalog);

  const foundCatalogs: string[] = [];
  if (validArd) foundCatalogs.push('/.well-known/ard.json');
  if (validAiCatalog) foundCatalogs.push('/.well-known/ai-catalog.json');
  if (validApiCatalog) foundCatalogs.push('/.well-known/api-catalog (RFC 9727)');

  if (foundCatalogs.length > 0) {
    checks.push({
      id: 'protocol-ai-catalog',
      name: 'Agentic Resource & API Catalog (ARD / RFC 9727)',
      description: 'Publishes /.well-known/ard.json, ai-catalog.json, or RFC 9727 /.well-known/api-catalog',
      status: 'pass',
      score: 7,
      maxScore: 7,
      details: `Valid discovery manifest(s) found: ${foundCatalogs.join(', ')}`,
    });
  } else {
    checks.push({
      id: 'protocol-ai-catalog',
      name: 'Agentic Resource & API Catalog (ARD / RFC 9727)',
      description: 'Publishes /.well-known/ard.json, ai-catalog.json, or RFC 9727 /.well-known/api-catalog',
      status: 'warn',
      score: 2,
      maxScore: 7,
      details: catalogRes.status ? `HTTP ${catalogRes.status}` : 'Not found',
      recommendation: 'Publish /.well-known/ard.json (or ai-catalog.json) and RFC 9727 /.well-known/api-catalog to declare tools and APIs.',
    });
  }

  // 2. SEP-1649 /.well-known/mcp.json + RFC 9728 /.well-known/oauth-protected-resource (6 pts)
  const parsedMcp = mcpRes.status === 200 ? tryParseJson(mcpRes.content) : undefined;
  const validMcp = Boolean(parsedMcp);
  const parsedOauth = oauthRes.status === 200 ? tryParseJson(oauthRes.content) : undefined;
  const validOauth = Boolean(parsedOauth);

  if (validMcp) {
    const mcpNotes: string[] = ['Valid SEP-1649 MCP server card at /.well-known/mcp.json'];
    if (validOauth) {
      mcpNotes.push('RFC 9728 OAuth protected resource metadata at /.well-known/oauth-protected-resource');
    }
    checks.push({
      id: 'protocol-mcp',
      name: 'Model Context Protocol (SEP-1649 & RFC 9728)',
      description: 'Publishes /.well-known/mcp.json server card and optional RFC 9728 OAuth metadata',
      status: 'pass',
      score: 6,
      maxScore: 6,
      details: mcpNotes.join(' + '),
    });
  } else if (validOauth) {
    checks.push({
      id: 'protocol-mcp',
      name: 'Model Context Protocol (SEP-1649 & RFC 9728)',
      description: 'Publishes /.well-known/mcp.json server card and optional RFC 9728 OAuth metadata',
      status: 'warn',
      score: 3,
      maxScore: 6,
      details: 'Found RFC 9728 /.well-known/oauth-protected-resource, but /.well-known/mcp.json is missing.',
      recommendation: 'Publish SEP-1649 /.well-known/mcp.json so MCP clients can auto-discover server capabilities.',
    });
  } else {
    checks.push({
      id: 'protocol-mcp',
      name: 'Model Context Protocol (SEP-1649 & RFC 9728)',
      description: 'Publishes /.well-known/mcp.json server card and optional RFC 9728 OAuth metadata',
      status: 'warn',
      score: 2,
      maxScore: 6,
      details: mcpRes.status ? `HTTP ${mcpRes.status}` : 'Not found',
      recommendation: 'Publish SEP-1649 /.well-known/mcp.json (and RFC 9728 /.well-known/oauth-protected-resource if authenticated).',
    });
  }

  // 3. /.well-known/agent-skills/index.json (4 pts)
  if (skillsRes.status === 200 && skillsRes.content && skillsRes.content.trim().length > 0) {
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
      details: skillsRes.status ? `HTTP ${skillsRes.status}` : 'Not found',
      recommendation: 'Expose agent skills index at /.well-known/agent-skills/index.json if offering repeatable AI workflows.',
    });
  }

  // 4. A2A Agent Card (/.well-known/agent-card.json) (advisory check)
  const parsedAgentCard = agentCardRes.status === 200 ? tryParseJson(agentCardRes.content) : undefined;
  if (parsedAgentCard) {
    const cardName = typeof parsedAgentCard.name === 'string' ? ` (${parsedAgentCard.name})` : '';
    checks.push({
      id: 'protocol-a2a',
      name: 'A2A Agent Card (/.well-known/agent-card.json)',
      description: 'Publishes an Agent-to-Agent (A2A) discovery card at /.well-known/agent-card.json',
      status: 'pass',
      score: 0,
      maxScore: 0,
      details: `Valid A2A Agent Card found at /.well-known/agent-card.json${cardName}.`,
    });
  } else {
    checks.push({
      id: 'protocol-a2a',
      name: 'A2A Agent Card (/.well-known/agent-card.json)',
      description: 'Publishes an Agent-to-Agent (A2A) discovery card at /.well-known/agent-card.json',
      status: 'warn',
      score: 0,
      maxScore: 0,
      details: agentCardRes.status ? `HTTP ${agentCardRes.status}` : 'Not found',
      recommendation: 'Publish /.well-known/agent-card.json to advertise Agent-to-Agent (A2A) capabilities and endpoints.',
    });
  }

  // 5. Agentic Commerce & x402 v1/v2 Support (3 pts)
  const mergedHeaders: Record<string, string> = {
    ...(x402ProbeRes?.headers ?? {}),
    ...normalizeHeaders(input.headers),
    ...normalizeHeaders(input.x402Headers),
  };
  const headerDetection = detectX402FromHeaders(mergedHeaders, x402ProbeRes?.status ?? input.status);

  if (input.x402HeaderDetected || headerDetection.detected) {
    const detail = headerDetection.detected
      ? `x402 ${headerDetection.version ?? 'v1'} payment headers detected (${headerDetection.matched.join(', ')}).`
      : 'x402 / HTTP 402 payment headers detected.';
    checks.push({
      id: 'protocol-commerce',
      name: 'Agentic Commerce & x402 Protocol',
      description: 'Supports autonomous agent micropayments via HTTP 402 or x402 v1/v2 headers',
      status: 'pass',
      score: 3,
      maxScore: 3,
      details: detail,
    });
  } else {
    checks.push({
      id: 'protocol-commerce',
      name: 'Agentic Commerce & x402 Protocol',
      description: 'Supports autonomous agent micropayments via HTTP 402 or x402 v1/v2 headers',
      status: 'pass',
      score: 2,
      maxScore: 3,
      details: 'Open / free resource access (zero payment barriers for reading agents).',
      recommendation: 'Implement x402 v2 (PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE) if metering autonomous agent requests.',
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
