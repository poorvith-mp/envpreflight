# Changelog

All notable changes to `envpreflight` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-12

### Added
- **Unified Tool Version Manifest Support**: Native parsing for `.tool-versions` and `mise.toml` (`[tools]` table) covering Node.js, Python, Go, Rust, Java, Bun, Deno, and Ruby with zero external runtime dependencies.
- **Monorepo Workspace Discovery & Deduplication**: Automatic workspace package resolution for `pnpm-workspace.yaml` and `package.json` workspaces (glob matching up to depth 4, 50-package cap). Cross-workspace failure deduplication collapses identical mismatches across 3 or more packages.
- **Safe Interactive Fix & Undo Engine**:
  - `envpreflight --fix`: Categorized fix execution plan (`install`, `kill`, `env`, `other`) with reversibility markers. Requires interactive TTY confirmation for dangerous process terminations (`kill`).
  - `envpreflight undo`: Reverses non-destructive fixes (such as `.env` placeholder additions) logged to `.envpreflight/last-fix.jsonl`.
- **GitHub Actions Formatting**: Added `--format github` emitting inline workflow annotations (`::error`, `::warning`) and Markdown step summaries for CI runs.
- **Composite GitHub Action**: Standalone reusable action in `own/envpreflight-action`.
- **Windows Port Probing**: Native Node `net.createServer` probe with `exclusive: true` binding to `127.0.0.1` and `0.0.0.0`, paired with PowerShell PID resolution for accurate port conflict detection without `netstat`.
- **Configuration Walk-Up & Init**:
  - Upward configuration file discovery finding nearest `.envpreflightrc.json` up to git repository root.
  - `envpreflight init` command generating commented template configurations with detected ports and options.

### Changed
- Improved error messages and suggested commands for version management tools (`mise install`, `nvm use`, `pyenv local`).
- Enhanced port conflict diagnostics to report owning process ID and appropriate termination command per operating system (`kill <pid>` on POSIX, `Stop-Process -Id <pid>` on Windows).

## [1.0.1] - 2026-03-01

### Fixed
- Fixed CLI binary execution permissions in published distribution tarball.

## [1.0.0] - 2026-02-15

### Added
- Initial stable release of `@envpreflight/core` and `@envpreflight/cli`.
- Manifest detection for Node.js (`.nvmrc`, `package.json`), Python (`pyproject.toml`, `.python-version`), Go (`go.mod`), and Rust (`rust-toolchain.toml`).
- Service availability checks for PostgreSQL, Redis, MySQL, and MongoDB.
- Docker daemon and container status checks.
- Environment variable parity checks between `.env.example` and `.env`.
- Port binding collision detection.
