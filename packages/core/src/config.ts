import * as fs from 'node:fs';
import * as path from 'node:path';

export interface EnvpreflightConfig {
  version?: number;
  skip?: string[];
  only?: string[];
  workspaces?: boolean;
  ports?: number[];
  services?: string[];
  timeoutMs?: number;
  configPath?: string;
  [key: string]: any;
}

export function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function loadConfig(startDir = process.cwd()): EnvpreflightConfig | null {
  const resolvedStart = path.resolve(startDir);
  const gitRoot = findGitRoot(resolvedStart);

  let current = resolvedStart;
  while (true) {
    const candidate = path.join(current, '.envpreflightrc.json');
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...parsed,
          configPath: candidate,
        };
      } catch (err: any) {
        throw new Error(`Failed to parse .envpreflightrc.json at ${candidate}: ${err.message}`);
      }
    }

    if (gitRoot && current === gitRoot) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current || !gitRoot) {
      break;
    }
    current = parent;
  }

  return null;
}
