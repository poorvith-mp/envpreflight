import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runInit } from './init.js';

describe('envpreflight init command', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-init-test-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('generates .envpreflightrc.json with _comment keys and detected configuration', async () => {
    await fs.writeFile(path.join(tempDir, '.env.example'), 'PORT=3000\n');

    const exitCode = await runInit({ cwd: tempDir });
    expect(exitCode).toBe(0);

    const configPath = path.join(tempDir, '.envpreflightrc.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.version).toBe(1);
    expect(parsed._comment_skip).toBeDefined();
    expect(parsed._comment_workspaces).toBeDefined();
    expect(parsed.ports).toContain(3000);
  });

  it('exits with code 2 if config file already exists without --force', async () => {
    const configPath = path.join(tempDir, '.envpreflightrc.json');
    await fs.writeFile(configPath, JSON.stringify({ version: 1 }));

    const exitCode = await runInit({ cwd: tempDir });
    expect(exitCode).toBe(2);
    const errors = errorSpy.mock.calls.flat().join('\n');
    expect(errors).toContain('already exists, use --force');
  });

  it('overwrites existing config file when --force is passed', async () => {
    const configPath = path.join(tempDir, '.envpreflightrc.json');
    await fs.writeFile(configPath, JSON.stringify({ version: 0, old: true }));

    const exitCode = await runInit({ cwd: tempDir, force: true });
    expect(exitCode).toBe(0);

    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(parsed.old).toBeUndefined();
  });
});
