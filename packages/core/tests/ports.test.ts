import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import { checkPorts, detectRequiredPorts } from '../src/checks/ports.js';

describe('Ports checks', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-ports-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects ports from .env.example and docker-compose', async () => {
    await fs.writeFile(path.join(tempDir, '.env.example'), 'PORT=3000\nVITE_PORT=5173\n');
    await fs.writeFile(
      path.join(tempDir, 'docker-compose.yml'),
      `services:\n  web:\n    ports:\n      - "8080:8080"\n`
    );

    const ports = await detectRequiredPorts(tempDir);
    expect(ports).toContain(3000);
    expect(ports).toContain(5173);
    expect(ports).toContain(8080);
  });

  it('passes when required port is free and available', async () => {
    await fs.writeFile(path.join(tempDir, '.env.example'), 'PORT=39482\n');

    const results = await checkPorts(tempDir, {
      portProber: async () => ({ isOccupied: false }),
    });

    const portResult = results.find((r) => r.id === 'port.39482');
    expect(portResult).toBeDefined();
    expect(portResult?.severity).toBe('pass');
    expect(portResult?.message).toContain('port 39482 is available');
  });

  it('fails with process info and kill command when port is occupied by another process', async () => {
    await fs.writeFile(path.join(tempDir, '.env.example'), 'PORT=3000\n');

    const results = await checkPorts(tempDir, {
      portProber: async () => ({
        isOccupied: true,
        processName: 'node',
        pid: 48213,
      }),
    });

    const portResult = results.find((r) => r.id === 'port.3000');
    expect(portResult).toBeDefined();
    expect(portResult?.severity).toBe('fail');
    const expectedFix = process.platform === 'win32' ? 'Stop-Process -Id 48213' : 'kill 48213';
    expect(portResult?.fix).toBe(expectedFix);
  });
});
