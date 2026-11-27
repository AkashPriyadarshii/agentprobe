import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { auditTarget, loadConfig } from './core/runner.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { formatJsonReport } from './reporters/json.js';
import { formatGitHubStepSummary } from './reporters/summary.js';
import { formatPlainReport } from './reporters/plain.js';
import { scaffoldAgentManifests } from './scaffolder/init.js';
import { AuditCheck, AuditReport, PillarResult, RuleStatus } from './types/index.js';

const VALID_FORMATS = new Set([
  'terminal',
  'json',
  'plain',
  'agent',
  'summary',
  'sarif',
  'junit',
  'github',
]);

interface CheckChange {
  pillar: string;
  id: string;
  name: string;
  baseStatus: RuleStatus;
  headStatus: RuleStatus;
  baseScore: number;
  headScore: number;
  maxScore: number;
}

interface ReportDiff {
  baseTarget: string;
  headTarget: string;
  baseScore: number;
  headScore: number;
  scoreDelta: number;
  baseGrade: string;
  headGrade: string;
  pillarDeltas: Array<{
    key: string;
    name: string;
    baseScore: number;
    headScore: number;
    delta: number;
    maxScore: number;
  }>;
  regressions: CheckChange[];
  improvements: CheckChange[];
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function colorize(noColor: boolean, fn: (s: string) => string, text: string): string {
  return noColor ? text : fn(text);
}

function collectHeader(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function parseHeaders(entries: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of entries) {
    const idx = entry.indexOf(':');
    if (idx <= 0) {
      throw new Error(`Invalid header "${entry}". Expected "Key: Value" format.`);
    }
    const key = entry.slice(0, idx).trim();
    const val = entry.slice(idx + 1).trim();
    if (!key) {
      throw new Error(`Invalid header "${entry}". Header name cannot be empty.`);
    }
    headers[key] = val;
  }
  return headers;
}

function parseMinScore(raw: unknown): number {
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? 80 : Math.max(0, Math.min(100, parsed));
}

function resolveNoColor(cliColorOption: unknown, configNoColor?: boolean): boolean {
  return (
    cliColorOption === false ||
    Boolean(process.env.NO_COLOR) ||
    configNoColor === true
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeGithubCommandValue(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function formatAgentReport(report: AuditReport, diff?: ReportDiff): string {
  const actionableChecks: Array<{
    pillar: string;
    id: string;
    name: string;
    status: RuleStatus;
    score: number;
    maxScore: number;
    details?: string;
    recommendation?: string;
  }> = [];

  for (const [pillarKey, pillar] of Object.entries(report.pillars)) {
    for (const check of pillar.checks) {
      if (check.status !== 'pass') {
        actionableChecks.push({
          pillar: pillarKey,
          id: check.id,
          name: check.name,
          status: check.status,
          score: check.score,
          maxScore: check.maxScore,
          details: check.details,
          recommendation: check.recommendation,
        });
      }
    }
  }

  return JSON.stringify(
    {
      schemaVersion: report.schemaVersion ?? '1.0.0',
      version: report.version,
      target: report.target,
      totalScore: report.totalScore,
      grade: report.grade,
      maturityLevel: report.maturityLevel,
      passed: report.passed,
      minScoreThreshold: report.minScoreThreshold,
      summary: report.summary,
      actionableChecks,
      quickFixes: report.quickFixes,
      ...(diff ? { baselineDiff: diff } : {}),
    },
    null,
    2
  );
}

function formatSarifReport(report: AuditReport): string {
  const rules: Array<Record<string, unknown>> = [];
  const results: Array<Record<string, unknown>> = [];

  for (const pillar of Object.values(report.pillars)) {
    for (const check of pillar.checks) {
      rules.push({
        id: check.id,
        name: check.name,
        shortDescription: { text: check.description },
        fullDescription: { text: check.recommendation ?? check.description },
        defaultConfiguration: {
          level: check.status === 'fail' ? 'error' : check.status === 'warn' ? 'warning' : 'note',
        },
      });

      if (check.status !== 'pass') {
        const messageText = check.recommendation
          ? `${check.details ?? check.name}. Fix: ${check.recommendation}`
          : check.details ?? check.name;

        results.push({
          ruleId: check.id,
          level: check.status === 'fail' ? 'error' : 'warning',
          message: { text: messageText },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: report.target },
              },
            },
          ],
        });
      }
    }
  }

  return JSON.stringify(
    {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'agentprobe',
              version: report.version,
              informationUri: 'https://github.com/AkashPriyadarshii/agentprobe',
              rules,
            },
          },
          results,
        },
      ],
    },
    null,
    2
  );
}

function formatJunitReport(report: AuditReport): string {
  const pillarEntries = Object.entries(report.pillars) as Array<[string, PillarResult]>;
  const totalTests = report.summary.totalChecks;
  const totalFailures = report.summary.failedChecks;
  const durationSeconds = (report.durationMs / 1000).toFixed(3);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="agentprobe" tests="${totalTests}" failures="${totalFailures}" errors="0" time="${durationSeconds}">`
  );

  for (const [key, pillar] of pillarEntries) {
    const suiteFailures = pillar.checks.filter((c) => c.status === 'fail').length;
    lines.push(
      `  <testsuite name="${escapeXml(pillar.name)}" tests="${pillar.checks.length}" failures="${suiteFailures}" skipped="0">`
    );

    for (const check of pillar.checks) {
      lines.push(
        `    <testcase classname="agentprobe.${escapeXml(key)}" name="${escapeXml(check.name)}" time="0">`
      );
      if (check.status === 'fail') {
        const body = [check.details, check.recommendation].filter(Boolean).join('\nFix: ');
        lines.push(
          `      <failure message="${escapeXml(check.details ?? check.name)}" type="fail">${escapeXml(body || check.description)}</failure>`
        );
      } else if (check.status === 'warn') {
        const warnBody = [check.details, check.recommendation].filter(Boolean).join(' | Fix: ');
        lines.push(`      <system-out>${escapeXml(`WARN: ${warnBody || check.name}`)}</system-out>`);
      }
      lines.push('    </testcase>');
    }

    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');
  return lines.join('\n');
}

function formatGitHubAnnotations(report: AuditReport): string {
  const lines: string[] = [];
  for (const pillar of Object.values(report.pillars)) {
    for (const check of pillar.checks) {
      if (check.status === 'pass') continue;
      const level = check.status === 'fail' ? 'error' : 'warning';
      const title = escapeGithubCommandValue(`${check.name} (${check.score}/${check.maxScore})`);
      const details = [check.details, check.recommendation ? `Fix: ${check.recommendation}` : undefined]
        .filter(Boolean)
        .join(' — ');
      lines.push(`::${level} title=${title}::${escapeGithubCommandValue(details || check.description)}`);
    }
  }

  const summaryMsg = `Target: ${report.target} | Score: ${report.totalScore}/100 (${report.grade}) | Min: ${report.minScoreThreshold} | Status: ${report.passed ? 'PASSED' : 'FAILED'}`;
  lines.push(`::notice title=AgentProbe Audit::${escapeGithubCommandValue(summaryMsg)}`);
  return lines.join('\n');
}

function statusRank(status: RuleStatus): number {
  switch (status) {
    case 'fail':
      return 0;
    case 'warn':
      return 1;
    case 'pass':
      return 2;
  }
}

function compareReports(base: AuditReport, head: AuditReport): ReportDiff {
  const pillarDeltas: ReportDiff['pillarDeltas'] = [];
  const regressions: CheckChange[] = [];
  const improvements: CheckChange[] = [];

  for (const [key, headPillar] of Object.entries(head.pillars)) {
    const basePillar = (base.pillars as Record<string, PillarResult | undefined>)[key];
    const basePillarScore = basePillar?.score ?? 0;
    pillarDeltas.push({
      key,
      name: headPillar.name,
      baseScore: basePillarScore,
      headScore: headPillar.score,
      delta: headPillar.score - basePillarScore,
      maxScore: headPillar.maxScore,
    });

    const baseCheckMap = new Map<string, AuditCheck>();
    for (const c of basePillar?.checks ?? []) {
      baseCheckMap.set(c.id, c);
    }

    for (const headCheck of headPillar.checks) {
      const baseCheck = baseCheckMap.get(headCheck.id);
      if (!baseCheck) continue;

      const rankDelta = statusRank(headCheck.status) - statusRank(baseCheck.status);
      const scoreDelta = headCheck.score - baseCheck.score;
      if (rankDelta < 0 || scoreDelta < 0) {
        regressions.push({
          pillar: headPillar.name,
          id: headCheck.id,
          name: headCheck.name,
          baseStatus: baseCheck.status,
          headStatus: headCheck.status,
          baseScore: baseCheck.score,
          headScore: headCheck.score,
          maxScore: headCheck.maxScore,
        });
      } else if (rankDelta > 0 || scoreDelta > 0) {
        improvements.push({
          pillar: headPillar.name,
          id: headCheck.id,
          name: headCheck.name,
          baseStatus: baseCheck.status,
          headStatus: headCheck.status,
          baseScore: baseCheck.score,
          headScore: headCheck.score,
          maxScore: headCheck.maxScore,
        });
      }
    }
  }

  return {
    baseTarget: base.target,
    headTarget: head.target,
    baseScore: base.totalScore,
    headScore: head.totalScore,
    scoreDelta: head.totalScore - base.totalScore,
    baseGrade: base.grade,
    headGrade: head.grade,
    pillarDeltas,
    regressions,
    improvements,
  };
}

function formatDiffText(diff: ReportDiff, noColor: boolean): string {
  const lines: string[] = [];
  const sign = diff.scoreDelta > 0 ? '+' : '';
  const deltaLabel = `${sign}${diff.scoreDelta}`;

  lines.push('');
  lines.push(colorize(noColor, pc.bold, `  AgentProbe Diff: ${diff.baseTarget} -> ${diff.headTarget}`));
  lines.push(
    `  Score: ${diff.baseScore}/100 (${diff.baseGrade}) -> ${diff.headScore}/100 (${diff.headGrade}) [${
      diff.scoreDelta > 0
        ? colorize(noColor, pc.green, deltaLabel)
        : diff.scoreDelta < 0
          ? colorize(noColor, pc.red, deltaLabel)
          : deltaLabel
    }]`
  );
  lines.push('');
  lines.push('  Pillars:');
  for (const p of diff.pillarDeltas) {
    const pSign = p.delta > 0 ? '+' : '';
    lines.push(`    - ${p.name}: ${p.baseScore} -> ${p.headScore}/${p.maxScore} (${pSign}${p.delta})`);
  }

  if (diff.regressions.length > 0) {
    lines.push('');
    lines.push(colorize(noColor, pc.red, `  Regressions (${diff.regressions.length}):`));
    for (const r of diff.regressions) {
      lines.push(
        `    ✖ ${r.name}: ${r.baseStatus.toUpperCase()} (${r.baseScore}/${r.maxScore}) -> ${r.headStatus.toUpperCase()} (${r.headScore}/${r.maxScore})`
      );
    }
  }

  if (diff.improvements.length > 0) {
    lines.push('');
    lines.push(colorize(noColor, pc.green, `  Improvements (${diff.improvements.length}):`));
    for (const imp of diff.improvements) {
      lines.push(
        `    ✔ ${imp.name}: ${imp.baseStatus.toUpperCase()} (${imp.baseScore}/${imp.maxScore}) -> ${imp.headStatus.toUpperCase()} (${imp.headScore}/${imp.maxScore})`
      );
    }
  }

  if (diff.regressions.length === 0 && diff.improvements.length === 0) {
    lines.push('');
    lines.push('  No check-level changes detected.');
  }

  lines.push('');
  return lines.join('\n');
}

function readReportFile(filePath: string): AuditReport {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Report file not found: ${resolved}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in report file ${resolved}: ${msg}`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as AuditReport).totalScore !== 'number' ||
    !(parsed as AuditReport).pillars
  ) {
    throw new Error(`Invalid AgentProbe report JSON in ${resolved}`);
  }
  return parsed as AuditReport;
}

const program = new Command();

program
  .name('agentprobe')
  .description('The open-source Lighthouse for AI Agents. Audit agentic web readiness, llms.txt, crawler access, and DOM actionability.')
  .version('0.0.2', '-v, --version', 'Output current agentprobe version')
  .argument('[target]', 'Target URL (https://example.com) or static build directory (./dist)')
  .option('--json', 'Output machine-readable JSON to stdout')
  .option('--plain', 'Output structured plain text for AI agents and scripts')
  .option('--summary', 'Output GitHub Step Summary Markdown')
  .option('--format <type>', 'Output format (terminal|json|plain|agent|summary|sarif|junit|github)')
  .option('--output <path>', 'Write formatted report output to a file')
  .option('--profile <type>', 'Audit profile (default|strict|lenient)')
  .option('--header <k:v>', 'Custom HTTP header for remote requests (repeatable)', collectHeader, [])
  .option('--baseline <file>', 'Compare current audit against a saved baseline JSON report')
  .option('--save-baseline <file>', 'Save the current JSON audit report as a baseline file')
  .option('--min-score <number>', 'Minimum required readiness score to pass CI gate', '80')
  .option('--no-color', 'Disable ANSI colors in terminal output')
  .option('-q, --quiet', 'Suppress non-essential output')
  .action(async (target, options) => {
    if (!target) {
      program.help();
      return;
    }

    let noColor = resolveNoColor(options.color);

    try {
      const isUrl = target.startsWith('http://') || target.startsWith('https://');
      const config = loadConfig(isUrl ? undefined : target);
      noColor = resolveNoColor(options.color, config.noColor);
      const quiet = Boolean(options.quiet ?? config.quiet);

      const minScoreSource = program.getOptionValueSource('minScore');
      const rawMinScore =
        minScoreSource === 'cli'
          ? options.minScore
          : config.minScore ?? options.minScore;
      const minScore = parseMinScore(rawMinScore);

      let format = options.format ?? (
        options.json
          ? 'json'
          : options.plain
            ? 'plain'
            : options.summary
              ? 'summary'
              : config.format ?? (config.json ? 'json' : config.plain ? 'plain' : config.summary ? 'summary' : 'terminal')
      );
      format = String(format).toLowerCase();

      if (!VALID_FORMATS.has(format)) {
        const errText = `Invalid format "${format}". Expected one of: ${Array.from(VALID_FORMATS).join(', ')}`;
        process.stderr.write(colorize(noColor, pc.red, `\n  ✖ Error: ${errText}\n\n`));
        process.exit(2);
      }

      const outputPath: string | undefined = options.output ?? config.output;
      const profile: string | undefined = options.profile ?? config.profile;

      const cliHeaders = parseHeaders(Array.isArray(options.header) ? options.header : []);
      const headers =
        config.headers || Object.keys(cliHeaders).length > 0
          ? { ...(config.headers ?? {}), ...cliHeaders }
          : undefined;

      const isMachineFormat = ['json', 'plain', 'agent', 'sarif', 'junit'].includes(format);
      if (!isMachineFormat && !quiet) {
        process.stderr.write(colorize(noColor, pc.dim, `\n  🔍 Probing agent readiness for ${target}...\n`));
      }

      const report = await auditTarget(target, {
        minScore: minScoreSource === 'cli' || config.minScore !== undefined ? minScore : undefined,
        json: format === 'json',
        plain: format === 'plain',
        summary: format === 'summary',
        quiet,
        noColor,
        format,
        output: outputPath,
        profile,
        headers,
      });

      const baselineDiff = options.baseline
        ? compareReports(readReportFile(options.baseline), report)
        : undefined;

      if (options.saveBaseline) {
        const baselineDest = path.resolve(options.saveBaseline);
        fs.mkdirSync(path.dirname(baselineDest), { recursive: true });
        fs.writeFileSync(baselineDest, formatJsonReport(report) + '\n', 'utf-8');
        if (!quiet && !isMachineFormat) {
          process.stderr.write(colorize(noColor, pc.dim, `  💾 Saved baseline to ${baselineDest}\n`));
        }
      }

      let rendered: string;
      switch (format) {
        case 'json':
          rendered = formatJsonReport(report);
          break;
        case 'plain':
          rendered = formatPlainReport(report);
          break;
        case 'summary':
          rendered = formatGitHubStepSummary(report);
          break;
        case 'agent':
          rendered = formatAgentReport(report, baselineDiff);
          break;
        case 'sarif':
          rendered = formatSarifReport(report);
          break;
        case 'junit':
          rendered = formatJunitReport(report);
          break;
        case 'github':
          rendered = formatGitHubAnnotations(report);
          break;
        case 'terminal':
        default: {
          const term = formatTerminalReport(report);
          rendered = noColor ? stripAnsi(term) : term;
          break;
        }
      }

      if (baselineDiff && format !== 'agent') {
        if (format === 'terminal' || format === 'plain') {
          rendered += '\n' + formatDiffText(baselineDiff, noColor || format === 'plain');
        } else if (format === 'summary') {
          const sign = baselineDiff.scoreDelta > 0 ? '+' : '';
          rendered += `\n### 📊 Baseline Comparison\n- **Score Delta:** ${baselineDiff.baseScore} → ${baselineDiff.headScore} (${sign}${baselineDiff.scoreDelta})\n- **Regressions:** ${baselineDiff.regressions.length}\n- **Improvements:** ${baselineDiff.improvements.length}\n`;
        } else if (format === 'github') {
          const sign = baselineDiff.scoreDelta > 0 ? '+' : '';
          rendered += `\n::notice title=Baseline Comparison::Score: ${baselineDiff.baseScore} -> ${baselineDiff.headScore} (${sign}${baselineDiff.scoreDelta}) | Regressions: ${baselineDiff.regressions.length} | Improvements: ${baselineDiff.improvements.length}`;
        } else if (!quiet) {
          process.stderr.write(formatDiffText(baselineDiff, noColor));
        }
      }

      if (outputPath) {
        const dest = path.resolve(outputPath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, rendered + '\n', 'utf-8');
        if (!quiet) {
          process.stderr.write(colorize(noColor, pc.dim, `  📄 Wrote ${format} report to ${dest}\n`));
        }
      } else {
        process.stdout.write(rendered + '\n');
      }

      // Exit code 0 if score meets threshold, 1 if below threshold
      process.exit(report.passed ? 0 : 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(colorize(noColor, pc.red, `\n  ✖ Error: ${msg}\n\n`));
      process.exit(2);
    }
  });

program
  .command('diff <base> <head>')
  .description('Compare two saved AgentProbe JSON audit reports')
  .option('--json', 'Output diff as JSON')
  .option('--no-color', 'Disable ANSI colors in terminal output')
  .action((basePath, headPath, options) => {
    const noColor = resolveNoColor(options.color);
    try {
      const baseReport = readReportFile(basePath);
      const headReport = readReportFile(headPath);
      const diff = compareReports(baseReport, headReport);

      if (options.json) {
        process.stdout.write(JSON.stringify(diff, null, 2) + '\n');
      } else {
        process.stdout.write(formatDiffText(diff, noColor) + '\n');
      }
      process.exit(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(colorize(noColor, pc.red, `\n  ✖ Error: ${msg}\n\n`));
      process.exit(2);
    }
  });

program
  .command('init')
  .description('Scaffold a compliant llms.txt and AI-friendly robots.txt in your public or root directory')
  .option('--name <name>', 'Project name')
  .option('--description <desc>', 'Project description')
  .action((options) => {
    const noColor = resolveNoColor(true);
    try {
      const { createdFiles } = scaffoldAgentManifests(options);
      if (createdFiles.length === 0) {
        process.stdout.write(colorize(noColor, pc.green, '  ✔ All agent readiness manifests (llms.txt, robots.txt) already exist.\n'));
      } else {
        process.stdout.write(colorize(noColor, pc.green, '\n  ✔ Successfully created agent readiness manifests:\n'));
        for (const file of createdFiles) {
          process.stdout.write(`    • ${colorize(noColor, pc.cyan, file)}\n`);
        }
        process.stdout.write(colorize(noColor, pc.dim, '\n  Next: run "agentprobe <url>" to audit your score.\n\n'));
      }
      process.exit(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(colorize(noColor, pc.red, `\n  ✖ Error: ${msg}\n\n`));
      process.exit(2);
    }
  });

program.parse(process.argv);
