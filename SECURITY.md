# Security policy

## Supported versions

Only the latest release of the Wemo integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue, pull request or forum post for a
security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-wemo](https://github.com/prohand/gladys-wemo/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens and addresses first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
and the Wemo devices and their firmware (Belkin).

## How the integration limits its exposure

- It only talks to the LAN, over plain HTTP, the only protocol the Wemo devices
  offer locally: anyone on the same network can drive a Wemo, with or without
  this integration. Keep the Wemo devices on a trusted network (or an IoT VLAN
  reachable by Gladys only).
- It opens no port: no UPnP callback server, nothing listens in the container.
- An SSDP answer cannot send it anywhere: it only keeps the port of the
  `LOCATION` header and connects to the IP the answer came from, and only
  accepts a device on a new port when its serial number matches.
- Answers are size-bounded (64 KB) and parsed as text, never evaluated; the
  strings stored in Gladys (names, params) are length-bounded.
- It stores no secret and writes nothing outside `/data`.

## Good practices for users

- Give the Wemo devices fixed IP addresses on a network you control.
- Keep Gladys and the integration up to date.
