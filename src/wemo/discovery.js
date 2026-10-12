// -----------------------------------------------------------------------------
// Wemo discovery.
//
// The integration runs in a bridge container: SSDP multicast never reaches it.
// The Gladys core (host network) runs the M-SEARCH for us — `scanNetwork`, on
// the search target the manifest declares in `network_discovery` — and hands
// back the raw answers. We only keep the port and the path of their LOCATION
// header and always talk to the IP the answer came FROM: a LAN responder
// cannot send the integration to fetch an arbitrary URL.
//
// Networks where multicast does not cross (VLANs, mesh Wi-Fi, an older Gladys
// without mediated discovery) are covered by the addresses the user types in
// the `hosts` configuration field, probed on every Wemo port.
// -----------------------------------------------------------------------------

import { WEMO_PORTS, isValidHost, isValidPort } from './client.js';
import { kindOf } from './models.js';

// The search target every Wemo answers: they all carry the basicevent service.
// Must match the manifest `network_discovery` entry (checked by the tests).
export const SSDP_SEARCH_TARGET = 'urn:Belkin:service:basicevent:1';

export const SSDP_TIMEOUT_SECONDS = 5;

/**
 * Parse a raw SSDP answer into lowercase header names.
 * @param {string} raw
 */
export function parseSsdpHeaders(raw) {
  const headers = {};
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  return headers;
}

/**
 * Turn the raw `scanNetwork('ssdp')` results into addresses to probe.
 * @param {Array<{ source_ip: string, headers: string }>} results
 * @returns {Array<{ host: string, port: number }>}
 */
export function ssdpCandidates(results) {
  const candidates = new Map();
  for (const result of results ?? []) {
    const headers = parseSsdpHeaders(result?.headers);
    if (!isValidHost(result?.source_ip) || !headers.location) {
      continue;
    }
    // Only Wemo answers: the search target, the USN or the Wemo server header.
    const isWemo = [headers.st, headers.usn, headers.server, headers['x-user-agent']].some(
      (value) => /belkin|redsonic|wemo/i.test(value ?? ''),
    );
    if (!isWemo) {
      continue;
    }
    let location;
    try {
      location = new URL(headers.location);
    } catch {
      continue;
    }
    const port = Number(location.port || 80);
    if (location.protocol !== 'http:' || !isValidPort(port)) {
      continue;
    }
    candidates.set(`${result.source_ip}:${port}`, { host: result.source_ip, port });
  }
  return [...candidates.values()];
}

/**
 * Parse the `hosts` configuration field: addresses separated by commas,
 * spaces or new lines, each optionally followed by `:port`.
 * @param {string} text
 * @returns {{ hosts: Array<{ host: string, port?: number }>, invalid: string[] }}
 */
export function parseHosts(text) {
  const hosts = [];
  const invalid = [];
  for (const token of String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)) {
    const match = /^([^:]+)(?::(\d{1,5}))?$/.exec(token);
    const host = match?.[1];
    const port = match?.[2] === undefined ? undefined : Number(match[2]);
    if (!match || !isValidHost(host) || (port !== undefined && !isValidPort(port))) {
      invalid.push(token.slice(0, 60));
      continue;
    }
    hosts.push(port === undefined ? { host } : { host, port });
  }
  return { hosts, invalid };
}

/**
 * Discover the Wemo devices of the LAN.
 *
 * @param {object} options
 * @param {{ scanNetwork: Function }} options.gladys
 * @param {ReturnType<import('./client.js').createWemoClient>} options.client
 * @param {{ hosts: string }} options.config
 * @param {{ info: Function, warn: Function, debug: Function }} options.logger
 * @returns {Promise<{ devices: object[], unsupported: object[], unreachable: string[],
 *   invalidHosts: string[], ssdpError?: Error }>}
 */
export async function discover({ gladys, client, config, logger }) {
  const result = { devices: [], unsupported: [], unreachable: [], invalidHosts: [] };
  const probes = [];

  // 1) SSDP, through the core.
  try {
    const answers = await gladys.scanNetwork('ssdp', { timeoutSeconds: SSDP_TIMEOUT_SECONDS });
    const candidates = ssdpCandidates(answers);
    logger.info(`SSDP: ${answers.length} answer(s), ${candidates.length} Wemo address(es)`);
    for (const candidate of candidates) {
      probes.push(client.fetchSetup(candidate).then((setup) => ({ ...candidate, setup })));
    }
  } catch (err) {
    // 403 (older core, capture not granted) or a scan already running (429):
    // the typed addresses still work.
    logger.warn(`SSDP discovery unavailable: ${err.message}`);
    result.ssdpError = err;
  }

  // 2) Addresses typed by the user: the given port, or every Wemo port.
  const { hosts, invalid } = parseHosts(config.hosts);
  result.invalidHosts = invalid;
  for (const { host, port } of hosts) {
    probes.push(
      probeHost(client, host, port).then((found) => {
        if (!found) {
          result.unreachable.push(port ? `${host}:${port}` : host);
        }
        return found;
      }),
    );
  }

  const bySerial = new Map();
  for (const outcome of await Promise.allSettled(probes)) {
    if (outcome.status !== 'fulfilled' || !outcome.value) {
      if (outcome.status === 'rejected') {
        logger.debug(`Discovery probe failed: ${outcome.reason?.message}`);
      }
      continue;
    }
    const { host, port, setup } = outcome.value;
    const kind = kindOf(setup.deviceType);
    if (!setup.serial) {
      continue;
    }
    if (!kind) {
      result.unsupported.push({ host, name: setup.name, deviceType: setup.deviceType });
      continue;
    }
    bySerial.set(setup.serial, {
      serial: setup.serial,
      kind,
      name: setup.name,
      model: setup.model,
      firmware: setup.firmware,
      mac: setup.mac,
      host,
      port,
    });
  }
  result.devices = [...bySerial.values()];
  for (const { host, name, deviceType } of result.unsupported) {
    logger.info(`Unsupported Wemo skipped: ${name ?? '?'} (${deviceType}) at ${host}`);
  }
  return result;
}

async function probeHost(client, host, port) {
  for (const candidate of port ? [port] : WEMO_PORTS) {
    try {
      return { host, port: candidate, setup: await client.fetchSetup({ host, port: candidate }) };
    } catch {
      // Next port.
    }
  }
  return undefined;
}
