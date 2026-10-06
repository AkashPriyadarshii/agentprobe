import { Command } from 'commander';
import fs from 'node:fs';
import pc from 'picocolors';
import { auditTarget } from './core/runner.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { formatJsonReport } from './reporters/json.js';
import { formatGitHubStepSummary } from './reporters/summary.js';
import { scaffoldAgentManifests } from './scaffolder/init.js';

const program = new Command();

program
  .name('agentprobe')
  .description('The open-source Lighthouse for AI Agents. Audit agentic web readiness, llms.txt, crawler access, and DOM actionability.')
  .version('0.0.1', '-v, --version', 'Output current agentprobe version')
  .argument('[target]', 'Target URL (https://example.com) or static build directory (./dist)')
  .option('--json', 'Output machine-readable JSON to stdout')
  .option('--summary', 'Output GitHub Step Summary Markdown')
  .option('--min-score <number>', 'Minimum required readiness score to pass CI gate', '80')
  .option('--no-color', 'Disable ANSI colors in terminal output')
  .option('-q, --quiet', 'Suppress non-essential output')
  .action(async (target, options) => {
    if (!target) {
      program.help();
      return;
    }

    const minScore = Number.parseInt(options.minScore, 10) || 80;

    try {
      if (!options.json && !options.quiet) {
        process.stderr.write(pc.dim(`\n  🔍 Probing agent readiness for ${target}...\n`));
      }

      const report = await auditTarget(target, {
        minScore,
        json: options.json,
        quiet: options.quiet,
      });

      if (options.json) {
        process.stdout.write(formatJsonReport(report) + '\n');
      } else if (options.summary) {
        process.stdout.write(formatGitHubStepSummary(report) + '\n');
      } else {
        process.stdout.write(formatTerminalReport(report) + '\n');
      }

      // Exit code 0 if score meets threshold, 1 if below threshold
      process.exit(report.passed ? 0 : 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(pc.red(`\n  ✖ Error: ${msg}\n\n`));
      process.exit(2);
    }
  });

program
  .command('init')
  .description('Scaffold a compliant llms.txt and AI-friendly robots.txt in your public or root directory')
  .option('--name <name>', 'Project name')
  .option('--description <desc>', 'Project description')
  .action((options) => {
    try {
      const { createdFiles } = scaffoldAgentManifests(options);
      if (createdFiles.length === 0) {
        process.stdout.write(pc.green('  ✔ All agent readiness manifests (llms.txt, robots.txt) already exist.\n'));
      } else {
        process.stdout.write(pc.green('\n  ✔ Successfully created agent readiness manifests:\n'));
        for (const file of createdFiles) {
          process.stdout.write(`    • ${pc.cyan(file)}\n`);
        }
        process.stdout.write(pc.dim('\n  Next: run "agentprobe <url>" to audit your score.\n\n'));
      }
      process.exit(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(pc.red(`\n  ✖ Error: ${msg}\n\n`));
      process.exit(2);
    }
  });

program.parse(process.argv);
