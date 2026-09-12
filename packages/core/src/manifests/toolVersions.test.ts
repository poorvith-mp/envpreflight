import { describe, it, expect } from 'vitest';
import { parseToolVersions, parseMiseToml } from './toolVersions.js';

describe('toolVersions parser', () => {
  it('parses .tool-versions lines taking the first version', () => {
    const content = `
# Comment line
nodejs 20.11.0
python 3.12.1 3.11
ruby 3.3.0
`;
    const tools = parseToolVersions(content, '.tool-versions');
    expect(tools.get('node')).toEqual({
      canonicalTool: 'node',
      rawTool: 'nodejs',
      version: '20.11.0',
      sourceFile: '.tool-versions',
      manager: 'mise',
    });
    expect(tools.get('python')).toEqual({
      canonicalTool: 'python',
      rawTool: 'python',
      version: '3.12.1',
      sourceFile: '.tool-versions',
      manager: 'mise',
    });
    expect(tools.get('ruby')).toEqual({
      canonicalTool: 'ruby',
      rawTool: 'ruby',
      version: '3.3.0',
      sourceFile: '.tool-versions',
      manager: 'mise',
    });
  });

  it('marks system version as skipped', () => {
    const content = 'node system\n';
    const tools = parseToolVersions(content, '.tool-versions');
    expect(tools.get('node')).toEqual({
      canonicalTool: 'node',
      rawTool: 'node',
      sourceFile: '.tool-versions',
      manager: 'mise',
      skipReason: 'system version specified',
    });
  });

  it('parses mise.toml [tools] table with string and array versions', () => {
    const content = `
[settings]
experimental = true

[tools]
node = "22"
python = ["3.12", "3.11"]
golang = "1.22.0"
`;
    const tools = parseMiseToml(content, 'mise.toml');
    expect(tools.get('node')?.version).toBe('22');
    expect(tools.get('python')?.version).toBe('3.12');
    expect(tools.get('go')?.version).toBe('1.22.0');
  });

  it('marks unsupported inline table in mise.toml as skipped without failing others', () => {
    const content = `
[tools]
node = { version = "20", os = "linux" }
python = "3.12"
`;
    const tools = parseMiseToml(content, 'mise.toml');
    expect(tools.get('node')?.skipReason).toBe('unsupported mise.toml syntax');
    expect(tools.get('python')?.version).toBe('3.12');
  });

  it('maps tool aliases correctly (nodejs->node, golang->go)', () => {
    const content = 'nodejs 18.0.0\ngolang 1.21.0\n';
    const tools = parseToolVersions(content, '.tool-versions');
    expect(tools.has('node')).toBe(true);
    expect(tools.has('go')).toBe(true);
  });
});
