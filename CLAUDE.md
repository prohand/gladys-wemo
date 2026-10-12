# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors when
working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Belkin Wemo** devices, controlled on the
**local network** over UPnP/SOAP: Switch and Mini, Light Switch, Dimmer, Insight (power +
energy), Motion and Maker. Started from the official JavaScript template
(`GladysAssistant/integration-template-js`). Gladys 5.1+ adds scene triggers (motion detected,
Insight state changed, reachable or not), scene actions (toggle, read an Insight, search) and two
widgets ("Wemo devices", "Wemo Insight").

The Belkin cloud closed in January 2026: the manifest declares `"transports": ["local"]` only,
so there is no `GLADYS_PREFER_LOCAL` toggle to handle.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/fleet.test.js              # one file
node --test --test-name-pattern "motion"    # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on Node 22 and 24, and on
pull requests the store admission checks and a Docker build: run the three commands before
pushing. Releases: **Actions → Release** only (bumps `package.json`, manifest `version` +
`docker_image`, rolls `CHANGELOG.md`, re-runs Prettier, tags, builds, publishes the GitHub
Release).

## Architecture

```
index.js                  SDK wiring only: handlers registered before connect()
src/config.js             DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/wemo/xml.js           tiny tag reader / escaper (no XML dependency)
src/wemo/client.js        HTTP + SOAP client: setup.xml, Get/SetBinaryState, Insight, Maker,
                          `locate` (same serial on another port)
src/wemo/models.js        UPnP deviceType -> family (switch, lightswitch, dimmer, insight...)
src/wemo/discovery.js     SSDP through the core (`scanNetwork`) + addresses typed by hand
src/wemo/states.js        deduplicated state publication (deadband for the power)
src/wemo/fleet.js         known Wemo, polling loop, commands, offline detection, scene triggers
src/devices/index.js      Gladys device per family: features, params, external ids
src/capabilities/         Configuration screen actions, scene actions, widgets, shared texts
docs/en.md, docs/fr.md    user documentation, re-hosted by Gladys (mandatory, kept in sync)
test/                     node --test; helpers fake Gladys, a Wemo LAN (fetch) and the clock
.github/scripts/changelog-release.mjs   rolls [Unreleased] at release time (tested)
```

### Invariants worth knowing

- **External ids are forever**: `gladys.externalIds('wemo', <serial>)`, features keyed by
  `FEATURES` (`binary`, `brightness`, `power`, `energy`, `motion`, `contact`). Never derive them
  from a name or an address. Same for the manifest keys users store (config, actions, scene
  triggers/actions, widgets, their fields), the `WEMO_*` device params and the family names.
- **The address lives in the device params** (`WEMO_HOST`, `WEMO_PORT`): Gladys gives them back
  at every (re)connection, so nothing is stored in `/data`. When a Wemo moves, the fleet
  re-publishes the discovered devices, which upserts the params of the created ones.
- **SSDP never reaches the container** (bridge network): the core runs the M-SEARCH declared in
  the manifest `network_discovery` (`urn:Belkin:service:basicevent:1`, must match
  `SSDP_SEARCH_TARGET`). Only the port of `LOCATION` is kept; the integration connects to the
  `source_ip` of the answer, never to a host a LAN responder names.
- **A Wemo changes port** (49152-49156) after a reboot: on the first transient failure the fleet
  looks for the same serial on the other ports, once per silence. After
  `OFFLINE_AFTER_FAILURES` (3) failures the device is offline: badge `unreachable`,
  `connection_changed` event, and an SSDP rediscovery (at most every 5 minutes).
- **The integration polls itself** (no Gladys `poll_frequency`, no GENA push: the Wemo cannot
  call back into the bridge container). One request at a time per Wemo (a queue per device).
- **Only changes are published** (Gladys takes 300 states/min); the Insight power has a 1 W
  deadband. `start()` (every reconnection) republishes every state once.
- **Scene triggers fire on transitions only**; the first reading after a start is a baseline.
  Scene actions never fire scene events (no loops).
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- `SetBinaryState` to the current state answers `Error`: that is a success.
- Insight `state` 8 = on but in standby (under the threshold set in the Wemo app).

### Manifest

`test/manifest.test.js` ties `gladys-assistant-integration.json` to the code: actions, scene
actions, widgets and triggers declared ⇔ handled/fired, defaults ⇔ `DEFAULT_CONFIG`, SSDP target,
`transports`, bilingual texts, description length, version ⇔ `package.json` ⇔ `docker_image`.
Change both sides together. Texts are `{ "en": ..., "fr": ... }` objects, never plain strings.

## Rules

- **The container rootfs is read-only.** Write only under `/data`. Never log secrets.
- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or the
  manifest, nor the `docker_image` tag, by hand.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version
  heading: the Release workflow does.
- **User-facing text** is bilingual (English and French): action messages, widget texts,
  manifest, `docs/en.md` / `docs/fr.md`.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network (`test/helpers/fakeWemo.js` serves a fake LAN through `fetch`).
