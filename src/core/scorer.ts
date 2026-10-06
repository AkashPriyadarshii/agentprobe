import { AuditReport, Grade, PillarResult } from '../types/index.js';

export function calculateGrade(score: number): Grade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
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
): AuditReport {
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

  return {
    version: '0.0.2',
    target,
    timestamp: new Date().toISOString(),
    durationMs,
    grade,
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
