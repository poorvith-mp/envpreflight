import pc from 'picocolors';
import type { CheckResult, Report, Severity } from '@envpreflight/core';

export interface RenderOptions {
  color?: boolean;
  quiet?: boolean;
}

const SYMBOLS: Record<Severity, string> = {
  pass: '✓',
  warn: '!',
  fail: '✗',
  skipped: '-',
};

function padRight(str: string, length: number): string {
  return str.length >= length ? str : str + ' '.repeat(length - str.length);
}

export function renderReport(report: Report, options: RenderOptions = {}): string {
  const useColor = options.color ?? (!process.env.NO_COLOR && Boolean(process.stdout.isTTY));
  const quiet = options.quiet ?? false;

  const lines: string[] = [];

  // Title header
  const title = `envpreflight · ${report.projectName || 'project'}`;
  lines.push(useColor ? pc.bold(title) : title);
  lines.push('');

  // Group by category
  const categories = new Map<string, CheckResult[]>();
  for (const res of report.results) {
    if (quiet && res.severity === 'pass') {
      continue;
    }
    const cat = res.category || 'General';
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat)!.push(res);
  }

  for (const [category, results] of categories.entries()) {
    if (results.length === 0) continue;

    lines.push(useColor ? pc.bold(pc.white(category)) : category);

    // Compute column padding for alignment
    const maxLabelLen = Math.max(14, ...results.map((r) => r.label.length));

    for (const res of results) {
      const sym = SYMBOLS[res.severity];
      let symColored = sym;
      if (useColor) {
        if (res.severity === 'pass') symColored = pc.green(sym);
        else if (res.severity === 'warn') symColored = pc.yellow(sym);
        else if (res.severity === 'fail') symColored = pc.red(sym);
        else symColored = pc.dim(sym);
      }

      const paddedLabel = padRight(res.label, maxLabelLen);
      const msg = res.message || '';

      lines.push(`  ${symColored} ${paddedLabel}  ${msg}`);

      if (res.fix && (res.severity === 'fail' || res.severity === 'warn')) {
        const arrow = useColor ? pc.cyan('→') : '→';
        const fixCmd = useColor ? pc.cyan(res.fix) : res.fix;
        lines.push(`    ${arrow} ${fixCmd}`);
      }
    }

    lines.push('');
  }

  // Summary statistics
  const failedCount = report.results.filter((r) => r.severity === 'fail').length;
  const warnCount = report.results.filter((r) => r.severity === 'warn').length;
  const passCount = report.results.filter((r) => r.severity === 'pass').length;
  const skippedCount = report.results.filter((r) => r.severity === 'skipped').length;
  const durationSec = (report.durationMs / 1000).toFixed(1);

  const parts: string[] = [];
  if (failedCount > 0) {
    const txt = `${failedCount} failed`;
    parts.push(useColor ? pc.red(txt) : txt);
  }
  if (warnCount > 0) {
    const txt = `${warnCount} ${warnCount === 1 ? 'warning' : 'warnings'}`;
    parts.push(useColor ? pc.yellow(txt) : txt);
  }
  if (passCount > 0) {
    const txt = `${passCount} passed`;
    parts.push(useColor ? pc.green(txt) : txt);
  }
  if (skippedCount > 0) {
    const txt = `${skippedCount} skipped`;
    parts.push(useColor ? pc.dim(txt) : txt);
  }

  const durationStr = `${durationSec}s`;
  parts.push(useColor ? pc.dim(durationStr) : durationStr);

  lines.push(parts.join(' · '));

  return lines.join('\n');
}

export function renderGitHubAnnotations(report: Report): string {
  const lines: string[] = [];
  for (const r of report.results) {
    if (r.severity === 'fail') {
      let detail = r.message;
      if (r.expected && r.actual) {
        detail = `${r.message} (expected ${r.expected}, found ${r.actual})`;
      } else if (r.expected) {
        detail = `${r.message} (expected ${r.expected})`;
      }
      lines.push(`::error title=${r.label}::${detail}`);
    } else if (r.severity === 'warn') {
      lines.push(`::warning title=${r.label}::${r.message}`);
    }
  }
  return lines.join('\n');
}

export function renderGitHubStepSummary(report: Report): string {
  const lines: string[] = [];
  lines.push(`### envpreflight · ${report.projectName || 'project'}`);
  lines.push('');
  lines.push('| Check | Status | Expected | Actual | Fix |');
  lines.push('|---|---|---|---|---|');

  const statusIcons: Record<Severity, string> = {
    pass: '✅ pass',
    warn: '⚠️ warn',
    fail: '❌ fail',
    skipped: '⚪ skipped',
  };

  for (const r of report.results) {
    const status = statusIcons[r.severity] || r.severity;
    const exp = r.expected ? r.expected.replace(/\|/g, '\\|') : '-';
    const act = r.actual ? r.actual.replace(/\|/g, '\\|') : '-';
    const fix = r.fix ? `\`${r.fix.replace(/\|/g, '\\|')}\`` : '-';
    lines.push(`| ${r.label} | ${status} | ${exp} | ${act} | ${fix} |`);
  }

  lines.push('');
  return lines.join('\n');
}
