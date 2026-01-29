# Browser Automation with Computer Use Agent (CUA)

Multiple Kernel applications for intelligent browser automation. Each app uses a different approach to control the browser.

## Apps

| App | Approach | Best For |
|-----|----------|----------|
| **driver** | DOM-based via Stagehand | Complex forms, reliable element targeting |
| **navigator** | Vision-based via Computer Controls | Visual apps, obfuscated DOMs |

## Project Structure

```
├── apps/                   # Kernel apps (npm workspaces)
│   ├── package.json        # Workspace root
│   ├── tsconfig.json       # TypeScript config
│   ├── node_modules/       # Shared dependencies
│   ├── driver/             # Stagehand-based automation
│   │   ├── index.ts
│   │   ├── tools.ts
│   │   ├── types.ts
│   │   └── package.json
│   └── navigator/          # Computer Controls API
│       ├── index.ts
│       ├── types.ts
│       └── package.json
├── payloads/               # Task configurations
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
./deploy.sh              # Deploy both apps
./deploy.sh driver       # Deploy only driver
./deploy.sh navigator    # Deploy only navigator
```

## Invoke

```bash
# Driver
kernel invoke driver download-task --payload-file payloads/kp_invoice_test.json

# Navigator
kernel invoke navigator navigate-task --payload '{"url": "https://example.com", "instruction": "..."}'
```

## Local Development

```bash
# Run apps locally (from repo root)
npx --prefix apps tsx apps/driver/index.ts
npx --prefix apps tsx apps/navigator/index.ts

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
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────┐
│       DRIVER          │       │      NAVIGATOR        │
│   (Stagehand-based)   │       │  (Computer Controls)  │
├───────────────────────┤       ├───────────────────────┤
│ • DOM tree analysis   │       │ • Screenshot capture  │
│ • Semantic actions    │       │ • Pixel coordinates   │
│ • act() / extract()   │       │ • clickMouse()        │
│ • Custom login tools  │       │ • typeText()          │
└───────────┬───────────┘       └───────────┬───────────┘
            │                               │
            └───────────────┬───────────────┘
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
