import fs from 'node:fs';
import path from 'node:path';
import { AuditOptions, AuditReport } from '../types/index.js';
import { auditCrawlerAccess } from '../engines/crawler.js';
import { auditLLMsTxt } from '../engines/llmstxt.js';
import { auditSemanticStructure } from '../engines/semantic.js';
import { auditActionability, testMarkdownNegotiation } from '../engines/actionability.js';
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
  const normalizedUrl = targetUrl.endsWith('/') ? targetUrl : `${targetUrl}/`;

  // 1. Fetch main page HTML
  let html = '';
  try {
    const res = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'agentprobe/0.0.1 (Agentic Web Readiness Audit)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch target URL: HTTP ${res.status} ${res.statusText}`);
    }
    html = await res.text();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Target unreachable: ${msg}`);
  }

  // 2. Run engines in parallel
  const [crawlerResult, llmstxtResult, markdownSupported] = await Promise.all([
    auditCrawlerAccess({ url: normalizedUrl }),
    auditLLMsTxt({ url: normalizedUrl }),
    testMarkdownNegotiation(normalizedUrl),
  ]);

  const semanticResult = auditSemanticStructure({ html, url: normalizedUrl });
  const actionabilityResult = auditActionability({
    html,
    url: normalizedUrl,
    markdownNegotiationSupported: markdownSupported,
  });

  return calculateReport(
    normalizedUrl,
    {
      crawler: crawlerResult,
      llmstxt: llmstxtResult,
      semantic: semanticResult,
      actionability: actionabilityResult,
    },
    options.minScore ?? 80
  );
}

async function auditLocalDirectory(dirPath: string, options: AuditOptions): Promise<AuditReport> {
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

  return calculateReport(
    resolvedPath,
    {
      crawler: crawlerResult,
      llmstxt: llmstxtResult,
      semantic: semanticResult,
      actionability: actionabilityResult,
    },
    options.minScore ?? 80
  );
}
