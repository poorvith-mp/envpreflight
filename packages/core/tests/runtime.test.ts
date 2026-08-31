import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkRuntime } from '../src/checks/runtime.js';
import type { CheckResult } from '../src/types.js';

describe('Runtime checks', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-runtime-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Node.js runtime check', () => {
    it('passes when Node version satisfies package.json engines.node', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app', engines: { node: '>=18.0.0' } })
      );

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          node: async () => 'v20.11.0',
        },
      });

      const nodeResult = results.find((r) => r.id === 'runtime.node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.severity).toBe('pass');
      expect(nodeResult?.actual).toBe('20.11.0');
      expect(nodeResult?.expected).toBe('>=18.0.0');
    });

    it('fails with actionable fix when Node version does not satisfy .nvmrc', async () => {
      await fs.writeFile(path.join(tempDir, '.nvmrc'), '20.10.0\n');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          node: async () => 'v18.17.0',
        },
      });

      const nodeResult = results.find((r) => r.id === 'runtime.node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.severity).toBe('fail');
      expect(nodeResult?.actual).toBe('18.17.0');
      expect(nodeResult?.expected).toBe('20.10.0');
      expect(nodeResult?.fix).toContain('nvm install 20.10.0');
    });

    it('returns skipped when package.json is malformed JSON', async () => {
      await fs.writeFile(path.join(tempDir, 'package.json'), '{ invalid json ');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          node: async () => 'v20.11.0',
        },
      });

      const nodeResult = results.find((r) => r.id === 'runtime.node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.severity).toBe('skipped');
      expect(nodeResult?.skipReason).toBeDefined();
    });

    it('fails with distinct message when Node is not installed at all', async () => {
      await fs.writeFile(path.join(tempDir, '.nvmrc'), '20.0.0\n');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          node: async () => {
            throw new Error('command not found: node');
          },
        },
      });

      const nodeResult = results.find((r) => r.id === 'runtime.node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.severity).toBe('fail');
      expect(nodeResult?.message).toContain('not installed');
      expect(nodeResult?.actual).toBe('not installed');
    });
  });

  describe('Python runtime check', () => {
    it('passes when python version satisfies pyproject.toml requires-python', async () => {
      await fs.writeFile(
        path.join(tempDir, 'pyproject.toml'),
        `[project]
name = "my-project"
requires-python = ">=3.11"
`
      );

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          python: async () => 'Python 3.11.7',
        },
      });

      const pyResult = results.find((r) => r.id === 'runtime.python');
      expect(pyResult).toBeDefined();
      expect(pyResult?.severity).toBe('pass');
      expect(pyResult?.actual).toBe('3.11.7');
    });

    it('fails when python version is lower than pyproject.toml requires-python', async () => {
      await fs.writeFile(
        path.join(tempDir, 'pyproject.toml'),
        `[project]
name = "my-project"
requires-python = ">=3.11"
`
      );

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          python: async () => 'Python 3.9.6',
        },
      });

      const pyResult = results.find((r) => r.id === 'runtime.python');
      expect(pyResult).toBeDefined();
      expect(pyResult?.severity).toBe('fail');
      expect(pyResult?.actual).toBe('3.9.6');
      expect(pyResult?.fix).toContain('pyenv install');
    });

    it('parses .python-version file correctly', async () => {
      await fs.writeFile(path.join(tempDir, '.python-version'), '3.12.1\n');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          python: async () => 'Python 3.12.1',
        },
      });

      const pyResult = results.find((r) => r.id === 'runtime.python');
      expect(pyResult).toBeDefined();
      expect(pyResult?.severity).toBe('pass');
    });

    it('handles malformed pyproject.toml gracefully as skipped', async () => {
      await fs.writeFile(path.join(tempDir, 'pyproject.toml'), '[[ broken toml');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          python: async () => 'Python 3.11.0',
        },
      });

      const pyResult = results.find((r) => r.id === 'runtime.python');
      expect(pyResult).toBeDefined();
      expect(pyResult?.severity).toBe('skipped');
      expect(pyResult?.skipReason).toBeDefined();
    });

    it('fails with clear message when Python is not installed', async () => {
      await fs.writeFile(path.join(tempDir, '.python-version'), '3.11.0\n');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          python: async () => {
            throw new Error('python: not found');
          },
        },
      });

      const pyResult = results.find((r) => r.id === 'runtime.python');
      expect(pyResult).toBeDefined();
      expect(pyResult?.severity).toBe('fail');
      expect(pyResult?.actual).toBe('not installed');
    });
  });

  describe('Go runtime check', () => {
    it('passes when installed go matches or exceeds go.mod directive', async () => {
      await fs.writeFile(path.join(tempDir, 'go.mod'), 'module example.com/app\n\ngo 1.21\n');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          go: async () => 'go version go1.22.1 darwin/arm64',
        },
      });

      const goResult = results.find((r) => r.id === 'runtime.go');
      expect(goResult).toBeDefined();
      expect(goResult?.severity).toBe('pass');
      expect(goResult?.actual).toBe('1.22.1');
    });

    it('fails when installed go version is lower than go.mod', async () => {
      await fs.writeFile(path.join(tempDir, 'go.mod'), 'module example.com/app\n\ngo 1.22\n');

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          go: async () => 'go version go1.20.5 linux/amd64',
        },
      });

      const goResult = results.find((r) => r.id === 'runtime.go');
      expect(goResult).toBeDefined();
      expect(goResult?.severity).toBe('fail');
      expect(goResult?.actual).toBe('1.20.5');
      expect(goResult?.fix).toBeDefined();
    });
  });

  describe('Rust runtime check', () => {
    it('passes when rustc matches rust-toolchain.toml channel', async () => {
      await fs.writeFile(
        path.join(tempDir, 'rust-toolchain.toml'),
        `[toolchain]
channel = "1.75.0"
`
      );

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          rust: async () => 'rustc 1.75.0 (82e1608df 2023-12-21)',
        },
      });

      const rustResult = results.find((r) => r.id === 'runtime.rust');
      expect(rustResult).toBeDefined();
      expect(rustResult?.severity).toBe('pass');
      expect(rustResult?.actual).toBe('1.75.0');
    });

    it('fails when rustc version does not match rust-toolchain.toml', async () => {
      await fs.writeFile(
        path.join(tempDir, 'rust-toolchain.toml'),
        `[toolchain]
channel = "1.75.0"
`
      );

      const results = await checkRuntime(tempDir, {
        runtimeExecutors: {
          rust: async () => 'rustc 1.70.0 (90c541806 2023-05-31)',
        },
      });

      const rustResult = results.find((r) => r.id === 'runtime.rust');
      expect(rustResult).toBeDefined();
      expect(rustResult?.severity).toBe('fail');
      expect(rustResult?.fix).toContain('rustup toolchain install 1.75.0');
    });
  });

  describe('Bun, Deno, and Java checks (PMP-36)', () => {
    it('detects Bun from .bun-version and passes when version satisfies', async () => {
      await fs.writeFile(path.join(tempDir, '.bun-version'), '>=1.1.0\n');
      const results = await checkRuntime(tempDir, {
        runtimeExecutors: { bun: async () => '1.1.20' },
      });
      const bunResult = results.find((r) => r.id === 'runtime.bun');
      expect(bunResult).toBeDefined();
      expect(bunResult?.severity).toBe('pass');
      expect(bunResult?.actual).toBe('1.1.20');
    });

    it('detects Deno from deno.json and passes when installed', async () => {
      await fs.writeFile(path.join(tempDir, 'deno.json'), '{"tasks": {}}\n');
      const results = await checkRuntime(tempDir, {
        runtimeExecutors: { deno: async () => 'deno 1.45.0 (release, x86_64-pc-windows-msvc)' },
      });
      const denoResult = results.find((r) => r.id === 'runtime.deno');
      expect(denoResult).toBeDefined();
      expect(denoResult?.severity).toBe('pass');
      expect(denoResult?.actual).toBe('1.45.0');
    });

    it('detects Java from pom.xml and passes when JDK matches', async () => {
      await fs.writeFile(path.join(tempDir, 'pom.xml'), '<project><properties><java.version>17</java.version></properties></project>');
      const results = await checkRuntime(tempDir, {
        runtimeExecutors: { java: async () => 'openjdk version "17.0.9" 2023-10-17' },
      });
      const javaResult = results.find((r) => r.id === 'runtime.java');
      expect(javaResult).toBeDefined();
      expect(javaResult?.severity).toBe('pass');
      expect(javaResult?.actual).toBe('17.0.9');
    });
  });
});
