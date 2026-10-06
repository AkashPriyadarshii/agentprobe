import pc from 'picocolors';
import { AuditReport, RuleStatus } from '../types/index.js';
import { generateBadge } from './badge.js';

function getStatusBadge(status: RuleStatus): string {
  switch (status) {
    case 'pass':
      return pc.green('✔ PASS');
    case 'warn':
      return pc.yellow('▲ WARN');
    case 'fail':
      return pc.red('✖ FAIL');
  }
}

function getScoreColor(score: number): (text: string) => string {
  if (score >= 80) return pc.green;
  if (score >= 60) return pc.yellow;
  return pc.red;
}

function renderProgressBar(score: number, max: number, width = 20): string {
  const percentage = Math.max(0, Math.min(1, score / max));
  const filledChars = Math.round(percentage * width);
  const emptyChars = width - filledChars;
  const color = getScoreColor(Math.round(percentage * 100));

  const bar = color('█'.repeat(filledChars)) + pc.dim('░'.repeat(emptyChars));
  return `[${bar}] ${color(`${Math.round(percentage * 100)}%`)}`;
}

export function formatTerminalReport(report: AuditReport): string {
  const lines: string[] = [];
  const scoreColor = getScoreColor(report.totalScore);

  lines.push('');
  lines.push(pc.bold(pc.cyan('  ┌──────────────────────────────────────────────────────────────┐')));
  lines.push(pc.bold(pc.cyan('  │                    agentprobe v0.0.2                         │')));
  lines.push(pc.bold(pc.cyan('  │           The Open-Source Lighthouse for AI Agents           │')));
  lines.push(pc.bold(pc.cyan('  └──────────────────────────────────────────────────────────────┘')));
  lines.push('');

  lines.push(`  ${pc.bold('Target:')}      ${pc.underline(report.target)}`);
  lines.push(`  ${pc.bold('Audited:')}     ${report.timestamp}`);
  lines.push(`  ${pc.bold('Gate Status:')} ${report.passed ? pc.bold(pc.green('PASSED')) : pc.bold(pc.red('FAILED'))} (min score: ${report.minScoreThreshold})`);
  lines.push('');

  // Overall Score Banner
  const scoreHeader = `  TOTAL READINESS SCORE: ${report.totalScore} / 100`;
  lines.push(pc.bold(scoreColor('  ' + '═'.repeat(60))));
  lines.push(pc.bold(scoreColor(scoreHeader)));
  lines.push('  ' + renderProgressBar(report.totalScore, 100, 30));
  lines.push(pc.bold(scoreColor('  ' + '═'.repeat(60))));
  lines.push('');

  // 5 Pillar details
  const pillarList = [
    { key: 'crawler', title: '1. Bot Accessibility (robots.txt & WAF)', data: report.pillars.crawler },
    { key: 'llmstxt', title: '2. LLM Context Manifest (/llms.txt)', data: report.pillars.llmstxt },
    { key: 'semantic', title: '3. Structured Context (Schema.org & Landmarks)', data: report.pillars.semantic },
    { key: 'actionability', title: '4. Actionability & Content Negotiation', data: report.pillars.actionability },
    { key: 'protocols', title: '5. Protocol Discovery & Commerce (ARD, MCP & x402)', data: report.pillars.protocols },
  ];

  for (const pillar of pillarList) {
    const pColor = getScoreColor(Math.round((pillar.data.score / pillar.data.maxScore) * 100));
    lines.push(`  ${pc.bold(pillar.title)}`);
    lines.push(`  Score: ${pColor(`${pillar.data.score}/${pillar.data.maxScore}`)}  ${renderProgressBar(pillar.data.score, pillar.data.maxScore, 15)}`);

    for (const check of pillar.data.checks) {
      const badge = getStatusBadge(check.status);
      lines.push(`    ${badge}  ${pc.bold(check.name)} ${pc.dim(`(${check.score}/${check.maxScore})`)}`);
      if (check.details) {
        lines.push(`           ${pc.dim(check.details)}`);
      }
    }
    lines.push('');
  }

  // Quick Fixes
  if (report.quickFixes.length > 0) {
    lines.push(pc.bold(pc.yellow('  ┌─ Actionable Fixes ───────────────────────────────────────────┐')));
    for (const fix of report.quickFixes.slice(0, 6)) {
      lines.push(`  │  ${pc.yellow('•')} ${fix}`);
    }
    lines.push(pc.bold(pc.yellow('  └──────────────────────────────────────────────────────────────┘')));
    lines.push('');
  }

  // Dynamic README Badge
  lines.push(pc.bold(pc.magenta('  Dynamic README Badge:')));
  lines.push(`  ${pc.dim(generateBadge(report.totalScore))}`);
  lines.push('');

  return lines.join('\n');
}
