import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectManifests } from '../src/detect/index.js';

describe('detectManifests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-detect-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects no manifests in an empty directory', async () => {
    const result = await detectManifests(tempDir);
    expect(result.manifestFiles).toEqual([]);
    expect(result.hasNode).toBe(false);
    expect(result.hasPython).toBe(false);
    expect(result.hasGo).toBe(false);
    expect(result.hasRust).toBe(false);
    expect(result.hasDockerCompose).toBe(false);
    expect(result.hasEnvExample).toBe(false);
  });

  it('detects Node manifests (.nvmrc and package.json)', async () => {
    await fs.writeFile(path.join(tempDir, '.nvmrc'), '20.11.0\n');
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app' }));

    const result = await detectManifests(tempDir);
    expect(result.hasNode).toBe(true);
    expect(result.hasNvmrc).toBe(true);
    expect(result.hasPackageJson).toBe(true);
    expect(result.manifestFiles).toContain('.nvmrc');
    expect(result.manifestFiles).toContain('package.json');
  });

  it('detects Python manifests (pyproject.toml and .python-version)', async () => {
    await fs.writeFile(path.join(tempDir, 'pyproject.toml'), '[project]\nname = "py-app"\n');
    await fs.writeFile(path.join(tempDir, '.python-version'), '3.11.7\n');

    const result = await detectManifests(tempDir);
    expect(result.hasPython).toBe(true);
    expect(result.hasPyprojectToml).toBe(true);
    expect(result.hasPythonVersion).toBe(true);
    expect(result.manifestFiles).toContain('pyproject.toml');
    expect(result.manifestFiles).toContain('.python-version');
  });

  it('detects Go, Rust, Compose, and Env manifests', async () => {
    await fs.writeFile(path.join(tempDir, 'go.mod'), 'module example.com/m\n\ngo 1.22\n');
    await fs.writeFile(path.join(tempDir, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.75.0"\n');
    await fs.writeFile(path.join(tempDir, 'docker-compose.yml'), 'services:\n  redis:\n    image: redis\n');
    await fs.writeFile(path.join(tempDir, '.env.example'), 'PORT=3000\nDATABASE_URL=postgres://...\n');
    await fs.writeFile(path.join(tempDir, '.env'), 'PORT=3000\n');

    const result = await detectManifests(tempDir);
    expect(result.hasGo).toBe(true);
    expect(result.hasRust).toBe(true);
    expect(result.hasDockerCompose).toBe(true);
    expect(result.hasEnvExample).toBe(true);
    expect(result.hasEnv).toBe(true);
  });

  it('detects .tool-versions, mise.toml, and .node-version manifests', async () => {
    await fs.writeFile(path.join(tempDir, '.tool-versions'), 'nodejs 20.11.0\n');
    await fs.writeFile(path.join(tempDir, 'mise.toml'), '[tools]\npython = "3.12"\n');
    await fs.writeFile(path.join(tempDir, '.node-version'), '20.10.0\n');

    const result = await detectManifests(tempDir);
    expect(result.hasToolVersions).toBe(true);
    expect(result.hasMiseToml).toBe(true);
    expect(result.hasNodeVersionFile).toBe(true);
    expect(result.hasNode).toBe(true);
    expect(result.hasPython).toBe(true);
    expect(result.manifestFiles).toContain('.tool-versions');
    expect(result.manifestFiles).toContain('mise.toml');
    expect(result.manifestFiles).toContain('.node-version');
  });
});
