import { describe, it, expect } from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defaultPortProber, checkPorts } from './ports.js';

describe('Windows native port probe', () => {
  it('has zero references to netstat in packages/core/src', async () => {
    const portsSrc = await fs.readFile(path.resolve(__dirname, 'ports.ts'), 'utf-8');
    expect(portsSrc).not.toContain('netstat');
  });

  describe.skipIf(process.platform !== 'win32')('live Windows execution', () => {
    it('reports an occupied port even when PID lookup is unavailable', async () => {
      const testPort = 19876;
      const server = net.createServer();
      await new Promise<void>((resolve) => {
        server.listen({ port: testPort, host: '127.0.0.1', exclusive: true }, () => resolve());
      });

      try {
        const res = await defaultPortProber(testPort, 1);

        expect(res.isOccupied).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }, 20000);

    it('reports available for free port and leaves no open socket', async () => {
      const testPort = 19877;
      const res = await defaultPortProber(testPort, 2000);
      expect(res.isOccupied).toBe(false);

      // Verify port can immediately be bound
      const server = net.createServer();
      await new Promise<void>((resolve) => {
        server.listen({ port: testPort, host: '127.0.0.1', exclusive: true }, () => resolve());
      });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });
});
