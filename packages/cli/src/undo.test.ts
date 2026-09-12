import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runUndo } from './undo.js';

describe('envpreflight undo command', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-undo-test-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('removes .env key only when the value is still the original placeholder', async () => {
    const envPath = path.join(tempDir, '.env');
    await fs.writeFile(envPath, 'EXISTING=true\nPORT=3000\nOTHER=foo\n');

    const dotDir = path.join(tempDir, '.envpreflight');
    await fs.mkdir(dotDir, { recursive: true });
    const logEntry = {
      ts: new Date().toISOString(),
      check: 'env.PORT',
      command: 'echo "PORT=3000" >> .env',
      exitCode: 0,
      kind: 'env',
      undo: { envKey: 'PORT', envValue: '3000', filePath: '.env' },
    };
    await fs.writeFile(path.join(dotDir, 'last-fix.jsonl'), JSON.stringify(logEntry) + '\n');

    const exitCode = await runUndo({ cwd: tempDir });
    expect(exitCode).toBe(0);

    const updatedEnv = await fs.readFile(envPath, 'utf-8');
    expect(updatedEnv).not.toContain('PORT=3000');
    expect(updatedEnv).toContain('EXISTING=true');
    expect(updatedEnv).toContain('OTHER=foo');
  });

  it('preserves .env key if the user modified the placeholder value', async () => {
    const envPath = path.join(tempDir, '.env');
    await fs.writeFile(envPath, 'PORT=8080\n');

    const dotDir = path.join(tempDir, '.envpreflight');
    await fs.mkdir(dotDir, { recursive: true });
    const logEntry = {
      ts: new Date().toISOString(),
      check: 'env.PORT',
      command: 'echo "PORT=3000" >> .env',
      exitCode: 0,
      kind: 'env',
      undo: { envKey: 'PORT', envValue: '3000', filePath: '.env' },
    };
    await fs.writeFile(path.join(dotDir, 'last-fix.jsonl'), JSON.stringify(logEntry) + '\n');

    const exitCode = await runUndo({ cwd: tempDir });
    expect(exitCode).toBe(0);

    const envContent = await fs.readFile(envPath, 'utf-8');
    expect(envContent).toContain('PORT=8080'); // Kept because user modified it!
  });

  it('prints manual undo instructions for installs and refuses process kills', async () => {
    const dotDir = path.join(tempDir, '.envpreflight');
    await fs.mkdir(dotDir, { recursive: true });
    const entries = [
      {
        ts: new Date().toISOString(),
        check: 'runtime.node',
        command: 'nvm install 20',
        exitCode: 0,
        kind: 'install',
      },
      {
        ts: new Date().toISOString(),
        check: 'ports.3000',
        command: 'kill 1234',
        exitCode: 0,
        kind: 'kill',
      },
    ];
    await fs.writeFile(path.join(dotDir, 'last-fix.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');

    const exitCode = await runUndo({ cwd: tempDir });
    expect(exitCode).toBe(0);

    const logs = logSpy.mock.calls.flat().join('\n');
    expect(logs).toContain('Manual undo');
    expect(logs).toContain('cannot undo process kill');
  });
});
