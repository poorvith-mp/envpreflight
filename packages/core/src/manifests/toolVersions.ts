export interface ToolDefinition {
  canonicalTool: string;
  rawTool: string;
  version?: string;
  sourceFile: string;
  manager: 'mise';
  skipReason?: string;
}

const TOOL_MAP: Record<string, string> = {
  nodejs: 'node',
  node: 'node',
  python: 'python',
  golang: 'go',
  go: 'go',
  rust: 'rust',
  java: 'java',
  bun: 'bun',
  deno: 'deno',
  ruby: 'ruby',
};

export function canonicalizeTool(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return TOOL_MAP[lower] || lower;
}

export function parseToolVersions(content: string, sourceFile: string): Map<string, ToolDefinition> {
  const result = new Map<string, ToolDefinition>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length === 0) continue;
    const rawTool = parts[0];
    const canonical = canonicalizeTool(rawTool);
    const versions = parts.slice(1);
    if (versions.length === 0) continue;
    const firstVersion = versions[0];
    if (firstVersion === 'system') {
      result.set(canonical, {
        canonicalTool: canonical,
        rawTool,
        sourceFile,
        manager: 'mise',
        skipReason: 'system version specified',
      });
    } else {
      result.set(canonical, {
        canonicalTool: canonical,
        rawTool,
        version: firstVersion,
        sourceFile,
        manager: 'mise',
      });
    }
  }
  return result;
}

export function parseMiseToml(content: string, sourceFile: string): Map<string, ToolDefinition> {
  const result = new Map<string, ToolDefinition>();
  const lines = content.split('\n');
  let inTools = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('[')) {
      inTools = trimmed === '[tools]';
      continue;
    }

    if (!inTools) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const rawKey = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();
    const canonical = canonicalizeTool(rawKey);

    // If it's an inline table { ... }, unsupported syntax
    if (rawVal.startsWith('{')) {
      result.set(canonical, {
        canonicalTool: canonical,
        rawTool: rawKey,
        sourceFile,
        manager: 'mise',
        skipReason: 'unsupported mise.toml syntax',
      });
      continue;
    }

    // String: "version" or 'version'
    const strMatch = rawVal.match(/^["']([^"']+)["']/);
    if (strMatch) {
      const v = strMatch[1].trim();
      if (v === 'system') {
        result.set(canonical, {
          canonicalTool: canonical,
          rawTool: rawKey,
          sourceFile,
          manager: 'mise',
          skipReason: 'system version specified',
        });
      } else {
        result.set(canonical, {
          canonicalTool: canonical,
          rawTool: rawKey,
          version: v,
          sourceFile,
          manager: 'mise',
        });
      }
      continue;
    }

    // Array: ["v1", "v2"]
    if (rawVal.startsWith('[')) {
      const arrayInner = rawVal.slice(1, rawVal.lastIndexOf(']'));
      const items = arrayInner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      if (items.length > 0) {
        const first = items[0];
        if (first === 'system') {
          result.set(canonical, {
            canonicalTool: canonical,
            rawTool: rawKey,
            sourceFile,
            manager: 'mise',
            skipReason: 'system version specified',
          });
        } else {
          result.set(canonical, {
            canonicalTool: canonical,
            rawTool: rawKey,
            version: first,
            sourceFile,
            manager: 'mise',
          });
        }
        continue;
      }
    }

    // Anything else -> unsupported syntax
    result.set(canonical, {
      canonicalTool: canonical,
      rawTool: rawKey,
      sourceFile,
      manager: 'mise',
      skipReason: 'unsupported mise.toml syntax',
    });
  }

  return result;
}
