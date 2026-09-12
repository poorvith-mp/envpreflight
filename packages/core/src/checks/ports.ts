import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as net from 'node:net';
import { execa } from 'execa';
import { parse as parseYaml } from 'yaml';
import type { CheckResult } from '../types.js';

export interface PortProbeResult {
  isOccupied: boolean;
  processName?: string;
  pid?: number;
}

export type PortProber = (port: number, timeoutMs?: number) => Promise<PortProbeResult>;

export interface PortsCheckOptions {
  portProber?: PortProber;
  timeoutMs?: number;
}

async function readFileQuiet(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function isPortOccupiedOnHost(port: number, host: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(false);
      });
    });

    try {
      server.listen({ port, host, exclusive: true });
    } catch {
      resolve(true);
    }
  });
}

export async function isPortOccupied(port: number): Promise<boolean> {
  const on127 = await isPortOccupiedOnHost(port, '127.0.0.1');
  if (on127) return true;
  const on0 = await isPortOccupiedOnHost(port, '0.0.0.0');
  return on0;
}

async function resolveProcessWindows(port: number, timeoutMs = 2000): Promise<{ pid?: number; processName?: string }> {
  try {
    const res = await execa(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`,
      ],
      { timeout: timeoutMs }
    );
    const pidStr = (res.stdout || '').trim();
    const pid = parseInt(pidStr, 10);
    if (!isNaN(pid) && pid > 0) {
      let processName: string | undefined;
      try {
        const nameRes = await execa(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`,
          ],
          { timeout: 1000 }
        );
        processName = (nameRes.stdout || '').trim() || undefined;
      } catch {}
      return { pid, processName };
    }
  } catch {}
  return {};
}

async function resolveProcessPosix(port: number, timeoutMs = 2000): Promise<{ pid?: number; processName?: string }> {
  try {
    const lsof = await execa('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-n', '-P'], { timeout: timeoutMs });
    const lines = lsof.stdout.split('\n').filter(Boolean);
    if (lines.length > 1) {
      const parts = lines[1].trim().split(/\s+/);
      const processName = parts[0];
      const pid = parseInt(parts[1], 10);
      return { pid: isNaN(pid) ? undefined : pid, processName };
    }
  } catch {}
  return {};
}

export const defaultPortProber: PortProber = async (port: number, timeoutMs = 2000): Promise<PortProbeResult> => {
  const occupied = await isPortOccupied(port);
  if (!occupied) {
    return { isOccupied: false };
  }

  const proc =
    process.platform === 'win32'
      ? await resolveProcessWindows(port, timeoutMs)
      : await resolveProcessPosix(port, timeoutMs);

  return {
    isOccupied: true,
    pid: proc.pid,
    processName: proc.processName,
  };
};

export async function detectRequiredPorts(targetDir: string): Promise<number[]> {
  const ports = new Set<number>();

  const envCandidates = ['.env.example', '.env.sample', '.env.template', '.env'];
  for (const name of envCandidates) {
    const content = await readFileQuiet(path.join(targetDir, name));
    if (content) {
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/(?:PORT|VITE_PORT|APP_PORT|SERVER_PORT|CLIENT_PORT)\s*=\s*(\d{2,5})/i);
        if (match) {
          const p = parseInt(match[1], 10);
          if (p > 0 && p <= 65535) {
            ports.add(p);
          }
        }
      }
    }
  }

  const composeCandidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  for (const name of composeCandidates) {
    const content = await readFileQuiet(path.join(targetDir, name));
    if (content) {
      try {
        const parsed: any = parseYaml(content);
        const services = parsed?.services || {};
        for (const service of Object.values<any>(services)) {
          if (Array.isArray(service.ports)) {
            for (const portEntry of service.ports) {
              const str = String(portEntry);
              const parts = str.split(':');
              const hostPort = parseInt(parts[0].replace(/[^0-9]/g, ''), 10);
              if (hostPort > 0 && hostPort <= 65535) {
                if (![5432, 6379, 3306, 27017].includes(hostPort)) {
                  ports.add(hostPort);
                }
              }
            }
          }
        }
      } catch {}
    }
  }

  return Array.from(ports);
}

export async function checkPorts(
  targetDir: string,
  options: PortsCheckOptions = {}
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const prober = options.portProber ?? defaultPortProber;
  const timeoutMs = options.timeoutMs ?? 2000;

  const requiredPorts = await detectRequiredPorts(targetDir);

  for (const port of requiredPorts) {
    const probe = await prober(port, timeoutMs);

    if (!probe.isOccupied) {
      results.push({
        id: `port.${port}`,
        label: `Port ${port}`,
        category: 'Ports',
        severity: 'pass',
        actual: 'available',
        message: `port ${port} is available`,
      });
    } else {
      const procInfo = probe.processName
        ? `${probe.processName}${probe.pid ? ` (pid ${probe.pid})` : ''}`
        : probe.pid
        ? `pid ${probe.pid}`
        : 'another process';

      const fix = probe.pid
        ? (process.platform === 'win32' ? `Stop-Process -Id ${probe.pid}` : `kill ${probe.pid}`)
        : undefined;

      results.push({
        id: `port.${port}`,
        label: `Port ${port}`,
        category: 'Ports',
        severity: 'fail',
        actual: `occupied by ${procInfo}`,
        message: `${port} in use by ${procInfo}`,
        fix,
      });
    }
  }

  return results;
}
