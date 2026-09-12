import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DetectedManifests } from '../types.js';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectManifests(targetDir: string): Promise<DetectedManifests> {
  const hasNvmrc = await fileExists(path.join(targetDir, '.nvmrc'));
  const hasNodeVersionFile = await fileExists(path.join(targetDir, '.node-version'));
  const hasToolVersions = await fileExists(path.join(targetDir, '.tool-versions'));
  const hasMiseToml = (await fileExists(path.join(targetDir, 'mise.toml'))) ||
                      (await fileExists(path.join(targetDir, '.mise.toml')));
  const hasPackageJson = await fileExists(path.join(targetDir, 'package.json'));
  const hasPyprojectToml = await fileExists(path.join(targetDir, 'pyproject.toml'));
  const hasPythonVersion = await fileExists(path.join(targetDir, '.python-version'));
  const hasGoMod = await fileExists(path.join(targetDir, 'go.mod'));
  const hasRustToolchain = (await fileExists(path.join(targetDir, 'rust-toolchain.toml'))) ||
                           (await fileExists(path.join(targetDir, 'rust-toolchain')));
  
  const hasDockerCompose = (await fileExists(path.join(targetDir, 'docker-compose.yml'))) ||
                           (await fileExists(path.join(targetDir, 'docker-compose.yaml'))) ||
                           (await fileExists(path.join(targetDir, 'compose.yml'))) ||
                           (await fileExists(path.join(targetDir, 'compose.yaml')));

  const hasEnvExample = (await fileExists(path.join(targetDir, '.env.example'))) ||
                        (await fileExists(path.join(targetDir, '.env.sample'))) ||
                        (await fileExists(path.join(targetDir, '.env.template')));

  const hasEnv = await fileExists(path.join(targetDir, '.env'));

  const manifestFiles: string[] = [];
  if (hasToolVersions) manifestFiles.push('.tool-versions');
  if (await fileExists(path.join(targetDir, 'mise.toml'))) manifestFiles.push('mise.toml');
  else if (await fileExists(path.join(targetDir, '.mise.toml'))) manifestFiles.push('.mise.toml');
  if (hasNodeVersionFile) manifestFiles.push('.node-version');
  if (hasNvmrc) manifestFiles.push('.nvmrc');
  if (hasPackageJson) manifestFiles.push('package.json');
  if (hasPyprojectToml) manifestFiles.push('pyproject.toml');
  if (hasPythonVersion) manifestFiles.push('.python-version');
  if (hasGoMod) manifestFiles.push('go.mod');
  if (await fileExists(path.join(targetDir, 'rust-toolchain.toml'))) manifestFiles.push('rust-toolchain.toml');
  else if (await fileExists(path.join(targetDir, 'rust-toolchain'))) manifestFiles.push('rust-toolchain');
  
  if (await fileExists(path.join(targetDir, 'docker-compose.yml'))) manifestFiles.push('docker-compose.yml');
  else if (await fileExists(path.join(targetDir, 'docker-compose.yaml'))) manifestFiles.push('docker-compose.yaml');
  else if (await fileExists(path.join(targetDir, 'compose.yml'))) manifestFiles.push('compose.yml');
  else if (await fileExists(path.join(targetDir, 'compose.yaml'))) manifestFiles.push('compose.yaml');

  if (await fileExists(path.join(targetDir, '.env.example'))) manifestFiles.push('.env.example');
  else if (await fileExists(path.join(targetDir, '.env.sample'))) manifestFiles.push('.env.sample');
  else if (await fileExists(path.join(targetDir, '.env.template'))) manifestFiles.push('.env.template');

  if (hasEnv) manifestFiles.push('.env');

  return {
    hasNode: hasNvmrc || hasPackageJson || hasNodeVersionFile || hasToolVersions || hasMiseToml,
    hasNvmrc,
    hasPackageJson,
    hasNodeVersionFile,
    hasToolVersions,
    hasMiseToml,
    hasPython: hasPyprojectToml || hasPythonVersion || hasToolVersions || hasMiseToml,
    hasPyprojectToml,
    hasPythonVersion,
    hasGo: hasGoMod || hasToolVersions || hasMiseToml,
    hasGoMod,
    hasRust: hasRustToolchain || hasToolVersions || hasMiseToml,
    hasRustToolchain,
    hasDockerCompose,
    hasEnvExample,
    hasEnv,
    manifestFiles,
  };
}
