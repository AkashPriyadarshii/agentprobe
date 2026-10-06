import fs from 'node:fs';
import path from 'node:path';
import { AuditOptions, AuditReport } from '../types/index.js';
import { auditCrawlerAccess } from '../engines/crawler.js';
import { auditLLMsTxt } from '../engines/llmstxt.js';
import { auditSemanticStructure } from '../engines/semantic.js';
import { auditActionability, testMarkdownNegotiation } from '../engines/actionability.js';
import { auditProtocolDiscovery } from '../engines/protocols.js';
import { calculateReport } from './scorer.js';

export async function auditTarget(target: string, options: AuditOptions = {}): Promise<AuditReport> {
  const isUrl = target.startsWith('http://') || target.startsWith('https://');

  if (isUrl) {
    return auditRemoteUrl(target, options);
  } else {
    return auditLocalDirectory(target, options);
  }
}

async function auditRemoteUrl(targetUrl: string, options: AuditOptions): Promise<AuditReport> {
  const startTime = Date.now();
  const normalizedUrl = targetUrl.endsWith('/') ? targetUrl : `${targetUrl}/`;

  // 1. Fetch main page HTML
  let html = '';
  let x402Detected = false;
  try {
    const res = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok && res.status !== 402) {
      throw new Error(`Failed to fetch target URL: HTTP ${res.status} ${res.statusText}`);
    }

    if (res.status === 402 || res.headers.has('x-402') || res.headers.has('x-payment')) {
      x402Detected = true;
    }

    html = await res.text();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Target unreachable: ${msg}`);
  }

  // 2. Run engines in parallel
  const [crawlerResult, llmstxtResult, markdownSupported, protocolsResult] = await Promise.all([
    auditCrawlerAccess({ url: normalizedUrl }),
    auditLLMsTxt({ url: normalizedUrl }),
    testMarkdownNegotiation(normalizedUrl),
    auditProtocolDiscovery({ url: normalizedUrl, x402HeaderDetected: x402Detected }),
  ]);

  const semanticResult = auditSemanticStructure({ html, url: normalizedUrl });
  const actionabilityResult = auditActionability({
    html,
    url: normalizedUrl,
    markdownNegotiationSupported: markdownSupported,
  });

  const durationMs = Date.now() - startTime;

  return calculateReport(
    normalizedUrl,
    {
      crawler: crawlerResult,
      llmstxt: llmstxtResult,
      semantic: semanticResult,
      actionability: actionabilityResult,
      protocols: protocolsResult,
    },
    options.minScore ?? 80,
    durationMs
  );
}

async function auditLocalDirectory(dirPath: string, options: AuditOptions): Promise<AuditReport> {
  const startTime = Date.now();
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Directory does not exist: ${resolvedPath}`);
  }

  // Find index.html
  const indexPath = path.join(resolvedPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`No index.html found in directory: ${resolvedPath}`);
  }
  const html = fs.readFileSync(indexPath, 'utf-8');

  // Check robots.txt
  const robotsPath = path.join(resolvedPath, 'robots.txt');
  const robotsTxtContent = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf-8') : undefined;

  // Check llms.txt & llms-full.txt
  const llmsPath = path.join(resolvedPath, 'llms.txt');
  const llmsTxtContent = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf-8') : undefined;
  const llmsFullPath = path.join(resolvedPath, 'llms-full.txt');
  const fullStatusCode = fs.existsSync(llmsFullPath) ? 200 : 404;

  // Check .well-known protocol manifests
  const publicDir = fs.existsSync(path.join(resolvedPath, 'public'))
    ? path.join(resolvedPath, 'public')
    : resolvedPath;

  const catalogPath1 = path.join(publicDir, '.well-known', 'ai-catalog.json');
  const catalogPath2 = path.join(resolvedPath, '.well-known', 'ai-catalog.json');
  const aiCatalogContent = fs.existsSync(catalogPath1)
    ? fs.readFileSync(catalogPath1, 'utf-8')
    : fs.existsSync(catalogPath2)
      ? fs.readFileSync(catalogPath2, 'utf-8')
      : undefined;

  const mcpPath1 = path.join(publicDir, '.well-known', 'mcp.json');
  const mcpPath2 = path.join(resolvedPath, '.well-known', 'mcp.json');
  const mcpContent = fs.existsSync(mcpPath1)
    ? fs.readFileSync(mcpPath1, 'utf-8')
    : fs.existsSync(mcpPath2)
      ? fs.readFileSync(mcpPath2, 'utf-8')
      : undefined;

  const skillsPath1 = path.join(publicDir, '.well-known', 'agent-skills', 'index.json');
  const skillsPath2 = path.join(resolvedPath, '.well-known', 'agent-skills', 'index.json');
  const hasLocalSkillsDir = fs.existsSync(path.join(resolvedPath, 'skills')) || fs.existsSync(path.join(resolvedPath, '.agents', 'skills'));
  const agentSkillsContent = fs.existsSync(skillsPath1)
    ? fs.readFileSync(skillsPath1, 'utf-8')
    : fs.existsSync(skillsPath2)
      ? fs.readFileSync(skillsPath2, 'utf-8')
      : hasLocalSkillsDir
        ? JSON.stringify({ skills: ['local'] })
        : undefined;

  const crawlerResult = await auditCrawlerAccess({
    url: 'http://localhost/',
    robotsTxtContent,
    statusCode: robotsTxtContent !== undefined ? 200 : 404,
  });

  const llmstxtResult = await auditLLMsTxt({
    url: 'http://localhost/',
    llmsTxtContent,
    statusCode: llmsTxtContent !== undefined ? 200 : 404,
    fullStatusCode,
  });

  const semanticResult = auditSemanticStructure({ html, url: 'http://localhost/' });
  const actionabilityResult = auditActionability({
    html,
    url: 'http://localhost/',
    markdownNegotiationSupported: false,
  });

  const protocolsResult = await auditProtocolDiscovery({
    url: 'http://localhost/',
    aiCatalogContent,
    aiCatalogStatus: aiCatalogContent !== undefined ? 200 : 404,
    mcpContent,
    mcpStatus: mcpContent !== undefined ? 200 : 404,
    agentSkillsContent,
    agentSkillsStatus: agentSkillsContent !== undefined ? 200 : 404,
  });

  const durationMs = Date.now() - startTime;

  return calculateReport(
    resolvedPath,
    {
      crawler: crawlerResult,
      llmstxt: llmstxtResult,
      semantic: semanticResult,
      actionability: actionabilityResult,
      protocols: protocolsResult,
    },
    options.minScore ?? 80,
    durationMs
  );
}
