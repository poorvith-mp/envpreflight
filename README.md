# envpreflight

> **Check your machine can actually run this project — before you waste a day finding out it can't.**

One command, one report. `envpreflight` reads the manifests already in the repository and verifies your local runtime versions, service availability, Docker state, port bindings, and environment variables in under 3 seconds with zero network calls and zero configuration.

[![CI](https://github.com/poorvith-mp/envpreflight/actions/workflows/ci.yml/badge.svg)](https://github.com/poorvith-mp/envpreflight/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@envpreflight/cli.svg)](https://www.npmjs.com/package/@envpreflight/cli)

---

## Quickstart

Run directly from any project root without installation:

```bash
npx @envpreflight/cli
```

Or install globally to use the direct `envpreflight` command anywhere:

```bash
npm install -g @envpreflight/cli

# Then run anywhere:
envpreflight
```

---

## Terminal Output Sample

```
envpreflight · my-fullstack-app

Runtime
  ✓ Node.js          20.11.0        (.nvmrc wants 20)
  ✗ Python           3.9.6          pyproject.toml wants >=3.11
    → pyenv install 3.11.7 && pyenv local 3.11.7

Services
  ✓ PostgreSQL       reachable on 5432
  ✗ Redis            nothing listening on 6379
    → docker compose up -d redis

Environment
  ! .env              2 keys in .env.example are missing:
                      STRIPE_SECRET_KEY, RESEND_API_KEY

Ports
  ✗ 3000             in use by node (pid 48213)
    → kill 48213

3 failed · 1 warning · 2 passed · 0.8s
```

---

## Core Checks

| Check Area | Supported Manifests & Detection | Fix Suggestions |
| :--- | :--- | :--- |
| **Tool Versions** | `.tool-versions`, `mise.toml` (`[tools]`) | `mise install` / tool version manager |
| **Node.js** | `.tool-versions`, `mise.toml`, `.nvmrc`, `package.json` (`engines.node`) | `nvm install <ver> && nvm use <ver>` |
| **Python** | `.tool-versions`, `mise.toml`, `pyproject.toml` (`requires-python`), `.python-version` | `pyenv install <ver> && pyenv local <ver>` |
| **Go** | `.tool-versions`, `mise.toml`, `go.mod` | `brew install go@<ver>` |
| **Rust** | `.tool-versions`, `mise.toml`, `rust-toolchain.toml`, `rust-toolchain` | `rustup toolchain install <ver>` |
| **Services** | Postgres (5432), Redis (6379), MySQL (3306), MongoDB (27017) | `docker compose up -d <svc>` / `brew services start <svc>` |
| **Docker** | Docker daemon responsiveness, `docker-compose.yml` service states | `open -a Docker`, `docker compose up -d` |
| **Environment** | Keys diff between `.env.example` and `.env` | `cp .env.example .env` or missing key names |
| **Ports** | Application ports from `.env.example` / compose / configs | `kill <pid>` (POSIX) / `Stop-Process -Id <pid>` (Windows) |

---

## CLI Commands & Flags

### Commands

| Command | Description |
| :--- | :--- |
| `envpreflight [options]` | Run pre-flight checks against project (default command) |
| `envpreflight init [--force]` | Initialize a `.envpreflightrc.json` configuration file |
| `envpreflight undo` | Undo non-destructive changes from the last `--fix` run |

### Options

| Flag | Description |
| :--- | :--- |
| *(default)* | Run all detected checks against the current working directory |
| `--format <type>` | Output format: `terminal` (default), `json`, or `github` (annotations & summary) |
| `--json` | Alias for `--format json` |
| `--only <ids>` | Comma-separated list of check IDs or categories (e.g. `--only runtime,services`) |
| `--skip <ids>` | Comma-separated list of check IDs or categories to skip |
| `--fix` | Present and execute suggested fixes interactively |
| `--dry-run` | Show fix plan without executing (requires `--fix`) |
| `-y, --yes` | Non-interactive mode; auto-confirm safe fixes (requires `--fix`) |
| `--workspace <dir>` | Run checks against a specific workspace directory |
| `--no-workspaces` | Disable monorepo workspace discovery and scan root only |
| `-q, --quiet` | Display failures and warnings only |
| `--cwd <path>` | Target a specific project directory |
| `--version` | Print current version |
| `--help` | Show help manual |

---

## Exit Codes for CI

`envpreflight` is designed for build pipelines and pre-commit hooks:

- **`0`**: All checks passed (or no project manifests detected)
- **`1`**: Blocking failure detected (e.g. wrong runtime version, missing service, occupied port)
- **`2`**: Warnings only (e.g. non-blocking env key drift)

---

## Three Surfaces, One Core

`envpreflight` is architected as a modular monorepo:

1. **CLI (`envpreflight`)**: Utilitarian terminal runner with aligned columns, distinct symbols (`✓`, `!`, `✗`, `-`, `→`), and `NO_COLOR` support.
2. **VS Code Extension (`envpreflight-vscode`)**: Silent status bar item on launch, interactive report panel with native theme tokens and "Run in terminal" fix buttons.
3. **MCP Server (`@envpreflight/mcp`)**: Model Context Protocol tool `envpreflight_check` for AI coding agents (Claude Code, Cursor, Windsurf).

### MCP Server Setup

Add to your `mcpServers` configuration:

```json
{
  "mcpServers": {
    "envpreflight": {
      "command": "npx",
      "args": ["-y", "@envpreflight/mcp"]
    }
  }
}
```

---

## Security & Privacy Guarantee

- **Zero Network Calls**: `envpreflight` runs entirely locally with zero telemetry, zero analytics, and zero remote registry lookups.
- **Strict Zero Value Leakage**: `.env` and `.env.example` files are parsed for variable **keys only**. Secret values are never read, stored, printed, logged, or transmitted under any condition.

---

## Platform Support

- **macOS & Linux**: Full native support.
- **Windows**: Full support within WSL (Windows Subsystem for Linux) and native Node/PowerShell environments.

---

## License

MIT License. Crafted for developers who value fast, frictionless repo setup.
