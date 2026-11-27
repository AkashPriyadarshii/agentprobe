import { AuditReport, Grade, PillarResult } from '../types/index.js';

export type MaturityLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export type ScoredAuditReport = AuditReport & {
  schemaVersion: '1.0.0';
  maturityLevel: MaturityLevel;
};

export function calculateGrade(score: number): Grade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function calculateMaturityLevel(score: number): MaturityLevel {
  if (score >= 90) return 'L5';
  if (score >= 75) return 'L4';
  if (score >= 60) return 'L3';
  if (score >= 40) return 'L2';
  if (score >= 20) return 'L1';
  return 'L0';
}

export function calculateReport(
  target: string,
  pillars: {
    crawler: PillarResult;
    llmstxt: PillarResult;
    semantic: PillarResult;
    actionability: PillarResult;
    protocols: PillarResult;
  },
  minScoreThreshold = 80,
  durationMs = 0
): ScoredAuditReport {
  const totalScore = Math.round(
    pillars.crawler.score +
    pillars.llmstxt.score +
    pillars.semantic.score +
    pillars.actionability.score +
    pillars.protocols.score
  );

  const allChecks = [
    ...pillars.crawler.checks,
    ...pillars.llmstxt.checks,
    ...pillars.semantic.checks,
    ...pillars.actionability.checks,
    ...pillars.protocols.checks,
  ];

  const passedChecks = allChecks.filter((c) => c.status === 'pass').length;
  const failedChecks = allChecks.filter((c) => c.status === 'fail').length;
  const warningChecks = allChecks.filter((c) => c.status === 'warn').length;

  const quickFixes: string[] = [];
  for (const check of allChecks) {
    if (check.status !== 'pass' && check.recommendation) {
      quickFixes.push(`[${check.name}]: ${check.recommendation}`);
    }
  }

  const passed = totalScore >= minScoreThreshold;
  const grade = calculateGrade(totalScore);
  const maturityLevel = calculateMaturityLevel(totalScore);

  return {
    version: '0.0.2',
    schemaVersion: '1.0.0',
    target,
    timestamp: new Date().toISOString(),
    durationMs,
    grade,
    maturityLevel,
    totalScore,
    passed,
    minScoreThreshold,
    pillars,
    summary: {
      passedChecks,
      failedChecks,
      warningChecks,
      totalChecks: allChecks.length,
    },
    quickFixes,
  };
}
