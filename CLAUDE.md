# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiple Kernel applications for browser automation. Apps are managed via npm workspaces in the `apps/` directory.

## Structure

```
├── apps/                   # Kernel apps (workspace root)
│   ├── package.json        # Workspaces: driver, navigator, old
│   ├── tsconfig.json       # TypeScript config
│   ├── node_modules/       # Shared dependencies
│   ├── driver/             # Stagehand-based (DOM automation)
│   │   └── payloads/       # Driver-specific payloads
│   ├── navigator/          # Computer Controls API (vision-based)
│   │   └── payloads/       # Navigator-specific payloads
│   ├── old/                # Legacy Stagehand implementation
│   │   └── payloads/       # Old-specific payloads
│   └── shared/
│       └── payloads/       # Shared payloads (available to all apps)
├── web/                    # Development UI (separate, own node_modules)
├── deploy.sh               # Deployment script
└── .env                    # API keys
```

## Apps

### `apps/driver/`
**Kernel App:** `driver` | **Action:** `download-task`

Uses Stagehand for DOM-based automation:
- Semantic element targeting via `act()` and `extract()`
- Custom tools: `perform_login`, `report_result`
- Handles 2FA (TOTP and email-based)

### `apps/navigator/`
**Kernel App:** `navigator` | **Action:** `navigate-task`

Uses Kernel's Computer Controls API:
- Screenshot-based navigation via `kernel.browsers.computer.*`
- Direct pixel coordinate clicking
- No DOM awareness

### `apps/old/`
**Kernel App:** `old` | **Action:** `download-task`

Legacy Stagehand implementation (original approach):
- Stagehand-based DOM automation
- Custom tools: `perform_login`, `report_result`
- Handles 2FA (TOTP and email-based)

## Commands

```bash
# Install app dependencies
cd apps && npm install

# Install web dependencies (separate)
cd web && npm install

# Deploy
./deploy.sh              # Both apps
./deploy.sh driver       # Driver only
./deploy.sh navigator    # Navigator only
./deploy.sh old          # Old only

# Invoke
kernel invoke driver download-task --payload-file payloads/example.json
kernel invoke navigator navigate-task --payload '{"url": "...", "instruction": "..."}'

# Local dev
npx --prefix apps tsx apps/driver/index.ts
npx --prefix apps tsx apps/navigator/index.ts
npx --prefix apps tsx apps/old/index.ts

# Web UI
cd web && node server.js
```

## Environment Variables

Required in root `.env`:
- `KERNEL_API_KEY` - Kernel platform
- `GOOGLE_API_KEY` - Gemini models
- `OPENAI_API_KEY` - Stagehand (driver and old)

## Payloads

Payloads are task configurations (JSON) or prompt templates (Markdown).

**Locations:**
- `apps/driver/payloads/` - Driver-specific payloads
- `apps/navigator/payloads/` - Navigator-specific payloads
- `apps/old/payloads/` - Old-specific payloads
- `apps/shared/payloads/` - Shared payloads (available to all apps via web UI)

**Shared Payloads:**
- Accessible from all apps in the web UI
- Displayed with "shared" badge in the payload list
- Markdown files (`.md`) serve as prompt templates/reference docs
- `master_prompt_001.md` - Unified invoice download prompt with carrier-specific best practices

## Key Patterns

- Apps workspace in `apps/` with shared `node_modules`
- `web/` is separate, not part of workspaces
- Kernel manages browser lifecycle
- Computer Controls at `kernel.browsers.computer.*`

## Documentation

- [Kernel Docs](https://www.kernel.sh/docs)
- [Computer Controls API](https://www.kernel.sh/docs/browsers/computer-controls)
- [Stagehand SDK](https://github.com/browserbase/stagehand)
