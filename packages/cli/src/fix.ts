import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import pc from 'picocolors';
import type { CheckResult } from '@envpreflight/core';

export type FixKind = 'install' | 'kill' | 'env' | 'other';

export interface PlannedFix {
  index: number;
  checkId: string;
  label: string;
  command: string;
  kind: FixKind;
  reversible: 'yes' | 'no' | 'manual';
  undoData?: {
    envKey?: string;
    envValue?: string;
    filePath?: string;
  };
}

export interface FixLogEntry {
  ts: string;
  check: string;
  command: string;
  exitCode: number;
  kind: FixKind;
  undo?: any;
}

export interface FixOptions {
  cwd?: string;
  dryRun?: boolean;
  yes?: boolean;
  continue?: boolean;
  isTTY?: boolean;
  promptFn?: (question: string) => Promise<string>;
  executor?: (command: string, cwd: string) => Promise<{ exitCode: number; error?: string }>;
}

export function classifyFix(check: CheckResult): { kind: FixKind; reversible: 'yes' | 'no' | 'manual'; undoData?: any } {
  const fix = check.fix || '';
  const id = check.id.toLowerCase();

  // Env
  if (id.startsWith('env') || id.includes(':env.') || fix.includes('.env')) {
    const match = fix.match(/["']?([A-Z0-9_]+)=([^"'\n\r]*)["']?/);
    return {
      kind: 'env',
      reversible: 'yes',
      undoData: {
        envKey: match ? match[1] : undefined,
        envValue: match ? match[2] : undefined,
        filePath: '.env',
      },
    };
  }

  // Kill
  if (
    fix.toLowerCase().includes('kill') ||
    fix.toLowerCase().includes('stop-process') ||
    fix.toLowerCase().includes('taskkill') ||
    fix.toLowerCase().includes('fuser')
  ) {
    return { kind: 'kill', reversible: 'no' };
  }

  // Install
  if (
    fix.includes('install') ||
    fix.includes('compose up') ||
    fix.includes('brew') ||
    fix.includes('pyenv') ||
    fix.includes('nvm') ||
    fix.includes('mise') ||
    fix.includes('rustup')
  ) {
    return { kind: 'install', reversible: 'manual' };
  }

  return { kind: 'other', reversible: 'no' };
}

export function planFixes(results: CheckResult[]): PlannedFix[] {
  const fixable = results.filter((r) => r.fix && (r.severity === 'fail' || r.severity === 'warn'));
  return fixable.map((r, i) => {
    const classification = classifyFix(r);
    return {
      index: i + 1,
      checkId: r.id,
      label: r.label,
      command: r.fix!,
      kind: classification.kind,
      reversible: classification.reversible,
      undoData: classification.undoData,
    };
  });
}

function printPlanTable(plan: PlannedFix[]): void {
  console.log('\n#  | Check                      | Command                        | Reversible?');
  console.log('---|----------------------------|--------------------------------|------------');
  for (const item of plan) {
    const idx = String(item.index).padEnd(2);
    const label = item.label.slice(0, 26).padEnd(26);
    const cmd = item.command.slice(0, 30).padEnd(30);
    const rev = item.reversible.padEnd(11);
    console.log(`${idx} | ${label} | ${cmd} | ${rev}`);
  }
  console.log('');
}

async function defaultExecute(command: string, cwd: string): Promise<{ exitCode: number; error?: string }> {
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'powershell' : 'sh';
  const shellArgs = isWin ? ['-NoProfile', '-Command', command] : ['-c', command];

  return new Promise((resolve) => {
    const child = spawn(shell, shellArgs, { cwd, stdio: 'inherit' });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 0 });
    });
    child.on('error', (err) => {
      resolve({ exitCode: 1, error: err.message });
    });
  });
}

async function ensureGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes('.envpreflight/')) {
      await fs.writeFile(gitignorePath, content.trimEnd() + '\n.envpreflight/\n');
    }
  } catch {
    console.log(pc.dim('Note: .envpreflight/ is created locally; add it to your .gitignore.'));
  }
}

async function appendFixLog(cwd: string, entry: FixLogEntry): Promise<void> {
  const dotDir = path.join(cwd, '.envpreflight');
  await fs.mkdir(dotDir, { recursive: true });
  await ensureGitignore(cwd);
  const logFile = path.join(dotDir, 'last-fix.jsonl');
  await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
}

export async function runFixes(results: CheckResult[], options: FixOptions = {}): Promise<number> {
  const plan = planFixes(results);
  if (plan.length === 0) {
    console.log(pc.green('\nNo automated fixes available.'));
    return 0;
  }

  const cwd = options.cwd || process.cwd();
  const isTTY = options.isTTY ?? Boolean(process.stdin.isTTY);

  // 1. Dry run
  if (options.dryRun) {
    printPlanTable(plan);
    return 0;
  }

  // 2. Non-TTY without --yes
  if (!isTTY && !options.yes) {
    console.error(pc.red('Error: --fix needs an interactive terminal; use --dry-run or --fix --yes'));
    return 2;
  }

  printPlanTable(plan);

  let selectedIndices: number[] = [];

  const prompt = options.promptFn || (async (q: string) => {
    const rl = readline.createInterface({ input, output });
    try {
      return await rl.question(q);
    } finally {
      rl.close();
    }
  });

  if (options.yes) {
    for (const item of plan) {
      if (item.kind === 'kill') {
        if (!isTTY) {
          console.log(pc.yellow(`Skipping kill command without interactive confirmation: ${item.command}`));
        } else {
          const ans = await prompt(pc.yellow(`Kill process ${item.command}? (y/N): `));
          if (ans.trim().toLowerCase() === 'y') {
            selectedIndices.push(item.index);
          }
        }
      } else {
        selectedIndices.push(item.index);
      }
    }
  } else {
    const response = await prompt(pc.yellow('Run 1,3 / all / none? '));
    const trimmed = response.trim().toLowerCase();
    if (!trimmed || trimmed === 'n' || trimmed === 'none') {
      console.log(pc.dim('No fixes executed.'));
      return 0;
    }
    if (trimmed === 'a' || trimmed === 'all') {
      selectedIndices = plan.map((p) => p.index);
    } else {
      const parts = trimmed.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      selectedIndices = parts;
    }
  }

  const itemsToRun = plan.filter((p) => selectedIndices.includes(p.index));
  if (itemsToRun.length === 0) {
    return 0;
  }

  const executor = options.executor || defaultExecute;
  let overallFailed = false;

  for (const item of itemsToRun) {
    console.log(pc.dim(`\nRunning [${item.index}/${plan.length}]: ${item.command}...`));
    const result = await executor(item.command, cwd);
    const logEntry: FixLogEntry = {
      ts: new Date().toISOString(),
      check: item.checkId,
      command: item.command,
      exitCode: result.exitCode,
      kind: item.kind,
      undo: item.undoData,
    };
    await appendFixLog(cwd, logEntry);

    if (result.exitCode === 0) {
      console.log(pc.green(`✓ Fix succeeded: ${item.label}`));
    } else {
      overallFailed = true;
      console.error(pc.red(`✗ Fix failed with code ${result.exitCode}: ${item.label}`));
      if (!options.continue) {
        console.log(pc.dim('Stopping on first failure. Use --continue to proceed despite errors.'));
        break;
      }
    }
  }

  return overallFailed ? 1 : 0;
}

export async function runInteractiveFixes(results: CheckResult[]): Promise<void> {
  await runFixes(results);
}
