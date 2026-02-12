To address: https://github.com/benbase/ai-worker/issues/319

Changes in the tools' layer: https://github.com/benbase/ai-worker/pull/204

---

## Summary

Browser automation system using Google's Gemini Computer Use model with Kernel's Computer Controls API. The agent navigates websites via screenshots (vision-based), logs in securely, searches for documents, and downloads files — all without DOM awareness.

### Environments

| App | Kernel Name | Purpose |
|-----|-------------|---------|
| `navigator` | `navigator` | Production |
| `navigator-dev` | `navigator-DEV` | Development (experiment here) |
| `navigator-stg` | `navigator-STG` | Staging (validate before prod) |

Promotion workflow: `navigator-DEV` → `navigator-STG` → `navigator`

Each environment is a full independent copy so changes can be validated at each stage.

### Capabilities

- **Secure login** — credentials stored in 1Password, resolved at runtime via SDK. The model never sees credential values; it calls `perform_login` with screen coordinates and the system types the actual credentials.
- **2FA support** — TOTP (authenticator codes) and email-based verification
- **Document download** — automatic detection of downloaded files across multiple browser directories
- **Proxy support** — mobile, residential, ISP, or datacenter proxies for bot detection avoidance
- **Session recording** — every run is recorded for replay and debugging

### Carriers (17) & BenAdmin platforms (3)

**Carriers:** Aetna, Ameritas, Anthem, Beam Benefits, Blue Shield, CalChoice, Cigna (Dental), Cigna (Medical), Covered CA, Equitable, Guardian, Humana, Kaiser, MetLife, Principal, UHC, VSP

**BenAdmin:** Ease, Gusto, Rippling

All credentials managed in `shared/credentials/` with 1Password `op://` references.

> **Note:** While the AOPs for various carriers and BenAdmin platforms may be functional, the final POCs still need to be created. Each AOP follows a specific structure (`# Goal`, `# Best Practices`, `# Deliverable`, `# Common Errors`) defined in the [Apps & Payloads Guide](apps/README.md).

### Playground (Web UI)

Development interface for testing and debugging tasks. Provides:
- **Payload editor** — select and modify task payloads before running
- **Live browser view** — watch the browser in real-time as the agent works
- **Streaming logs** — agent reasoning and actions as they happen
- **Session history** — past runs with recordings and downloaded files
- **Provider picker** — auto-fills URL and credentials from carrier config

```
cd web && node server.js
# Open http://localhost:3001
```

---

## Deploy

```bash
./deploy.sh              # All prod apps
./deploy.sh navigator    # Navigator (prod) only
./deploy.sh navigator-dev # Navigator DEV only
./deploy.sh navigator-stg # Navigator STG only
```

## Invoke

```bash
# Production
kernel invoke navigator navigate-task --payload-file apps/navigator/payloads/kaiser_download_invoice.json

# Dev
kernel invoke navigator-DEV navigate-task --payload-file apps/navigator-dev/payloads/kaiser_download_invoice.json

# Staging
kernel invoke navigator-STG navigate-task --payload-file apps/navigator-stg/payloads/kaiser_download_invoice.json
```

## Project Structure

```
├── apps/
│   ├── navigator/          # Production (vision-based automation)
│   ├── navigator-dev/      # Dev environment (full copy)
│   ├── navigator-stg/      # Staging environment (full copy)
│   └── shared/
│       ├── credentials/    # 1Password credential configs
│       │   ├── carriers/   # Insurance carriers (17)
│       │   └── benadmin/   # BenAdmin platforms (3)
│       └── payloads/       # Shared payloads & master prompt
├── web/                    # Playground UI
│   ├── server.js           # Express server with API routes
│   └── public/             # Frontend (HTML/JS/CSS)
├── deploy.sh               # Deployment script
└── .env                    # API keys
```
