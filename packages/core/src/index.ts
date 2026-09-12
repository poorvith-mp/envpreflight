import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult, Report, RunOptions } from './types.js';
import { detectManifests } from './detect/index.js';
import { checkRuntime, type RuntimeCheckOptions } from './checks/runtime.js';
import { checkServices, type ServicesCheckOptions } from './checks/services.js';
import { checkDocker, type DockerCheckOptions } from './checks/docker.js';
import { checkEnvVars } from './checks/envvars.js';
import { checkPorts, type PortsCheckOptions } from './checks/ports.js';

import { discoverWorkspaces } from './workspaces.js';

export * from './types.js';
export * from './detect/index.js';
export * from './checks/runtime.js';
export * from './checks/services.js';
export * from './checks/docker.js';
export * from './checks/envvars.js';
export * from './checks/ports.js';
export * from './workspaces.js';
export * from './config.js';

export interface FullCheckOptions
  extends RunOptions,
    RuntimeCheckOptions,
    ServicesCheckOptions,
    DockerCheckOptions,
    PortsCheckOptions {}

async function getProjectName(targetDir: string): Promise<string> {
  try {
    const pkgRaw = await fs.readFile(path.join(targetDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg.name) return pkg.name;
  } catch {
    // ignore
  }

  return path.basename(path.resolve(targetDir));
}

export async function runAllChecks(
  targetDir = process.cwd(),
  options: FullCheckOptions = {}
): Promise<Report> {
  const startTime = Date.now();

  // If specific workspace is targeted, run directly on that workspace
  if (options.workspace) {
    const wsTargetDir = path.resolve(targetDir, options.workspace);
    const report = await runAllChecks(wsTargetDir, { ...options, workspace: undefined, workspaces: false });
    return report;
  }

  const projectName = await getProjectName(targetDir);
  const manifests = await detectManifests(targetDir);

  const shouldDiscoverWs = options.workspaces !== false;
  const workspaceDirs = shouldDiscoverWs ? await discoverWorkspaces(targetDir) : [];

  // If no manifests detected at all and no workspaces, return empty report immediately
  if (manifests.manifestFiles.length === 0 && workspaceDirs.length === 0) {
    return {
      results: [],
      exitCode: 0,
      durationMs: Date.now() - startTime,
      projectName,
    };
  }

  // Root checks
  const rootPromises: Promise<CheckResult[]>[] = [
    manifests.manifestFiles.length > 0 ? checkRuntime(targetDir, options) : Promise.resolve([]),
    checkServices(targetDir, options),
    checkDocker(targetDir, options),
    manifests.hasEnvExample || manifests.hasEnv ? checkEnvVars(targetDir) : Promise.resolve([]),
    checkPorts(targetDir, options),
  ];

  const [runtimeResults, serviceResults, dockerResults, envResults, portResults] = await Promise.all(rootPromises);

  // Workspace checks
  const rawWsResults: { wsRel: string; result: CheckResult }[] = [];
  if (workspaceDirs.length > 0) {
    const wsChecks = workspaceDirs.map(async (wsRel) => {
      const wsDir = path.join(targetDir, wsRel);
      const [wsRuntime, wsEnv] = await Promise.all([
        checkRuntime(wsDir, options),
        checkEnvVars(wsDir),
      ]);
      for (const r of [...wsRuntime, ...wsEnv]) {
        rawWsResults.push({ wsRel, result: r });
      }
    });
    await Promise.all(wsChecks);
  }

  // Deduplicate workspace checks across >= 3 packages
  const groupedByKey = new Map<string, { wsRel: string; result: CheckResult }[]>();
  for (const item of rawWsResults) {
    const key = `${item.result.id}:${item.result.severity}:${item.result.expected || ''}:${item.result.actual || ''}`;
    const list = groupedByKey.get(key) || [];
    list.push(item);
    groupedByKey.set(key, list);
  }

  const processedWsResults: CheckResult[] = [];
  for (const [key, items] of groupedByKey) {
    if (items.length >= 3) {
      const sample = items[0].result;
      const count = items.length;
      processedWsResults.push({
        id: `ws:${sample.id}`,
        label: sample.label,
        category: sample.category,
        severity: sample.severity,
        expected: sample.expected,
        actual: sample.actual,
        fix: sample.fix,
        skipReason: sample.skipReason,
        message: `${sample.label} wanted by ${count} packages (${items.map((i) => i.wsRel).join(', ')})`,
      });
    } else {
      for (const item of items) {
        processedWsResults.push({
          ...item.result,
          id: `ws:${item.wsRel}:${item.result.id}`,
        });
      }
    }
  }

  let allResults: CheckResult[] = [
    ...runtimeResults,
    ...serviceResults,
    ...dockerResults,
    ...envResults,
    ...portResults,
    ...processedWsResults,
  ];

  // Apply --only filter
  if (options.only && options.only.length > 0) {
    const allowed = new Set(options.only.flatMap((o) => o.split(',')).map((s) => s.trim().toLowerCase()));
    allResults = allResults.filter((r) =>
      allowed.has(r.id.toLowerCase()) || (r.category && allowed.has(r.category.toLowerCase()))
    );
  }

  // Apply --skip filter
  if (options.skip && options.skip.length > 0) {
    const skipped = new Set(options.skip.flatMap((s) => s.split(',')).map((s) => s.trim().toLowerCase()));
    allResults = allResults.filter(
      (r) => !skipped.has(r.id.toLowerCase()) && (!r.category || !skipped.has(r.category.toLowerCase()))
    );
  }

  // Determine exitCode: 0 all pass, 1 blocking failure, 2 warnings only
  let exitCode: 0 | 1 | 2 = 0;
  const hasFail = allResults.some((r) => r.severity === 'fail');
  const hasWarn = allResults.some((r) => r.severity === 'warn');

  if (hasFail) {
    exitCode = 1;
  } else if (hasWarn) {
    exitCode = 2;
  } else {
    exitCode = 0;
  }

  return {
    results: allResults,
    exitCode,
    durationMs: Date.now() - startTime,
    projectName,
  };
}
