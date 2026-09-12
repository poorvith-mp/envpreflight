import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MAX_PACKAGES = 50;
const MAX_DEPTH = 4;

export function parsePnpmWorkspaceGlobs(content: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'packages:' || trimmed.startsWith('packages:')) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (trimmed.startsWith('-')) {
        const item = trimmed.slice(1).trim().replace(/^['"]|['"]$/g, '');
        if (item) globs.push(item);
      } else if (!line.startsWith(' ') && !line.startsWith('\t')) {
        break;
      }
    }
  }
  return globs;
}

export function parsePackageJsonWorkspaces(pkg: any): string[] {
  if (Array.isArray(pkg.workspaces)) {
    return pkg.workspaces.filter((w: any): w is string => typeof w === 'string');
  }
  if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
    return pkg.workspaces.packages.filter((w: any): w is string => typeof w === 'string');
  }
  return [];
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function matchGlob(relPath: string, pattern: string): boolean {
  const normRel = relPath.replace(/\\/g, '/');
  const normPat = pattern.replace(/\\/g, '/').replace(/\/$/, '');

  const regexStr = '^' + normPat
    .split('**')
    .map((seg) => seg.split('*').map((s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]+'))
    .join('.*') + '$';

  return new RegExp(regexStr).test(normRel);
}

async function scanDirs(
  root: string,
  relDir: string,
  depth: number,
  patterns: string[],
  results: Set<string>
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  const absDir = relDir ? path.join(root, relDir) : root;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(absDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue;

    const childRel = relDir ? `${relDir}/${entry}` : entry;
    const childAbs = path.join(root, childRel);
    if (await isDirectory(childAbs)) {
      const isMatch = patterns.some((p) => matchGlob(childRel, p));
      if (isMatch) {
        if (await fileExists(path.join(childAbs, 'package.json'))) {
          results.add(childRel.replace(/\\/g, '/'));
        }
      }
      await scanDirs(root, childRel, depth + 1, patterns, results);
    }
  }
}

export async function discoverWorkspaces(root: string): Promise<string[]> {
  const patterns: string[] = [];

  try {
    const pnpmWs = await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf-8');
    patterns.push(...parsePnpmWorkspaceGlobs(pnpmWs));
  } catch {}

  try {
    const pkgRaw = await fs.readFile(path.join(root, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    patterns.push(...parsePackageJsonWorkspaces(pkg));
  } catch {}

  if (patterns.length === 0) {
    return [];
  }

  const results = new Set<string>();
  await scanDirs(root, '', 1, patterns, results);

  const sorted = Array.from(results).sort();
  if (sorted.length > MAX_PACKAGES) {
    return sorted.slice(0, MAX_PACKAGES);
  }
  return sorted;
}
