import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverWorkspaces } from './workspaces.js';

describe('discoverWorkspaces', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-ws-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns empty array when no workspace manifest exists', async () => {
    const ws = await discoverWorkspaces(tempDir);
    expect(ws).toEqual([]);
  });

  it('discovers packages from pnpm-workspace.yaml globs', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:
  - 'packages/*'
  - 'apps/**'
`
    );

    await fs.mkdir(path.join(tempDir, 'packages', 'pkg-a'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'packages', 'pkg-a', 'package.json'), JSON.stringify({ name: 'pkg-a' }));

    await fs.mkdir(path.join(tempDir, 'packages', 'pkg-b'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'packages', 'pkg-b', 'package.json'), JSON.stringify({ name: 'pkg-b' }));

    await fs.mkdir(path.join(tempDir, 'apps', 'web'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'apps', 'web', 'package.json'), JSON.stringify({ name: 'web' }));

    const ws = await discoverWorkspaces(tempDir);
    expect(ws).toEqual(['apps/web', 'packages/pkg-a', 'packages/pkg-b']);
  });

  it('discovers packages from package.json workspaces array', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'root',
        workspaces: ['packages/*'],
      })
    );

    await fs.mkdir(path.join(tempDir, 'packages', 'core'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'packages', 'core', 'package.json'), JSON.stringify({ name: 'core' }));

    const ws = await discoverWorkspaces(tempDir);
    expect(ws).toEqual(['packages/core']);
  });

  it('never traverses into node_modules even if glob matches', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:
  - 'packages/**'
`
    );

    await fs.mkdir(path.join(tempDir, 'packages', 'my-pkg', 'node_modules', 'nested-dep'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'packages', 'my-pkg', 'package.json'), JSON.stringify({ name: 'my-pkg' }));
    await fs.writeFile(path.join(tempDir, 'packages', 'my-pkg', 'node_modules', 'nested-dep', 'package.json'), JSON.stringify({ name: 'nested-dep' }));

    const ws = await discoverWorkspaces(tempDir);
    expect(ws).toEqual(['packages/my-pkg']);
    expect(ws.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('caps at 50 packages when more than 50 packages exist', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:
  - 'packages/*'
`
    );

    for (let i = 1; i <= 60; i++) {
      const dirName = `pkg-${String(i).padStart(3, '0')}`;
      await fs.mkdir(path.join(tempDir, 'packages', dirName), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'packages', dirName, 'package.json'), JSON.stringify({ name: dirName }));
    }

    const ws = await discoverWorkspaces(tempDir);
    expect(ws.length).toBe(50);
  });
});
