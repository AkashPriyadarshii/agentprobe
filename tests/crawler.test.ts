import { describe, it, expect } from 'vitest';
import { auditCrawlerAccess } from '../src/engines/crawler.js';

describe('CrawlerEngine', () => {
  it('passes when all AI bots are allowed in robots.txt', async () => {
    const robotsTxtContent = `
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
`;
    const result = await auditCrawlerAccess({
      url: 'https://example.com',
      robotsTxtContent,
      statusCode: 200,
    });

    expect(result.score).toBe(25);
    expect(result.checks.find((c) => c.id === 'crawler-robots-exists')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'crawler-ai-allowed')?.status).toBe('pass');
    expect(result.checks.find((c) => c.id === 'crawler-sitemap')?.status).toBe('pass');
  });

  it('fails when all AI bots are disallowed', async () => {
    const robotsTxtContent = `
User-agent: *
Disallow: /
`;
    const result = await auditCrawlerAccess({
      url: 'https://example.com',
      robotsTxtContent,
      statusCode: 200,
    });

    const aiCheck = result.checks.find((c) => c.id === 'crawler-ai-allowed');
    expect(aiCheck?.status).toBe('fail');
    expect(aiCheck?.score).toBe(0);
  });

  it('warns when robots.txt is missing', async () => {
    const result = await auditCrawlerAccess({
      url: 'https://example.com',
      statusCode: 404,
    });

    expect(result.checks.find((c) => c.id === 'crawler-robots-exists')?.status).toBe('warn');
  });
});
