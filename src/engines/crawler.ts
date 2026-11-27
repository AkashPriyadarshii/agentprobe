import * as cheerio from 'cheerio';
// @ts-ignore
import _robotsParser from 'robots-parser';

type RobotParserFn = (url: string, robotstxt: string) => {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getSitemaps(): string[];
};

const parseRobots: RobotParserFn = (typeof _robotsParser === 'function'
  ? _robotsParser
  : (_robotsParser as unknown as { default: RobotParserFn }).default) as RobotParserFn;

import { PillarResult, AuditCheck } from '../types/index.js';

export const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'cohere-ai',
  'OAI-SearchBot',
  'Amazonbot',
  'ByteSpider',
  'Diffbot',
  'CCBot',
  'FacebookBot',
] as const;

export interface CrawlerAuditInput {
  url: string;
  robotsTxtContent?: string;
  statusCode?: number;
  targetStatusCode?: number;
  targetHeaders?: Record<string, string>;
  robotsHeaders?: Record<string, string>;
  headers?: Record<string, string>;
  status?: number;
  html?: string;
  finalUrl?: string;
}

const WAF_BLOCK_STATUSES = new Set([403, 429, 503]);
const RESTRICTIVE_ROBOTS_TOKENS = new Set(['noindex', 'none', 'noai', 'noimageai']);

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

export function parseContentSignal(raw: string): Record<string, string> {
  const signals: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim().toLowerCase();
    if (key && val) {
      signals[key] = val;
    }
  }
  return signals;
}

function extractRobotsTxtContentSignals(robotsTxt: string): Record<string, string> {
  const merged: Record<string, string> = {};
  let currentGroupWildcard = true;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const uaMatch = /^user-agent:\s*(.+)$/i.exec(line);
    if (uaMatch) {
      const ua = uaMatch[1].trim().toLowerCase();
      currentGroupWildcard =
        ua === '*' || AI_BOTS.some((bot) => bot.toLowerCase() === ua);
      continue;
    }

    const csMatch = /^content-signal:\s*(.+)$/i.exec(line);
    if (csMatch && currentGroupWildcard) {
      Object.assign(merged, parseContentSignal(csMatch[1]));
    }
  }

  return merged;
}

function extractMetaRobotsDirectives(html: string): { name: string; directives: string[] }[] {
  const $ = cheerio.load(html);
  const found: { name: string; directives: string[] }[] = [];
  const targetNames = new Set(['robots', 'googlebot', 'bingbot', 'gptbot', 'claudebot', 'anthropic-ai']);

  $('meta[name][content]').each((_, el) => {
    const name = ($(el).attr('name') || '').trim().toLowerCase();
    if (!targetNames.has(name)) return;
    const content = $(el).attr('content') || '';
    const directives = content
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    if (directives.length > 0) {
      found.push({ name, directives });
    }
  });

  return found;
}

function extractXRobotsDirectives(headers: Record<string, string>): string[] {
  const raw = headers['x-robots-tag'];
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => {
      const trimmed = part.trim().toLowerCase();
      const colonIdx = trimmed.indexOf(':');
      return colonIdx !== -1 ? trimmed.slice(colonIdx + 1).trim() : trimmed;
    })
    .filter(Boolean);
}

function detectWafChallengeBody(html?: string): string | undefined {
  if (!html) return undefined;
  if (/cf-browser-verification|_cf_chl_opt|challenges\.cloudflare\.com\/turnstile/i.test(html)) {
    return 'Cloudflare JS/Turnstile challenge page';
  }
  if (/Attention Required!\s*\|\s*Cloudflare/i.test(html)) {
    return 'Cloudflare WAF block page';
  }
  if (/Pardon Our Interruption|px-captcha/i.test(html)) {
    return 'PerimeterX bot challenge';
  }
  if (/Incapsula incident|_Incapsula_Resource/i.test(html)) {
    return 'Imperva/Incapsula bot challenge';
  }
  return undefined;
}

export async function auditCrawlerAccess(input: CrawlerAuditInput): Promise<PillarResult> {
  const checks: AuditCheck[] = [];
  const baseTarget = new URL(input.url);
  let robotsUrl = `${baseTarget.origin}/robots.txt`;

  let content = input.robotsTxtContent;
  let status = input.statusCode;
  let robotsHeaders = normalizeHeaders(input.robotsHeaders);
  let targetStatus = input.targetStatusCode ?? input.status;
  let targetHeaders = normalizeHeaders(input.targetHeaders ?? input.headers);
  let targetHtml = input.html;
  let finalUrl = input.finalUrl ?? baseTarget.href;

  if (content === undefined && status === undefined) {
    const fetchOpts = {
      headers: { 'User-Agent': 'agentprobe/0.0.2' },
      signal: AbortSignal.timeout(5000),
    };

    const [robotsRes, targetRes] = await Promise.all([
      fetch(robotsUrl, fetchOpts).catch(() => undefined),
      targetHtml === undefined
        ? fetch(baseTarget.href, {
            headers: {
              'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(5000),
          }).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);

    if (targetRes) {
      targetStatus = targetRes.status;
      targetHeaders = normalizeHeaders(targetRes.headers);
      if (targetRes.url) {
        finalUrl = targetRes.url;
      }
      const ct = targetHeaders['content-type'] || '';
      if (ct.includes('text/html') || ct.includes('application/xhtml+xml') || !ct) {
        targetHtml = await targetRes.text().catch(() => undefined);
      }
    }

    const finalOrigin = new URL(finalUrl).origin;
    if (finalOrigin !== baseTarget.origin) {
      robotsUrl = `${finalOrigin}/robots.txt`;
      try {
        const redirectedRobots = await fetch(robotsUrl, fetchOpts);
        status = redirectedRobots.status;
        robotsHeaders = normalizeHeaders(redirectedRobots.headers);
        if (redirectedRobots.ok) {
          content = await redirectedRobots.text();
        }
      } catch {
        status = 0;
      }
    } else if (robotsRes) {
      status = robotsRes.status;
      robotsHeaders = normalizeHeaders(robotsRes.headers);
      if (robotsRes.ok) {
        content = await robotsRes.text();
      }
    } else {
      status = 0;
    }
  }

  // Evaluate WAF / Bot-Wall early so crawlability score reflects HTTP blocks
  const wafReasons: string[] = [];
  if (targetStatus !== undefined && WAF_BLOCK_STATUSES.has(targetStatus)) {
    wafReasons.push(`Target URL returned HTTP ${targetStatus}`);
  }
  if (status !== undefined && WAF_BLOCK_STATUSES.has(status)) {
    wafReasons.push(`/robots.txt returned HTTP ${status}`);
  }
  const cfMitigated = targetHeaders['cf-mitigated'] || robotsHeaders['cf-mitigated'];
  if (cfMitigated) {
    wafReasons.push(`cf-mitigated: ${cfMitigated}`);
  }
  const bodyChallenge = detectWafChallengeBody(targetHtml);
  if (bodyChallenge) {
    wafReasons.push(bodyChallenge);
  }

  // Check 1: robots.txt availability (4 pts)
  if (status === 200 && content) {
    checks.push({
      id: 'crawler-robots-exists',
      name: 'Robots.txt Available',
      description: 'Site publishes a reachable /robots.txt configuration file',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: 'Found valid robots.txt at /robots.txt',
    });
  } else {
    checks.push({
      id: 'crawler-robots-exists',
      name: 'Robots.txt Available',
      description: 'Site publishes a reachable /robots.txt configuration file',
      status: 'warn',
      score: 1,
      maxScore: 4,
      details: `robots.txt returned status ${status || 'unreachable'}`,
      recommendation: 'Publish a /robots.txt file to guide AI agent crawlers cleanly.',
    });
  }

  // Check 2: AI Bots Permissions against actual finalUrl path (12 pts)
  if (content) {
    const robots = parseRobots(robotsUrl, content);
    const blockedBots: string[] = [];
    const allowedBots: string[] = [];

    for (const bot of AI_BOTS) {
      const isAllowed = robots.isAllowed(finalUrl, bot) !== false;
      if (isAllowed) {
        allowedBots.push(bot);
      } else {
        blockedBots.push(bot);
      }
    }

    if (wafReasons.length > 0 && blockedBots.length < AI_BOTS.length) {
      checks.push({
        id: 'crawler-ai-allowed',
        name: 'AI Agent Crawlers Allowed',
        description: 'Monitored AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Amazonbot) are permitted',
        status: 'fail',
        score: 0,
        maxScore: 12,
        details: `robots.txt permits bots on ${new URL(finalUrl).pathname || '/'}, but HTTP/WAF blocked access (${wafReasons.join('; ')}).`,
        recommendation: 'Exempt AI user-agents from WAF/Bot-Wall blocks so robots.txt permissions are actually reachable.',
      });
    } else if (blockedBots.length === 0) {
      checks.push({
        id: 'crawler-ai-allowed',
        name: 'AI Agent Crawlers Allowed',
        description: 'Monitored AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Amazonbot) are permitted',
        status: 'pass',
        score: 12,
        maxScore: 12,
        details: `All ${AI_BOTS.length} monitored AI bots are permitted for ${new URL(finalUrl).pathname || '/'}.`,
      });
    } else if (blockedBots.length < AI_BOTS.length) {
      checks.push({
        id: 'crawler-ai-allowed',
        name: 'AI Agent Crawlers Allowed',
        description: 'Major AI agents are permitted to crawl',
        status: 'warn',
        score: 6,
        maxScore: 12,
        details: `Partially blocked on ${new URL(finalUrl).pathname || '/'}: ${blockedBots.join(', ')}`,
        recommendation: `Allow essential AI bots in robots.txt: ${blockedBots.join(', ')}`,
      });
    } else {
      checks.push({
        id: 'crawler-ai-allowed',
        name: 'AI Agent Crawlers Allowed',
        description: 'Major AI agents are permitted to crawl',
        status: 'fail',
        score: 0,
        maxScore: 12,
        details: `All monitored AI agent crawlers are explicitly disallowed for ${new URL(finalUrl).pathname || '/'} in robots.txt.`,
        recommendation: 'Remove disallow rules for AI agents in robots.txt if you want your site discovered by AI.',
      });
    }

    // Check 3: Sitemap directive (4 pts)
    const hasSitemap = /sitemap:\s*https?:\/\//i.test(content);
    if (hasSitemap) {
      checks.push({
        id: 'crawler-sitemap',
        name: 'Sitemap Declared in robots.txt',
        description: 'Declares an XML sitemap to help agents discover your structure',
        status: 'pass',
        score: 4,
        maxScore: 4,
        details: 'Sitemap directive found in robots.txt',
      });
    } else {
      checks.push({
        id: 'crawler-sitemap',
        name: 'Sitemap Declared in robots.txt',
        description: 'Declares an XML sitemap to help agents discover your structure',
        status: 'warn',
        score: 1,
        maxScore: 4,
        details: 'No Sitemap: directive detected in robots.txt',
        recommendation: 'Add "Sitemap: https://yourdomain.com/sitemap.xml" to robots.txt.',
      });
    }
  } else {
    checks.push({
      id: 'crawler-ai-allowed',
      name: 'AI Agent Crawlers Allowed',
      description: 'Major AI agents are permitted to crawl',
      status: wafReasons.length > 0 ? 'fail' : 'pass',
      score: wafReasons.length > 0 ? 0 : 10,
      maxScore: 12,
      details:
        wafReasons.length > 0
          ? `Blocked at HTTP/WAF layer (${wafReasons.join('; ')}).`
          : 'No disallow rules found (default allow behavior).',
      recommendation:
        wafReasons.length > 0
          ? 'Resolve WAF/bot-wall blocking on public routes.'
          : undefined,
    });
    checks.push({
      id: 'crawler-sitemap',
      name: 'Sitemap Declared in robots.txt',
      description: 'Declares an XML sitemap to help agents discover your structure',
      status: 'warn',
      score: 1,
      maxScore: 4,
      details: 'robots.txt not found to declare sitemap.',
      recommendation: 'Create robots.txt and declare your sitemap.',
    });
  }

  // Check 4: WAF / Bot-Wall Detection (advisory signal)
  if (wafReasons.length > 0) {
    checks.push({
      id: 'crawler-waf-botwall',
      name: 'WAF & Bot-Wall Clearance',
      description: 'Ensures CDN/WAF does not block AI agents with 403/429/503 or challenge walls',
      status: 'fail',
      score: 0,
      maxScore: 0,
      details: `Bot-wall / WAF challenge detected: ${wafReasons.join('; ')}`,
      recommendation: 'Allow verified AI user-agents or disable Bot Fight Mode / JS challenges on public docs and discovery routes.',
    });
  } else {
    checks.push({
      id: 'crawler-waf-botwall',
      name: 'WAF & Bot-Wall Clearance',
      description: 'Ensures CDN/WAF does not block AI agents with 403/429/503 or challenge walls',
      status: 'pass',
      score: 0,
      maxScore: 0,
      details: 'No WAF challenge, cf-mitigated header, or 403/429/503 bot block detected.',
    });
  }

  // Check 5: Content-Signal, X-Robots-Tag, and <meta name="robots"> (advisory signal)
  const contentSignals: Record<string, string> = {
    ...(content ? extractRobotsTxtContentSignals(content) : {}),
    ...(robotsHeaders['content-signal'] ? parseContentSignal(robotsHeaders['content-signal']) : {}),
    ...(targetHeaders['content-signal'] ? parseContentSignal(targetHeaders['content-signal']) : {}),
  };

  const xRobotsDirectives = extractXRobotsDirectives(targetHeaders);
  const metaRobotsEntries = targetHtml ? extractMetaRobotsDirectives(targetHtml) : [];
  const blockingXRobots = xRobotsDirectives.filter((d) => RESTRICTIVE_ROBOTS_TOKENS.has(d));
  const blockingMeta = metaRobotsEntries.flatMap((entry) =>
    entry.directives
      .filter((d) => RESTRICTIVE_ROBOTS_TOKENS.has(d))
      .map((d) => `<meta name="${entry.name}" content="...${d}...">`)
  );

  const signalSummary = Object.entries(contentSignals)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  if (blockingXRobots.length > 0 || blockingMeta.length > 0) {
    const reasons: string[] = [];
    if (blockingXRobots.length > 0) {
      reasons.push(`X-Robots-Tag: ${blockingXRobots.join(', ')}`);
    }
    if (blockingMeta.length > 0) {
      reasons.push(blockingMeta.join(', '));
    }
    if (signalSummary) {
      reasons.push(`Content-Signal: ${signalSummary}`);
    }
    checks.push({
      id: 'crawler-meta-directives',
      name: 'Content-Signal & Robots Directives',
      description: 'Evaluates Content-Signal preferences, X-Robots-Tag headers, and <meta name="robots"> tags',
      status: 'fail',
      score: 0,
      maxScore: 0,
      details: `Restrictive indexing/AI directives detected (${reasons.join('; ')}).`,
      recommendation: 'Remove noindex, none, noai, or noimageai from X-Robots-Tag and <meta name="robots"> on agent-facing pages.',
    });
  } else if (contentSignals['ai-input'] === 'no' || contentSignals['search'] === 'no') {
    checks.push({
      id: 'crawler-meta-directives',
      name: 'Content-Signal & Robots Directives',
      description: 'Evaluates Content-Signal preferences, X-Robots-Tag headers, and <meta name="robots"> tags',
      status: 'warn',
      score: 0,
      maxScore: 0,
      details: `Content-Signal restricts agent retrieval (${signalSummary}).`,
      recommendation: 'Set Content-Signal to "search=yes, ai-input=yes" (even if ai-train=no) so agents can ground responses in your content.',
    });
  } else {
    const details = signalSummary
      ? `Parsed Content-Signal (${signalSummary}); no blocking X-Robots-Tag or <meta name="robots"> directives.`
      : 'No blocking Content-Signal, X-Robots-Tag, or <meta name="robots"> directives detected.';
    checks.push({
      id: 'crawler-meta-directives',
      name: 'Content-Signal & Robots Directives',
      description: 'Evaluates Content-Signal preferences, X-Robots-Tag headers, and <meta name="robots"> tags',
      status: 'pass',
      score: 0,
      maxScore: 0,
      details,
    });
  }

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

  return {
    name: 'Bot Accessibility',
    score,
    maxScore,
    checks,
  };
}
