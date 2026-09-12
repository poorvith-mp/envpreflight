import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Report } from '@envpreflight/core';
import { renderGitHubAnnotations, renderGitHubStepSummary } from './render.js';

describe('--format github formatting and step summary', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envpreflight-gh-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleReport: Report = {
    exitCode: 1,
    durationMs: 120,
    projectName: 'test-repo',
    results: [
      {
        id: 'runtime.node',
        label: 'Node.js version',
        severity: 'fail',
        expected: '20.0.0',
        actual: '18.17.0',
        message: 'Node.js mismatch',
        fix: 'nvm install 20',
      },
      {
        id: 'docker',
        label: 'Docker daemon',
        severity: 'warn',
        message: 'Docker daemon is not running',
      },
      {
        id: 'runtime.python',
        label: 'Python',
        severity: 'pass',
        actual: '3.12.0',
        message: 'Python matches',
      },
      {
        id: 'runtime.ruby',
        label: 'Ruby',
        severity: 'skipped',
        skipReason: 'no ruby check',
        message: 'no ruby check',
      },
    ],
  };

  it('renders workflow command annotations for fails and warns only', () => {
    const annotations = renderGitHubAnnotations(sampleReport);
    expect(annotations).toContain('::error title=Node.js version::Node.js mismatch (expected 20.0.0, found 18.17.0)');
    expect(annotations).toContain('::warning title=Docker daemon::Docker daemon is not running');
    expect(annotations).not.toContain('Python');
    expect(annotations).not.toContain('Ruby');
  });

  it('renders github step summary markdown table with Check, Status, Expected, Actual, Fix', async () => {
    const summaryMarkdown = renderGitHubStepSummary(sampleReport);
    expect(summaryMarkdown).toContain('| Check | Status | Expected | Actual | Fix |');
    expect(summaryMarkdown).toContain('| Node.js version | ❌ fail | 20.0.0 | 18.17.0 | `nvm install 20` |');
    expect(summaryMarkdown).toContain('| Docker daemon | ⚠️ warn | - | - | - |');
    expect(summaryMarkdown).toContain('| Python | ✅ pass | - | 3.12.0 | - |');
  });
});
