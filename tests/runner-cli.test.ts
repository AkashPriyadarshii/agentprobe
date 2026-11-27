import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { auditTarget, loadConfig } from '../src/core/runner.js';

describe('Runner & CLI Gate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprobe-runner-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('deep-URL normalization', () => {
    it('preserves deep URL path without appending trailing slash while fetching origin manifests', async () => {
      const requestedUrls: string[] = [];
      const richHtml = `<!doctype html>
<html>
<head>
  <title>API Docs</title>
  <meta name="description" content="Docs">
  <meta property="og:title" content="API Docs">
  <script type="application/ld+json">{"@type":"TechArticle"}</script>
</head>
<body>
  <header><nav><a href="/">Home</a></nav></header>
  <main><h1>API Reference</h1><p>${'Detailed API documentation for autonomous agents. '.repeat(8)}</p></main>
  <footer>Docs</footer>
</body>
</html>`;

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = String(input);
          requestedUrls.push(url);
          if (url === 'https://example.com/docs/api') {
            return new Response(richHtml, {
              status: 200,
              headers: { 'content-type': 'text/html' },
            });
          }
          if (url === 'https://example.com/robots.txt') {
            return new Response('User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n', {
              status: 200,
            });
          }
          if (url === 'https://example.com/llms.txt') {
            return new Response('# Docs\n\n> API docs\n\n- [Guide](/docs/api): Guide\n', {
              status: 200,
            });
          }
          return new Response('Not Found', { status: 404 });
        })
      );

      const report = await auditTarget('https://example.com/docs/api');

      expect(requestedUrls[0]).toBe('https://example.com/docs/api');
      expect(requestedUrls).toContain('https://example.com/robots.txt');
      expect(requestedUrls).toContain('https://example.com/llms.txt');
      expect(report.target).toBe('https://example.com/docs/api');
      expect(report.maturityLevel).toBeDefined();
    });

    it('normalizes bare origin URL to include root slash', async () => {
      const requestedUrls: string[] = [];

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = String(input);
          requestedUrls.push(url);
          if (url === 'https://example.com/') {
            return new Response('<html><body><main><h1>Hi</h1></main></body></html>', {
              status: 200,
              headers: { 'content-type': 'text/html' },
            });
          }
          return new Response('', { status: 404 });
        })
      );

      const report = await auditTarget('https://example.com');
      expect(requestedUrls[0]).toBe('https://example.com/');
      expect(report.target).toBe('https://example.com/');
    });
  });

  describe('minScore 0 and clamping', () => {
    it('respects minScore=0 in auditTarget without falling back to 80', async () => {
      fs.writeFileSync(path.join(tmpDir, 'index.html'), '<div>empty</div>');
      const report = await auditTarget(tmpDir, { minScore: 0 });

      expect(report.minScoreThreshold).toBe(0);
      expect(report.passed).toBe(true);
    });

    it('clamps minScore in config files to [0, 100]', () => {
      fs.writeFileSync(path.join(tmpDir, '.agentproberc.json'), JSON.stringify({ minScore: -25 }));
      expect(loadConfig(tmpDir).minScore).toBe(0);

      fs.writeFileSync(path.join(tmpDir, '.agentproberc.json'), JSON.stringify({ minScore: 150 }));
      expect(loadConfig(tmpDir).minScore).toBe(100);

      fs.writeFileSync(path.join(tmpDir, '.agentproberc.json'), JSON.stringify({ minScore: 0 }));
      expect(loadConfig(tmpDir).minScore).toBe(0);
    });

    it('handles --min-score 0 and out-of-range clamping in CLI', async () => {
      fs.writeFileSync(path.join(tmpDir, 'index.html'), '<div>minimal</div>');

      const runCliWithMinScore = async (minScoreArg: string) => {
        vi.resetModules();
        const originalArgv = process.argv;
        const stdoutChunks: string[] = [];
        let exitCode: number | undefined;

        vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
          stdoutChunks.push(String(chunk));
          return true;
        }) as typeof process.stdout.write);

        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
          exitCode = code ?? 0;
          return undefined as never;
        }) as typeof process.exit);

        process.argv = ['node', 'agentprobe', tmpDir, '--min-score', minScoreArg, '--json', '--quiet'];
        try {
          await import('../src/cli.js');
          await vi.waitFor(() => {
            expect(exitCode).toBeDefined();
          });
        } finally {
          process.argv = originalArgv;
        }

        return {
          exitCode,
          report: JSON.parse(stdoutChunks.join('')),
        };
      };

      const zeroRun = await runCliWithMinScore('0');
      expect(zeroRun.report.minScoreThreshold).toBe(0);
      expect(zeroRun.report.passed).toBe(true);
      expect(zeroRun.exitCode).toBe(0);

      const negativeRun = await runCliWithMinScore('-15');
      expect(negativeRun.report.minScoreThreshold).toBe(0);
      expect(negativeRun.report.passed).toBe(true);
      expect(negativeRun.exitCode).toBe(0);

      const overRun = await runCliWithMinScore('150');
      expect(overRun.report.minScoreThreshold).toBe(100);
      expect(overRun.report.passed).toBe(false);
      expect(overRun.exitCode).toBe(1);
    });
  });

  describe('maturityLevel', () => {
    it('assigns L0/L1 for minimal site and L4/L5 for fully configured site', async () => {
      const bareDir = path.join(tmpDir, 'bare');
      fs.mkdirSync(bareDir);
      fs.writeFileSync(path.join(bareDir, 'index.html'), '<div>bare</div>');
      fs.writeFileSync(path.join(bareDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

      const bareReport = await auditTarget(bareDir);
      expect(bareReport.totalScore).toBeGreaterThanOrEqual(25);
      expect(bareReport.totalScore).toBeLessThan(50);
      expect(bareReport.maturityLevel).toBe('L1');

      const readyDir = path.join(tmpDir, 'ready');
      fs.mkdirSync(path.join(readyDir, '.well-known', 'agent-skills'), { recursive: true });
      fs.writeFileSync(
        path.join(readyDir, 'index.html'),
        `<!doctype html>
<html>
<head>
  <title>Ready</title>
  <meta name="description" content="Ready site">
  <meta property="og:title" content="Ready">
  <script type="application/ld+json">{"@type":"WebSite"}</script>
</head>
<body>
  <header><nav><a href="/">Home</a></nav></header>
  <main><h1>Ready</h1><p>${'Structured content for agents. '.repeat(10)}</p></main>
  <footer>Footer</footer>
</body>
</html>`
      );
      fs.writeFileSync(
        path.join(readyDir, 'robots.txt'),
        'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n'
      );
      fs.writeFileSync(
        path.join(readyDir, 'llms.txt'),
        '# Ready\n\n> Ready for agents\n\n- [Docs](/docs): Docs\n'
      );
      fs.writeFileSync(path.join(readyDir, 'llms-full.txt'), '# Full docs');
      fs.writeFileSync(path.join(readyDir, '.well-known', 'ai-catalog.json'), '{"name":"Ready"}');
      fs.writeFileSync(path.join(readyDir, '.well-known', 'mcp.json'), '{"name":"Ready"}');
      fs.writeFileSync(
        path.join(readyDir, '.well-known', 'agent-skills', 'index.json'),
        '{"skills":["search"]}'
      );

      const readyReport = await auditTarget(readyDir);
      expect(readyReport.totalScore).toBeGreaterThanOrEqual(85);
      expect(['L4', 'L5']).toContain(readyReport.maturityLevel);
      expect(readyReport.schemaVersion).toBe('1.0.0');
    });
  });
});
