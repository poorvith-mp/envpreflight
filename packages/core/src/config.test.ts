import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, findGitRoot } from './config.js';

describe('Config walk-up and loader (.envpreflightrc.json)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-cfg-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns null when no config exists', () => {
    const config = loadConfig(tempDir);
    expect(config).toBeNull();
  });

  it('loads config from cwd', async () => {
    const cfgData = {
      version: 1,
      skip: ['ports', 'docker'],
      workspaces: true,
    };
    await fs.writeFile(path.join(tempDir, '.envpreflightrc.json'), JSON.stringify(cfgData));

    const config = loadConfig(tempDir);
    expect(config).toBeDefined();
    expect(config?.skip).toEqual(['ports', 'docker']);
    expect(config?.workspaces).toBe(true);
  });

  it('walks up to parent directory when inside a git repo', async () => {
    await fs.mkdir(path.join(tempDir, '.git'));
    await fs.writeFile(
      path.join(tempDir, '.envpreflightrc.json'),
      JSON.stringify({ version: 1, skip: ['docker'] })
    );

    const subDir = path.join(tempDir, 'packages', 'web');
    await fs.mkdir(subDir, { recursive: true });

    const config = loadConfig(subDir);
    expect(config).toBeDefined();
    expect(config?.skip).toEqual(['docker']);
  });

  it('nearest config wins when both parent and child have config', async () => {
    await fs.mkdir(path.join(tempDir, '.git'));
    await fs.writeFile(
      path.join(tempDir, '.envpreflightrc.json'),
      JSON.stringify({ version: 1, skip: ['root-skip'] })
    );

    const subDir = path.join(tempDir, 'packages', 'web');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, '.envpreflightrc.json'),
      JSON.stringify({ version: 1, skip: ['child-skip'] })
    );

    const config = loadConfig(subDir);
    expect(config).toBeDefined();
    expect(config?.skip).toEqual(['child-skip']);
  });

  it('throws an error with file path on invalid JSON', async () => {
    const cfgPath = path.join(tempDir, '.envpreflightrc.json');
    await fs.writeFile(cfgPath, '{ invalid json');

    expect(() => loadConfig(tempDir)).toThrowError(/Failed to parse .envpreflightrc.json/);
  });
});
