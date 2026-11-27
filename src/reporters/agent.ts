import { AuditReport } from '../types/index.js';

export function formatAgentReport(report: AuditReport): string {
  const gate = report.passed ? 'PASS' : 'FAIL';
  const headerParts = [
    'agentprobe',
    report.target,
    `score=${report.totalScore}/100`,
    `grade=${report.grade}`,
    ...(report.maturityLevel ? [`maturity=${report.maturityLevel}`] : []),
    `gate=${gate}(min:${report.minScoreThreshold})`,
  ];

  const pillarSummary = Object.entries(report.pillars)
    .map(([key, pillar]) => `${key}=${pillar.score}/${pillar.maxScore}`)
    .join(' ');

  const lines: string[] = [headerParts.join(' '), `pillars: ${pillarSummary}`];

  const issues = Object.values(report.pillars)
    .flatMap((pillar) => pillar.checks)
    .filter((check) => check.status !== 'pass');

  if (issues.length === 0) {
    lines.push(`OK all ${report.summary.totalChecks} checks passed`);
  } else {
    for (const check of issues) {
      const msg = check.recommendation || check.details || check.name;
      lines.push(`${check.status.toUpperCase()} ${check.id} (${check.score}/${check.maxScore}): ${msg}`);
    }
  }

  return lines.join('\n');
}
