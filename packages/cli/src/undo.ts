import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import pc from 'picocolors';
import type { FixLogEntry } from './fix.js';

export interface UndoOptions {
  cwd?: string;
}

export async function runUndo(options: UndoOptions = {}): Promise<number> {
  const cwd = options.cwd || process.cwd();
  const logFile = path.join(cwd, '.envpreflight', 'last-fix.jsonl');

  let content = '';
  try {
    content = await fs.readFile(logFile, 'utf-8');
  } catch {
    console.log(pc.dim('No previous fixes found to undo.'));
    return 0;
  }

  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log(pc.dim('No previous fixes found to undo.'));
    return 0;
  }

  const entries: FixLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }

  // Reverse entries to undo in opposite order
  entries.reverse();

  for (const entry of entries) {
    if (entry.kind === 'env' && entry.undo?.envKey) {
      const filePath = path.join(cwd, entry.undo.filePath || '.env');
      try {
        const envContent = await fs.readFile(filePath, 'utf-8');
        const envLines = envContent.split('\n');
        const key = entry.undo.envKey;
        const expectedVal = entry.undo.envValue;

        let modified = false;
        const newLines = envLines.filter((l) => {
          const match = l.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
          if (match && match[1] === key) {
            const actualVal = match[2].trim().replace(/^["']|["']$/g, '');
            if (expectedVal === undefined || actualVal === expectedVal) {
              modified = true;
              return false; // Remove this line
            }
          }
          return true;
        });

        if (modified) {
          await fs.writeFile(filePath, newLines.join('\n'));
          console.log(pc.green(`✓ Reverted .env key: ${key}`));
        } else {
          console.log(pc.dim(`Skipped reverting ${key} (value was modified by user)`));
        }
      } catch (err: any) {
        console.error(pc.red(`Failed to revert .env: ${err.message}`));
      }
    } else if (entry.kind === 'install') {
      console.log(pc.yellow(`Manual undo required for ${entry.check}: ${entry.command}`));
    } else if (entry.kind === 'kill') {
      console.log(pc.dim(`cannot undo process kill for ${entry.check} (${entry.command})`));
    }
  }

  return 0;
}
