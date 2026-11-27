import fs from 'node:fs';
import path from 'node:path';
import { AuditOptions, AuditReport } from '../types/index.js';
import { auditCrawlerAccess } from '../engines/crawler.js';
import { auditLLMsTxt } from '../engines/llmstxt.js';
import { auditSemanticStructure } from '../engines/semantic.js';
import { auditActionability, testMarkdownNegotiation } from '../engines/actionability.js';
import { auditProtocolDiscovery } from '../engines/protocols.js';
import { calculateReport } from './scorer.js';

const CONFIG_FILENAMES = ['.agentproberc.json', 'agentprobe.config.json'] as const;
const SCHEMA_VERSION = '1.0.0';

export function loadConfig(searchDir?: string): Partial<AuditOptions> {
  const dirsToCheck = [process.cwd()];
  if (searchDir) {
    const resolved = path.resolve(searchDir);
    if (!dirsToCheck.includes(resolved)) {
      dirsToCheck.push(resolved);
    }
  }

  for (const dir of dirsToCheck) {
    for (const filename of CONFIG_FILENAMES) {
      const configPath = path.join(dir, filename);
      if (!fs.existsSync(configPath)) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON in ${configPath}: ${msg}`);
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Config file ${configPath} must contain a JSON object`);
      }

      const raw = parsed as Record<string, unknown>;
      const config: Partial<AuditOptions> = {};

      if (typeof raw.minScore === 'number' && !Number.isNaN(raw.minScore)) {
        config.minScore = Math.max(0, Math.min(100, raw.minScore));
      }
      if (typeof raw.json === 'boolean') config.json = raw.json;
      if (typeof raw.plain === 'boolean') config.plain = raw.plain;
      if (typeof raw.summary === 'boolean') config.summary = raw.summary;
      if (typeof raw.quiet === 'boolean') config.quiet = raw.quiet;
      if (typeof raw.noColor === 'boolean') config.noColor = raw.noColor;
      if (typeof raw.fix === 'boolean') config.fix = raw.fix;
      if (typeof raw.format === 'string') config.format = raw.format;
      if (typeof raw.output === 'string') config.output = raw.output;
      if (typeof raw.profile === 'string') config.profile = raw.profile;
      if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw.headers as Record<string, unknown>)) {
          if (typeof v === 'string') {
            headers[k] = v;
          }
        }
        config.headers = headers;
      }

      return config;
    }
  }

  return {};
}

function resolveProfileMinScore(profile?: string): number {
  switch (profile?.toLowerCase()) {
    case 'strict':
      return 90;
    case 'lenient':
      return 60;
    default:
      return 80;
  }
}

function mergeOptions(options: AuditOptions, config: Partial<AuditOptions>): AuditOptions {
  const mergedHeaders =
    config.headers || options.headers
      ? { ...(config.headers ?? {}), ...(options.headers ?? {}) }
      : undefined;

  const profile = options.profile ?? config.profile;
  const minScore = options.minScore ?? config.minScore ?? resolveProfileMinScore(profile);

  return {
    ...config,
    ...options,
    profile,
    minScore,
    headers: mergedHeaders,
  };
}

function computeMaturityLevel(score: number): AuditReport['maturityLevel'] {
  if (score >= 95) return 'L5';
  if (score >= 85) return 'L4';
  if (score >= 70) return 'L3';
  if (score >= 50) return 'L2';
  if (score >= 25) return 'L1';
  return 'L0';
}

function enrichReport(report: AuditReport): AuditReport {
  return {
    ...report,
    schemaVersion: SCHEMA_VERSION,
    maturityLevel: computeMaturityLevel(report.totalScore),
  };
}

function findFirstHtmlFile(rootDir: string, maxDepth = 3): string | undefined {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    // Prefer index.html at each directory level before other .html files
    const indexEntry = entries.find((e) => e.isFile() && e.name.toLowerCase() === 'index.html');
    if (indexEntry) {
      return path.join(current.dir, indexEntry.name);
    }

    const htmlEntry = entries.find((e) => e.isFile() && /\.html?$/i.test(e.name));
    if (htmlEntry) {
      return path.join(current.dir, htmlEntry.name);
    }

    if (current.depth < maxDepth) {
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
        }
      }
    }
  }

  return undefined;
}

export async function auditTarget(target: string, options: AuditOptions = {}): Promise<AuditReport> {
  const isUrl = target.startsWith('http://') || target.startsWith('https://');
  const config = loadConfig(isUrl ? undefined : target);
  const mergedOptions = mergeOptions(options, config);

  if (isUrl) {
    return auditRemoteUrl(target, mergedOptions);
  } else {
    return auditLocalDirectory(target, mergedOptions);
  }
}

async function auditRemoteUrl(targetUrl: string, options: AuditOptions): Promise<AuditReport> {
  const startTime = Date.now();
  const normalizedUrl = new URL(targetUrl).toString();

  // 1. Fetch main page HTML
  let html = '';
  let x402Detected = false;
  let responseHeaders: Record<string, string> = {};
  let responseStatus = 0;
  let finalUrl = normalizedUrl;

  try {
    const res = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    responseStatus = res.status;
    finalUrl = res.url || normalizedUrl;

    if (res.headers && typeof res.headers.forEach === 'function') {
      res.headers.forEach((value: string, key: string) => {
        responseHeaders[key.toLowerCase()] = value;
      });
    }

    if (!res.ok && res.status !== 402) {
      throw new Error(`Failed to fetch target URL: HTTP ${res.status} ${res.statusText}`);
    }

    if (
      res.status === 402 ||
      res.headers?.has?.('x-402') ||
      res.headers?.has?.('x-payment') ||
      'x-402' in responseHeaders ||
      'x-payment' in responseHeaders
    ) {
      x402Detected = true;
    }

    html = await res.text();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Target unreachable: ${msg}`);
  }

  // 2. Run engines in parallel
  const crawlerInput = {
    url: finalUrl,
    headers: responseHeaders,
    status: responseStatus,
    finalUrl,
  };
  const llmsInput = {
    url: finalUrl,
    headers: responseHeaders,
    status: responseStatus,
    finalUrl,
  };
  const protocolsInput = {
    url: finalUrl,
    x402HeaderDetected: x402Detected,
    headers: responseHeaders,
    status: responseStatus,
    finalUrl,
  };

  const [crawlerResult, llmstxtResult, markdownSupported, protocolsResult] = await Promise.all([
    auditCrawlerAccess(crawlerInput),
    auditLLMsTxt(llmsInput),
    testMarkdownNegotiation(finalUrl),
    auditProtocolDiscovery(protocolsInput),
  ]);

  const semanticInput = {
    html,
    url: finalUrl,
    headers: responseHeaders,
    status: responseStatus,
    finalUrl,
  };
  const actionabilityInput = {
    html,
    url: finalUrl,
    markdownNegotiationSupported: markdownSupported,
    headers: responseHeaders,
    status: responseStatus,
    finalUrl,
  };

  const semanticResult = auditSemanticStructure(semanticInput);
  const actionabilityResult = auditActionability(actionabilityInput);

  const durationMs = Date.now() - startTime;

  return enrichReport(
    calculateReport(
      finalUrl,
      {
        crawler: crawlerResult,
        llmstxt: llmstxtResult,
        semantic: semanticResult,
        actionability: actionabilityResult,
        protocols: protocolsResult,
      },
      options.minScore ?? 80,
      durationMs
    )
  );
}

async function auditLocalDirectory(dirPath: string, options: AuditOptions): Promise<AuditReport> {
  const startTime = Date.now();
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Directory does not exist: ${resolvedPath}`);
  }

  const publicDir = fs.existsSync(path.join(resolvedPath, 'public'))
    ? path.join(resolvedPath, 'public')
    : resolvedPath;

  // Check robots.txt (root or public)
  const robotsPathRoot = path.join(resolvedPath, 'robots.txt');
  const robotsPathPublic = path.join(publicDir, 'robots.txt');
  const robotsTxtContent = fs.existsSync(robotsPathRoot)
    ? fs.readFileSync(robotsPathRoot, 'utf-8')
    : fs.existsSync(robotsPathPublic)
      ? fs.readFileSync(robotsPathPublic, 'utf-8')
      : undefined;

  // Check llms.txt & llms-full.txt (root or public)
  const llmsPathRoot = path.join(resolvedPath, 'llms.txt');
  const llmsPathPublic = path.join(publicDir, 'llms.txt');
  const llmsTxtContent = fs.existsSync(llmsPathRoot)
    ? fs.readFileSync(llmsPathRoot, 'utf-8')
    : fs.existsSync(llmsPathPublic)
      ? fs.readFileSync(llmsPathPublic, 'utf-8')
      : undefined;

  const llmsFullPathRoot = path.join(resolvedPath, 'llms-full.txt');
  const llmsFullPathPublic = path.join(publicDir, 'llms-full.txt');
  const fullStatusCode =
    fs.existsSync(llmsFullPathRoot) || fs.existsSync(llmsFullPathPublic) ? 200 : 404;

  // Find root index.html or any HTML file; allow scanning without root index.html if llms.txt/robots.txt/HTML files exist
  const rootIndexPath = path.join(resolvedPath, 'index.html');
  const htmlFilePath = fs.existsSync(rootIndexPath) ? rootIndexPath : findFirstHtmlFile(resolvedPath);
  if (!htmlFilePath && llmsTxtContent === undefined && robotsTxtContent === undefined) {
    throw new Error(`No index.html, HTML files, llms.txt, or robots.txt found in directory: ${resolvedPath}`);
  }
  const html = htmlFilePath ? fs.readFileSync(htmlFilePath, 'utf-8') : '';

  // Check .well-known protocol manifests
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
  const agentSkillsContent = fs.existsSync(skillsPath1)
    ? fs.readFileSync(skillsPath1, 'utf-8')
    : fs.existsSync(skillsPath2)
      ? fs.readFileSync(skillsPath2, 'utf-8')
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

  return enrichReport(
    calculateReport(
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
    )
  );
}
