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
}

export async function auditCrawlerAccess(input: CrawlerAuditInput): Promise<PillarResult> {
  const checks: AuditCheck[] = [];
  const baseTarget = new URL(input.url);
  const robotsUrl = `${baseTarget.origin}/robots.txt`;

  let content = input.robotsTxtContent;
  let status = input.statusCode;

  if (content === undefined) {
    try {
      const res = await fetch(robotsUrl, {
        headers: { 'User-Agent': 'agentprobe/0.0.2' },
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      if (res.ok) {
        content = await res.text();
      }
    } catch {
      status = 0;
    }
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
      score: 2,
      maxScore: 4,
      details: `robots.txt returned status ${status || 'unreachable'}`,
      recommendation: 'Publish a /robots.txt file to guide AI agent crawlers cleanly.',
    });
  }

  // Check 2: AI Bots Permissions (12 pts)
  if (content) {
    const robots = parseRobots(robotsUrl, content);
    const blockedBots: string[] = [];
    const allowedBots: string[] = [];

    for (const bot of AI_BOTS) {
      const isAllowed = robots.isAllowed(baseTarget.origin + '/', bot) !== false;
      if (isAllowed) {
        allowedBots.push(bot);
      } else {
        blockedBots.push(bot);
      }
    }

    if (blockedBots.length === 0) {
      checks.push({
        id: 'crawler-ai-allowed',
        name: 'AI Agent Crawlers Allowed',
        description: 'Monitored AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Amazonbot) are permitted',
        status: 'pass',
        score: 12,
        maxScore: 12,
        details: `All ${AI_BOTS.length} monitored AI bots are permitted.`,
      });
    } else if (blockedBots.length < AI_BOTS.length) {
      checks.push({
        id: 'crawler-ai-allowed',
        name: 'AI Agent Crawlers Allowed',
        description: 'Major AI agents are permitted to crawl',
        status: 'warn',
        score: 6,
        maxScore: 12,
        details: `Partially blocked: ${blockedBots.join(', ')}`,
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
        details: 'All monitored AI agent crawlers are explicitly disallowed in robots.txt.',
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
    // No robots.txt, assume default allow
    checks.push({
      id: 'crawler-ai-allowed',
      name: 'AI Agent Crawlers Allowed',
      description: 'Major AI agents are permitted to crawl',
      status: 'pass',
      score: 10,
      maxScore: 12,
      details: 'No disallow rules found (default allow behavior).',
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

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

  return {
    name: 'Bot Accessibility',
    score,
    maxScore,
    checks,
  };
}
