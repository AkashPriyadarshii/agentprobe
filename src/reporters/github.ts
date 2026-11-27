import { AuditReport } from '../types/index.js';

function escapeCommandData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeCommandProperty(value: string): string {
  return escapeCommandData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

export function formatGithubAnnotations(report: AuditReport): string {
  const lines: string[] = [];

  for (const pillar of Object.values(report.pillars)) {
    for (const check of pillar.checks) {
      if (check.status === 'pass') continue;

      const level = check.status === 'fail' ? 'error' : 'warning';
      const title = escapeCommandProperty(`${pillar.name}: ${check.name}`);
      const detail = [`${check.score}/${check.maxScore}`, check.details, check.recommendation]
        .filter(Boolean)
        .join(' — ');
      const message = escapeCommandData(detail || check.description);

      lines.push(`::${level} title=${title}::${message}`);
    }
  }

  if (!report.passed) {
    const title = escapeCommandProperty('AgentProbe Readiness Gate Failed');
    const message = escapeCommandData(
      `Score ${report.totalScore}/100 for ${report.target} is below minimum threshold ${report.minScoreThreshold}`
    );
    lines.push(`::error title=${title}::${message}`);
  }

  return lines.join('\n');
}
