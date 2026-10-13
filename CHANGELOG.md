# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- German and Spanish translations (configuration screen, messages, widgets, documentation).

### Fixed

- The English documentation names the Gladys screens as the Gladys interface does.

## [1.0.2] - 2026-10-12

### Changed

- `@gladysassistant/integration-sdk` updated to 0.15.0.

### Fixed

- The release script no longer takes the mention of the Unreleased heading in the changelog intro for the section itself, which had left the previous release notes inside the intro.

## [1.0.1] - 2026-10-12

### Added

- First version of the Wemo integration, built on the official JavaScript template: Wemo Switch and Mini, Light Switch, Dimmer, Insight (power and energy), Motion and Maker, controlled on the local network.
- Automatic discovery through the Gladys core (SSDP), plus Wemo addresses typed by hand for networks where SSDP does not cross.
- A Wemo that moves to another port or IP address is found again by its serial number; its badge turns "unreachable" while it does not answer.
- Scene triggers: motion detected, Insight state changed (on, standby, off), Wemo reachable or not.
- Scene actions: toggle a Wemo, read a Wemo Insight, search for Wemo devices.
- Dashboard widgets: "Wemo devices" (every Wemo at a glance) and "Wemo Insight" (live power, energy, 24 h curve).
- Configuration screen buttons: "Search for Wemo devices" and "Test the connection".
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`; CI (format, lint, tests on Node 22 and 24, store checks, Docker build), Release, multi-arch build and GitHub Release workflows; Dependabot.

[Unreleased]: https://github.com/prohand/gladys-wemo/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/prohand/gladys-wemo/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-wemo/releases/tag/v1.0.1
