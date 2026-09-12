import * as fs from 'node:fs/promises';
import { Command } from 'commander';
import { runAllChecks, loadConfig, type Report, type EnvpreflightConfig } from '@envpreflight/core';
import { renderReport, renderGitHubAnnotations, renderGitHubStepSummary } from './render.js';
import { runFixes } from './fix.js';
import { runUndo } from './undo.js';
import { runInit } from './init.js';

export * from './render.js';
export * from './fix.js';
export * from './undo.js';
export * from './init.js';

export interface CliOptions {
  format?: 'terminal' | 'json' | 'github';
  json?: boolean;
  only?: string;
  skip?: string;
  fix?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  continue?: boolean;
  quiet?: boolean;
  cwd?: string;
  workspaces?: boolean;
  workspace?: string;
}

export function createCli(): Command {
  const program = new Command('envpreflight');

  program
    .version('1.1.0')
    .description('Check your machine can actually run this project — before you waste a day finding out it can\'t.')
    .option('--format <type>', 'Output format: terminal, json, github (default: terminal)')
    .option('--json', 'Output full Report as machine-readable JSON (alias for --format json)')
    .option('--only <ids>', 'Run only specified check IDs or categories (comma-separated)')
    .option('--skip <ids>', 'Skip specified check IDs or categories (comma-separated)')
    .option('--fix', 'Review and run suggested fixes')
    .option('--dry-run', 'Print the fix plan without executing any commands (with --fix)')
    .option('--yes', 'Run fixes without prompting, except process kills (with --fix)')
    .option('--continue', 'Continue running remaining fixes if one fails')
    .option('--no-workspaces', 'Disable automatic monorepo workspace discovery')
    .option('--workspace <dir>', 'Run checks for a specific workspace directory only')
    .option('-q, --quiet', 'Display failures and warnings only')
    .option('--cwd <path>', 'Target directory to check', process.cwd())
    .action(async (opts: CliOptions) => {
      const targetDir = opts.cwd || process.cwd();
      const format = opts.json ? 'json' : (opts.format || 'terminal');

      let fileConfig: EnvpreflightConfig | null = null;
      try {
        fileConfig = loadConfig(targetDir);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 2;
        return;
      }

      if (fileConfig && !opts.quiet && format !== 'json') {
        process.stderr.write(`config: ${fileConfig.configPath}\n`);
      }

      const onlyList = opts.only
        ? opts.only.split(',').map((s) => s.trim())
        : fileConfig?.only;
      const skipList = opts.skip
        ? opts.skip.split(',').map((s) => s.trim())
        : fileConfig?.skip;
      const workspaces = opts.workspaces !== undefined
        ? opts.workspaces
        : fileConfig?.workspaces;

      const report = await runAllChecks(targetDir, {
        only: onlyList,
        skip: skipList,
        workspaces,
        workspace: opts.workspace,
      });

      if (report.results.length === 0) {
        if (format === 'json') {
          console.log(JSON.stringify(report, null, 2));
        } else if (format === 'terminal') {
          console.log(
            `No recognized project manifests found in ${targetDir}. envpreflight works from the project root.`
          );
        }
        process.exitCode = 0;
        return;
      }

      if (format === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else if (format === 'github') {
        const annotations = renderGitHubAnnotations(report);
        if (annotations) {
          console.log(annotations);
        }
        if (process.env.GITHUB_STEP_SUMMARY) {
          try {
            const summary = renderGitHubStepSummary(report);
            await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
          } catch {}
        }
      } else {
        const rendered = renderReport(report, {
          quiet: opts.quiet,
        });
        console.log(rendered);

        if (opts.fix) {
          const fixExit = await runFixes(report.results, {
            cwd: targetDir,
            dryRun: opts.dryRun,
            yes: opts.yes,
            continue: opts.continue,
          });
          if (opts.dryRun) {
            process.exitCode = 0;
            return;
          }
          if (fixExit !== 0) {
            process.exitCode = fixExit;
            return;
          }
        }
      }

      process.exitCode = report.exitCode;
    });

  program
    .command('undo')
    .description('Revert automatic fixes performed by envpreflight')
    .option('--cwd <path>', 'Target directory to undo', process.cwd())
    .action(async (cmdOpts: { cwd?: string }) => {
      const exitCode = await runUndo({ cwd: cmdOpts.cwd || process.cwd() });
      process.exitCode = exitCode;
    });

  program
    .command('init')
    .description('Initialize a .envpreflightrc.json configuration file')
    .option('--force', 'Overwrite existing configuration file')
    .option('--cwd <path>', 'Target directory', process.cwd())
    .action(async (cmdOpts: { cwd?: string; force?: boolean }) => {
      const exitCode = await runInit({ cwd: cmdOpts.cwd || process.cwd(), force: cmdOpts.force });
      process.exitCode = exitCode;
    });

  return program;
}
