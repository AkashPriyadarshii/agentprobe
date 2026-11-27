import { describe, it, expect } from 'vitest';
import {
  calculateReport,
  formatSarifReport,
  formatJunitReport,
  formatAgentReport,
  formatGithubAnnotations,
  AuditReport,
  PillarResult,
} from '../src/index.js';

function makePillar(name: string, checks: PillarResult['checks']): PillarResult {
  return {
    name,
    score: checks.reduce((sum, c) => sum + c.score, 0),
    maxScore: checks.reduce((sum, c) => sum + c.maxScore, 0),
    checks,
  };
}

function makeSampleReport(passed = false): AuditReport {
  return calculateReport(
    'https://example.com/docs',
    {
      crawler: makePillar('Bot Accessibility', [
        {
          id: 'crawler-robots-exists',
          name: 'Robots.txt Available',
          description: 'Site publishes /robots.txt',
          status: 'pass',
          score: 20,
          maxScore: 20,
          details: 'Found valid robots.txt',
        },
      ]),
      llmstxt: makePillar('LLM Manifest (llms.txt)', [
        {
          id: 'llms-exists',
          name: 'llms.txt Manifest Found',
          description: 'Site publishes /llms.txt',
          status: 'fail',
          score: 0,
          maxScore: 20,
          details: 'HTTP 404',
          recommendation: 'Create /llms.txt in public root.',
        },
      ]),
      semantic: makePillar('Structured Context & Schema', [
        {
          id: 'semantic-landmarks',
          name: 'HTML5 Semantic Landmarks',
          description: 'Page uses <main> & <nav>',
          status: 'warn',
          score: 12,
          maxScore: 20,
          details: 'Missing <nav>',
          recommendation: 'Add <nav> element.',
        },
      ]),
      actionability: makePillar('Actionability & Negotiation', [
        {
          id: 'action-markdown-negotiation',
          name: 'Markdown Content Negotiation',
          description: 'Returns text/markdown',
          status: 'pass',
          score: 20,
          maxScore: 20,
        },
      ]),
      protocols: makePillar('Protocol Discovery & Commerce', [
        {
          id: 'protocol-mcp',
          name: 'Model Context Protocol (mcp.json)',
          description: 'Publishes /.well-known/mcp.json',
          status: 'pass',
          score: 20,
          maxScore: 20,
        },
      ]),
    },
    passed ? 70 : 80,
    250
  );
}

describe('Reporters', () => {
  describe('formatSarifReport', () => {
    it('emits valid OASIS SARIF v2.1.0 JSON with rules and non-passing results', () => {
      const report = makeSampleReport(false);
      const sarif = JSON.parse(formatSarifReport(report));

      expect(sarif.version).toBe('2.1.0');
      expect(sarif.$schema).toContain('sarif-schema-2.1.0.json');
      expect(sarif.runs).toHaveLength(1);

      const [run] = sarif.runs;
      expect(run.tool.driver.name).toBe('agentprobe');
      expect(run.tool.driver.version).toBe(report.version);
      expect(run.tool.driver.rules).toHaveLength(5);
      expect(run.results).toHaveLength(2);

      const failResult = run.results.find((r: { ruleId: string }) => r.ruleId === 'llms-exists');
      expect(failResult.level).toBe('error');
      expect(failResult.message.text).toContain('HTTP 404');
      expect(failResult.locations[0].physicalLocation.artifactLocation.uri).toBe('https://example.com/docs');

      const warnResult = run.results.find((r: { ruleId: string }) => r.ruleId === 'semantic-landmarks');
      expect(warnResult.level).toBe('warning');
      expect(run.invocations[0].executionSuccessful).toBe(false);
    });
  });

  describe('formatJunitReport', () => {
    it('emits valid JUnit XML with testsuites, failures, and escaped XML characters', () => {
      const report = makeSampleReport(false);
      const xml = formatJunitReport(report);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<testsuites name="agentprobe" tests="5" failures="1" errors="0" time="0.250">');
      expect(xml).toContain('<testsuite name="LLM Manifest (llms.txt)" tests="1" failures="1" errors="0" skipped="0">');
      expect(xml).toContain('<failure message="HTTP 404" type="fail">');
      expect(xml).toContain('Add &lt;nav&gt; element.');
      expect(xml).toContain('</testsuites>');
    });
  });

  describe('formatAgentReport', () => {
    it('emits ultra-terse token-minimal output for coding agents', () => {
      const report = makeSampleReport(false);
      const out = formatAgentReport(report);
      const lines = out.split('\n');

      expect(lines[0]).toBe(
        'agentprobe https://example.com/docs score=72/100 grade=C maturity=L3 gate=FAIL(min:80)'
      );
      expect(lines[1]).toContain('pillars: crawler=20/20 llmstxt=0/20 semantic=12/20');
      expect(out).toContain('FAIL llms-exists (0/20): Create /llms.txt in public root.');
      expect(out).toContain('WARN semantic-landmarks (12/20): Add <nav> element.');
      expect(out).not.toContain('crawler-robots-exists');
    });

    it('omits maturity when undefined on report', () => {
      const report = { ...makeSampleReport(false), maturityLevel: undefined };
      const out = formatAgentReport(report);
      expect(out.split('\n')[0]).toBe(
        'agentprobe https://example.com/docs score=72/100 grade=C gate=FAIL(min:80)'
      );
    });

    it('emits OK summary line when all checks pass', () => {
      const passingPillar = makePillar('All Pass', [
        {
          id: 'check-1',
          name: 'Check 1',
          description: 'Passes',
          status: 'pass',
          score: 20,
          maxScore: 20,
        },
      ]);
      const report = calculateReport(
        'https://example.com',
        {
          crawler: passingPillar,
          llmstxt: passingPillar,
          semantic: passingPillar,
          actionability: passingPillar,
          protocols: passingPillar,
        },
        80
      );
      const out = formatAgentReport(report);
      expect(out).toContain('gate=PASS(min:80)');
      expect(out).toContain('OK all 5 checks passed');
    });
  });

  describe('formatGithubAnnotations', () => {
    it('emits ::error and ::warning workflow commands and gate failure annotation', () => {
      const report = makeSampleReport(false);
      const out = formatGithubAnnotations(report);
      const lines = out.split('\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^::error title=LLM Manifest \(llms\.txt\)%3A llms\.txt Manifest Found::0\/20 — HTTP 404/);
      expect(lines[1]).toMatch(/^::warning title=Structured Context & Schema%3A HTML5 Semantic Landmarks::12\/20 — Missing <nav>/);
      expect(lines[2]).toMatch(/^::error title=AgentProbe Readiness Gate Failed::Score 72\/100/);
    });

    it('returns empty string when all checks pass and gate passes', () => {
      const passingPillar = makePillar('All Pass', [
        {
          id: 'check-1',
          name: 'Check 1',
          description: 'Passes',
          status: 'pass',
          score: 20,
          maxScore: 20,
        },
      ]);
      const report = calculateReport(
        'https://example.com',
        {
          crawler: passingPillar,
          llmstxt: passingPillar,
          semantic: passingPillar,
          actionability: passingPillar,
          protocols: passingPillar,
        },
        80
      );

      expect(formatGithubAnnotations(report)).toBe('');
    });
  });
});
