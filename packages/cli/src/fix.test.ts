import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CheckResult } from '@envpreflight/core';
import { planFixes, runFixes } from './fix.js';

describe('Safe --fix implementation', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-fix-test-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleResults: CheckResult[] = [
    {
      id: 'runtime.node',
      label: 'Node.js',
      severity: 'fail',
      expected: '20.0.0',
      actual: '18.0.0',
      message: 'Node.js mismatch',
      fix: 'nvm install 20',
    },
    {
      id: 'ports.3000',
      label: 'Port 3000',
      severity: 'fail',
      message: 'Port 3000 in use',
      fix: 'kill 1234',
    },
    {
      id: 'env.PORT',
      label: 'Environment PORT',
      severity: 'fail',
      message: 'Missing PORT in .env',
      fix: 'echo "PORT=3000" >> .env',
    },
  ];

  it('classifies fixes into install, kill, env and maps reversibility', () => {
    const plan = planFixes(sampleResults);
    expect(plan.length).toBe(3);

    expect(plan[0].kind).toBe('install');
    expect(plan[0].reversible).toBe('manual');

    expect(plan[1].kind).toBe('kill');
    expect(plan[1].reversible).toBe('no');

    expect(plan[2].kind).toBe('env');
    expect(plan[2].reversible).toBe('yes');
  });

  it('--fix --dry-run prints plan table and executes nothing', async () => {
    const executed: string[] = [];
    const exitCode = await runFixes(sampleResults, {
      cwd: tempDir,
      dryRun: true,
      executor: async (cmd) => {
        executed.push(cmd);
        return { exitCode: 0 };
      },
    });

    expect(exitCode).toBe(0);
    expect(executed).toEqual([]);
    const logs = logSpy.mock.calls.flat().join('\n');
    expect(logs).toContain('Node.js');
    expect(logs).toContain('Port 3000');
    expect(logs).toContain('Environment PORT');
  });

  it('--fix without TTY returns exit code 2 with helpful message', async () => {
    const exitCode = await runFixes(sampleResults, {
      cwd: tempDir,
      isTTY: false,
    });

    expect(exitCode).toBe(2);
    const errors = errorSpy.mock.calls.flat().join('\n');
    expect(errors).toContain('--fix needs an interactive terminal; use --dry-run or --fix --yes');
  });

  it('--fix --yes runs non-kill items automatically', async () => {
    const executed: string[] = [];
    const exitCode = await runFixes(sampleResults, {
      cwd: tempDir,
      yes: true,
      isTTY: false,
      executor: async (cmd) => {
        executed.push(cmd);
        return { exitCode: 0 };
      },
    });

    expect(exitCode).toBe(0);
    expect(executed).toContain('nvm install 20');
    expect(executed).toContain('echo "PORT=3000" >> .env');
    expect(executed).not.toContain('kill 1234');
  });

  it('runs selected items from prompt like "1,3" and skips unselected', async () => {
    const executed: string[] = [];
    const exitCode = await runFixes(sampleResults, {
      cwd: tempDir,
      isTTY: true,
      promptFn: async () => '1,3',
      executor: async (cmd) => {
        executed.push(cmd);
        return { exitCode: 0 };
      },
    });

    expect(exitCode).toBe(0);
    expect(executed).toEqual(['nvm install 20', 'echo "PORT=3000" >> .env']);
  });

  it('appends fix logs to .envpreflight/last-fix.jsonl and adds .envpreflight/ to .gitignore', async () => {
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n');

    await runFixes([sampleResults[0]], {
      cwd: tempDir,
      yes: true,
      executor: async () => ({ exitCode: 0 }),
    });

    const logFile = path.join(tempDir, '.envpreflight', 'last-fix.jsonl');
    const logContent = await fs.readFile(logFile, 'utf-8');
    const lines = logContent.trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.command).toBe('nvm install 20');
    expect(parsed.kind).toBe('install');

    const gitignoreContent = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(gitignoreContent).toContain('.envpreflight/');
  });

  it('stops on first failure unless --continue is passed', async () => {
    const executed: string[] = [];
    const exitCode = await runFixes(sampleResults, {
      cwd: tempDir,
      yes: true,
      isTTY: true,
      promptFn: async () => 'y', // confirm kill if asked
      executor: async (cmd) => {
        executed.push(cmd);
        if (cmd === 'nvm install 20') {
          return { exitCode: 1, error: 'Command failed' };
        }
        return { exitCode: 0 };
      },
    });

    expect(exitCode).toBe(1);
    expect(executed).toEqual(['nvm install 20']);
  });
});
