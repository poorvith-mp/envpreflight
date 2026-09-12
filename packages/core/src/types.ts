export type Severity = 'pass' | 'warn' | 'fail' | 'skipped';

export interface CheckResult {
  id: string;              // 'runtime.node'
  label: string;           // 'Node.js version'
  severity: Severity;
  expected?: string;       // '>=20.0.0'
  actual?: string;         // '18.17.0'
  message: string;         // human-readable
  fix?: string;            // 'nvm install 20 && nvm use 20'
  skipReason?: string;     // required when severity === 'skipped'
  category?: string;       // 'Runtime' | 'Services' | 'Environment' | 'Ports' | 'Docker'
}

export interface Report {
  results: CheckResult[];
  exitCode: 0 | 1 | 2;
  durationMs: number;
  projectName?: string;
}

export interface DetectedManifests {
  hasNode: boolean;
  hasNvmrc: boolean;
  hasPackageJson: boolean;
  hasNodeVersionFile: boolean;
  hasToolVersions: boolean;
  hasMiseToml: boolean;
  hasPython: boolean;
  hasPyprojectToml: boolean;
  hasPythonVersion: boolean;
  hasGo: boolean;
  hasGoMod: boolean;
  hasRust: boolean;
  hasRustToolchain: boolean;
  hasDockerCompose: boolean;
  hasEnvExample: boolean;
  hasEnv: boolean;
  manifestFiles: string[];
}

export interface RunOptions {
  cwd?: string;
  only?: string[];
  skip?: string[];
  timeoutMs?: number;
  workspaces?: boolean;
  workspace?: string;
}
