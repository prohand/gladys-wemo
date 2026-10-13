# Gladys Wemo

External integration for [Gladys Assistant](https://gladysassistant.com) that controls **Belkin
Wemo** devices on the **local network** — no account, no cloud (the Belkin cloud closed in
January 2026; local control keeps working).

Built with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

## Features

| Wemo                | Gladys features                   |
| ------------------- | --------------------------------- |
| Switch, Mini        | on/off (switch)                   |
| Light Switch, 3-Way | on/off (light)                    |
| Dimmer              | on/off + brightness (light)       |
| Insight             | on/off + power (W) + energy (kWh) |
| Motion              | motion sensor                     |
| Maker               | relay + input (opening sensor)    |

- **Discovery** through the Gladys core (SSDP, manifest `network_discovery`), plus addresses
  typed by hand for networks where multicast does not cross.
- **Transport badge**: `local` / `unreachable` per device (manifest `"transports": ["local"]`).
- **Self-healing**: a Wemo that moves to another port or IP is found again by its serial number.
- **Scene triggers** (Gladys 5.1+): `motion_detected`, `insight_state_changed` (on / standby /
  off — "the washing machine has finished"), `connection_changed` (offline / online).
- **Scene actions**: `toggle_device`, `read_insight` (state, power, energy today),
  `rediscover`.
- **Dashboard widgets**: `wemo_overview` (every Wemo at a glance + Search button) and
  `wemo_insight` (live power and energy, today, 24 h curve, on/off button).
- **Configuration screen buttons**: "Search for Wemo devices", "Test the connection".

## Project structure

```
.
├─ index.js                          # SDK bootstrap + wiring (no protocol logic)
├─ src/
│  ├─ config.js                      # config defaults + normalization
│  ├─ wemo/                          # the Wemo protocol and the polling loop
│  │  ├─ client.js                   #   UPnP/SOAP client (setup.xml, BinaryState, Insight, Maker)
│  │  ├─ discovery.js                #   SSDP via the core + typed addresses
│  │  ├─ fleet.js                    #   known devices, polling, commands, offline, scene triggers
│  │  ├─ models.js                   #   deviceType -> family
│  │  ├─ states.js                   #   deduplicated state publication
│  │  └─ xml.js                      #   minimal XML helpers
│  ├─ devices/index.js               # Gladys devices, features, params, external ids
│  └─ capabilities/                  # actions, scene actions, widgets (Gladys 5.1+)
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # unit tests (`node --test`), fake Gladys / Wemo LAN / clock
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready, non-root
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for coding assistants & contributors
├─ SECURITY.md                       # how to report a vulnerability privately
├─ .github/workflows/ci.yml          # format, lint, tests (Node 22 + 24), store checks, Docker build
├─ .github/workflows/release.yml     # UI-driven release: bump + changelog + tag + build + release
├─ .github/workflows/build.yml       # multi-arch image (amd64 + arm64) to ghcr.io
├─ .github/workflows/github-release.yml # GitHub Release of every version tag
├─ .github/scripts/changelog-release.mjs # rolls the [Unreleased] changelog section
├─ .github/dependabot.yml            # npm weekly, Actions and Docker monthly
└─ cover.png                         # catalog cover, 800×534 px
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="wemo" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the integration runs
in its container; the SDK reads them.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs the first three on Node 22 and 24 for every push and pull request, and, on pull
requests, the store admission checks and a Docker build.

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps `package.json` and the manifest (`version`, `docker_image`), rolls the
changelog, pushes the `vX.Y.Z` tag, builds the `linux/amd64` + `linux/arm64` image to
`ghcr.io/prohand/gladys-wemo` (`:X.Y.Z` and `:latest`) and publishes the GitHub Release. The
Gladys store indexer picks up the new version.

First publication checklist: make the repository and the ghcr.io package **public**, add the
GitHub topic `gladys-assistant-integration`, allow GitHub Actions to push to `main` if it is
protected, and turn on **Private vulnerability reporting** ([`SECURITY.md`](SECURITY.md)).

## License

Apache-2.0
