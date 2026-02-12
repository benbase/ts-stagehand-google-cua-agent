# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiple Kernel applications for browser automation. Apps are managed via npm workspaces in the `apps/` directory.

## Structure

```
├── apps/                   # Kernel apps (workspace root)
│   ├── package.json        # Workspaces: navigator, navigator-dev, navigator-stg
│   ├── tsconfig.json       # TypeScript config
│   ├── node_modules/       # Shared dependencies
│   ├── navigator/          # Computer Controls API (vision-based, production)
│   │   └── payloads/       # Navigator-specific payloads
│   ├── navigator-dev/      # Navigator (dev environment, full copy)
│   │   └── payloads/       # Dev-specific payloads
│   ├── navigator-stg/      # Navigator (staging environment, full copy)
│   │   └── payloads/       # Staging-specific payloads
│   └── shared/
│       ├── credentials/    # Carrier & BenAdmin credential configs
│       │   ├── carriers/   # Insurance carriers (1Password refs)
│       │   └── benadmin/   # BenAdmin (1Password refs)
│       ├── tools/          # Common tool type definitions
│       └── payloads/       # Shared payloads (available to all apps)
├── web/                    # Development UI (separate, own node_modules)
├── deploy.sh               # Deployment script
└── .env                    # API keys
```

## Apps

### `apps/navigator/`
**Kernel App:** `navigator` | **Action:** `navigate-task`

Uses Kernel's Computer Controls API:
- Screenshot-based navigation via `kernel.browsers.computer.*`
- Direct pixel coordinate clicking
- No DOM awareness

### `apps/navigator-dev/`
**Kernel App:** `navigator-DEV` | **Action:** `navigate-task`

Dev environment — full independent copy of navigator. Experiment here, then promote to stg.

### `apps/navigator-stg/`
**Kernel App:** `navigator-STG` | **Action:** `navigate-task`

Staging environment — full independent copy of navigator. Promoted from dev, promote to prod.

### Promotion workflow
`navigator-DEV` → `navigator-STG` → `navigator` (prod). Each is a full copy so changes can be validated at each stage before promotion.

## Commands

```bash
# Install app dependencies
cd apps && npm install

# Install web dependencies (separate)
cd web && npm install

# Deploy
./deploy.sh              # All prod apps
./deploy.sh navigator    # Navigator only
./deploy.sh navigator-dev # Navigator dev only
./deploy.sh navigator-stg # Navigator staging only

# Invoke
kernel invoke navigator navigate-task --payload '{"url": "...", "instruction": "..."}'
kernel invoke navigator-DEV navigate-task --payload '{"url": "...", "instruction": "..."}'
kernel invoke navigator-STG navigate-task --payload '{"url": "...", "instruction": "..."}'

# Local dev
npx --prefix apps tsx apps/navigator/index.ts
npx --prefix apps tsx apps/navigator-dev/index.ts
npx --prefix apps tsx apps/navigator-stg/index.ts

# Web UI
cd web && node server.js
```

## Environment Variables

Required in root `.env`:
- `KERNEL_API_KEY` - Kernel platform
- `GOOGLE_API_KEY` - Gemini models
- `OP_SERVICE_ACCOUNT_TOKEN` - 1Password SDK (credential resolution)

## Payloads

Payloads are task configurations (JSON) or prompt templates (Markdown).

**Locations:**
- `apps/navigator/payloads/` - Navigator prod payloads
- `apps/navigator-dev/payloads/` - Navigator DEV payloads
- `apps/navigator-stg/payloads/` - Navigator STG payloads
- `apps/shared/payloads/` - Shared payloads (available to all apps via web UI)

**Shared Payloads:**
- Accessible from all apps in the web UI
- Displayed with "shared" badge in the payload list
- Markdown files (`.md`) serve as prompt templates/reference docs
- `download_invoice.md` - Default instruction template (master prompt for invoice tasks)

## Key Patterns

- Apps workspace in `apps/` with shared `node_modules`
- `web/` is separate, not part of workspaces
- Kernel manages browser lifecycle
- Computer Controls at `kernel.browsers.computer.*`

## Making an app visible in the Playground

To add or remove an app from the web UI, update these two places:

1. **`web/public/index.html`** — Add/remove a `<button>` in the `.app-switcher` div:
   ```html
   <button class="app-switcher-btn" data-app="my-app" title="Description">Label</button>
   ```
   The `data-app` value must match the key in `APP_CONFIG` (step 2). Add `active` class to the default app.

2. **`web/server.js`** — Add/remove an entry in the `APP_CONFIG` object:
   ```js
   'my-app': { appName: 'my-app', action: 'navigate-task' },
   ```
   This maps the app name to the Kernel app name and action used by `kernel invoke`.

## Documentation

- [Kernel Docs](https://www.kernel.sh/docs)
- [Computer Controls API](https://www.kernel.sh/docs/browsers/computer-controls)
