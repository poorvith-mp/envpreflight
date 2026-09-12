import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAllChecks } from './index.js';

describe('monorepo workspace integration in runAllChecks', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-index-ws-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('runs runtime & env checks for workspaces with prefixed ids', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:
  - 'packages/*'
`
    );
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'monorepo-root' }));

    // Package A
    const pkgADir = path.join(tempDir, 'packages', 'pkg-a');
    await fs.mkdir(pkgADir, { recursive: true });
    await fs.writeFile(path.join(pkgADir, 'package.json'), JSON.stringify({ name: 'pkg-a', engines: { node: '>=20.0.0' } }));

    // Package B
    const pkgBDir = path.join(tempDir, 'packages', 'pkg-b');
    await fs.mkdir(pkgBDir, { recursive: true });
    await fs.writeFile(path.join(pkgBDir, 'package.json'), JSON.stringify({ name: 'pkg-b', engines: { node: '>=18.0.0' } }));

    const report = await runAllChecks(tempDir, {
      runtimeExecutors: { node: async () => 'v20.11.0' },
      skip: ['services', 'docker', 'ports'],
    });

    const aNode = report.results.find((r) => r.id === 'ws:packages/pkg-a:runtime.node');
    const bNode = report.results.find((r) => r.id === 'ws:packages/pkg-b:runtime.node');
    expect(aNode).toBeDefined();
    expect(bNode).toBeDefined();
    expect(aNode?.severity).toBe('pass');
    expect(bNode?.severity).toBe('pass');
  });

  it('disables workspace discovery with workspaces: false', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:\n  - 'packages/*'\n`
    );
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'monorepo-root' }));

    const pkgDir = path.join(tempDir, 'packages', 'pkg-a');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'pkg-a', engines: { node: '>=20.0.0' } }));

    const report = await runAllChecks(tempDir, {
      workspaces: false,
      skip: ['services', 'docker', 'ports'],
    });

    const wsResults = report.results.filter((r) => r.id.startsWith('ws:'));
    expect(wsResults).toEqual([]);
  });

  it('targets single workspace with workspace option without ws: prefix', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:\n  - 'packages/*'\n`
    );
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'monorepo-root' }));

    const pkgDir = path.join(tempDir, 'packages', 'pkg-a');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'pkg-a', engines: { node: '>=20.0.0' } }));

    const report = await runAllChecks(tempDir, {
      workspace: 'packages/pkg-a',
      skip: ['services', 'docker', 'ports'],
      runtimeExecutors: { node: async () => 'v20.11.0' },
    });

    const nodeResult = report.results.find((r) => r.id === 'runtime.node');
    expect(nodeResult).toBeDefined();
    expect(report.results.some((r) => r.id.startsWith('ws:'))).toBe(false);
  });

  it('deduplicates identical checks across >= 3 packages into a collapsed result', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      `packages:\n  - 'packages/*'\n`
    );
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'monorepo-root' }));

    for (const name of ['pkg-1', 'pkg-2', 'pkg-3', 'pkg-4']) {
      const pDir = path.join(tempDir, 'packages', name);
      await fs.mkdir(pDir, { recursive: true });
      await fs.writeFile(path.join(pDir, 'package.json'), JSON.stringify({ name, engines: { node: '>=20.0.0' } }));
    }

    const report = await runAllChecks(tempDir, {
      runtimeExecutors: { node: async () => 'v20.11.0' },
      skip: ['services', 'docker', 'ports'],
    });

    // Should collapse into 1 result for runtime.node instead of 4 separate results
    const nodeResults = report.results.filter((r) => r.id === 'ws:runtime.node' || r.id === 'runtime.node');
    expect(nodeResults.length).toBe(1);
    expect(nodeResults[0].message).toContain('4 packages');
  });

  it('verifies fixtures/monorepo-pnpm executes under 3s and excludes node_modules', async () => {
    const fixtureDir = path.resolve(__dirname, '../../../fixtures/monorepo-pnpm');
    const start = Date.now();
    const report = await runAllChecks(fixtureDir, {
      runtimeExecutors: { node: async () => 'v20.11.0' },
      skip: ['services', 'docker', 'ports'],
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(3000);
    expect(report.results.some((r) => r.id.includes('fake-pkg'))).toBe(false);
    expect(report.results.some((r) => r.id.includes('apps/web'))).toBe(true);
    expect(report.results.some((r) => r.id.includes('packages/pkg-1'))).toBe(true);
  });
});
