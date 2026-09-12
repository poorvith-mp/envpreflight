import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import pc from 'picocolors';
import { detectRequiredPorts } from '@envpreflight/core';

export interface InitOptions {
  cwd?: string;
  force?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<number> {
  const cwd = options.cwd || process.cwd();
  const configPath = path.join(cwd, '.envpreflightrc.json');

  let alreadyExists = false;
  try {
    await fs.access(configPath);
    alreadyExists = true;
  } catch {}

  if (alreadyExists && !options.force) {
    console.error(pc.red(`Error: ${configPath} already exists, use --force to overwrite.`));
    return 2;
  }

  let detectedPorts: number[] = [];
  try {
    detectedPorts = await detectRequiredPorts(cwd);
  } catch {}

  const configContent = {
    version: 1,
    _comment_skip: 'Check IDs or categories to skip, e.g. ["ports", "docker"]',
    skip: [],
    _comment_only: 'Run only specified check IDs or categories',
    only: [],
    _comment_workspaces: 'Enable or disable monorepo workspace discovery',
    workspaces: true,
    ports: detectedPorts,
    services: [],
  };

  await fs.writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n');
  console.log(pc.green(`✓ Created ${configPath}`));
  return 0;
}
