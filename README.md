# Browser Automation with Computer Use Agent (CUA)

Multiple Kernel applications for intelligent browser automation. Each app uses a different approach to control the browser.

## Apps

| App | Kernel Name | Approach | Purpose |
|-----|-------------|----------|---------|
| **navigator** | `navigator` | Vision-based via Computer Controls | Production |
| **navigator-dev** | `navigator-DEV` | Vision-based via Computer Controls | Development (experiment here) |
| **navigator-stg** | `navigator-STG` | Vision-based via Computer Controls | Staging (validate before prod) |
| **driver** | `driver` | DOM-based via Stagehand | Complex forms, reliable element targeting |
| **old** | `old` | DOM-based via Stagehand (legacy) | Original implementation |

### Promotion workflow

`navigator-dev` → `navigator-stg` → `navigator` (prod). Each is a full independent copy so changes can be validated at each stage before promotion.

## Project Structure

```
├── apps/                   # Kernel apps (npm workspaces)
│   ├── package.json        # Workspace root
│   ├── tsconfig.json       # TypeScript config
│   ├── node_modules/       # Shared dependencies
│   ├── navigator/          # Computer Controls API (production)
│   ├── navigator-dev/      # Computer Controls API (dev, full copy)
│   ├── navigator-stg/      # Computer Controls API (staging, full copy)
│   ├── driver/             # Stagehand-based automation
│   └── old/                # Legacy Stagehand
├── web/                    # Development UI (separate)
│   ├── package.json
│   └── node_modules/
├── deploy.sh               # Deployment script
└── .env                    # API keys
```

## Setup

```bash
# Install app dependencies
cd apps && npm install

# Install web UI dependencies (separate)
cd web && npm install

# Configure environment
cp .env-example .env
# Add: KERNEL_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY
```

## Deploy

```bash
./deploy.sh              # Deploy all prod apps (driver, navigator, old)
./deploy.sh navigator    # Deploy only navigator (prod)
./deploy.sh navigator-dev # Deploy only navigator DEV
./deploy.sh navigator-stg # Deploy only navigator STG
./deploy.sh driver       # Deploy only driver
./deploy.sh old          # Deploy only old
```

## Invoke

```bash
# Navigator (prod)
kernel invoke navigator navigate-task --payload '{"url": "https://example.com", "instruction": "..."}'

# Navigator DEV
kernel invoke navigator-DEV navigate-task --payload '{"url": "https://example.com", "instruction": "..."}'

# Navigator STG
kernel invoke navigator-STG navigate-task --payload '{"url": "https://example.com", "instruction": "..."}'

# Driver
kernel invoke driver download-task --payload-file payloads/kp_invoice_test.json
```

## Local Development

```bash
# Run apps locally (from repo root)
npx --prefix apps tsx apps/navigator/index.ts
npx --prefix apps tsx apps/navigator-dev/index.ts
npx --prefix apps tsx apps/navigator-stg/index.ts
npx --prefix apps tsx apps/driver/index.ts

# Web UI
cd web && node server.js
# Open http://localhost:3001
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Task Payload                                │
│              (URL, instructions, credentials)                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
    ┌───────────────┬───────┴───────┬───────────────┐
    ▼               ▼               ▼               ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────────┐
│ NAVIGATOR│ │NAV (DEV) │ │NAV (STG) │ │       DRIVER          │
│  (prod)  │ │  (dev)   │ │ (staging)│ │   (Stagehand-based)   │
├──────────┤ ├──────────┤ ├──────────┤ ├───────────────────────┤
│ Computer │ │ Full     │ │ Full     │ │ • DOM tree analysis   │
│ Controls │ │ copy of  │ │ copy of  │ │ • Semantic actions    │
│ API      │ │ navigator│ │ navigator│ │ • act() / extract()   │
└─────┬────┘ └────┬─────┘ └────┬─────┘ └───────────┬───────────┘
      │           │            │                    │
      └───────────┴────────────┴────────────────────┘
                            ▼
            ┌───────────────────────────────┐
            │     Kernel Browser Instance   │
            │  • Remote Chromium browser    │
            │  • Stealth, proxies, profiles │
            └───────────────────────────────┘
```

## Documentation

- [Apps Guide](apps/README.md) - Detailed app documentation
- [Payloads Guide](payloads/README.md) - Task configurations
- [Web UI Guide](web/README.md) - Development interface
- [Kernel Docs](https://www.kernel.sh/docs) - Platform docs
- [Computer Controls API](https://www.kernel.sh/docs/browsers/computer-controls) - Navigator API
- [Stagehand SDK](https://github.com/browserbase/stagehand) - Driver library
