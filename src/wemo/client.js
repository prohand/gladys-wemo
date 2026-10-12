// -----------------------------------------------------------------------------
// Local Wemo client: UPnP over plain HTTP, on the LAN.
//
// A Wemo exposes its description at http://<ip>:<port>/setup.xml and accepts
// SOAP calls on /upnp/control/<service>1. Two field facts shape this module:
//   - the port is not fixed: a Wemo listens on one of 49152-49156 and may move
//     to another after a reboot or a Wi-Fi reconnection, so a device that
//     stops answering is looked for on the other ports (`locate`), and only
//     accepted there when its serial number matches;
//   - the devices are slow and sometimes drop the connection: every request
//     has a short timeout and the caller decides when a device is offline.
//
// The Belkin cloud was shut down in January 2026: local control is the only
// channel, and the one this integration has always used.
// -----------------------------------------------------------------------------

import { escapeXml, readTag } from './xml.js';

export const WEMO_PORTS = [49152, 49153, 49154, 49155, 49156];

const DEFAULT_TIMEOUT_MS = 3000;

// A Wemo answers a few hundred bytes (setup.xml is ~5 KB): anything far bigger
// is not a Wemo, and is not read into memory.
const MAX_RESPONSE_BYTES = 64 * 1024;

const SERVICES = {
  basicevent: { path: '/upnp/control/basicevent1', type: 'urn:Belkin:service:basicevent:1' },
  insight: { path: '/upnp/control/insight1', type: 'urn:Belkin:service:insight:1' },
  deviceevent: { path: '/upnp/control/deviceevent1', type: 'urn:Belkin:service:deviceevent:1' },
};

export class WemoError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, cause?: unknown }} [options]
   */
  constructor(message, { code = 'WEMO_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'WemoError';
    this.code = code;
  }
}

/** True for an IPv4 address or a plain host name (no scheme, path, user info). */
export function isValidHost(host) {
  return typeof host === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(host);
}

export function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function baseUrl({ host, port }) {
  if (!isValidHost(host) || !isValidPort(port)) {
    throw new WemoError(`Invalid Wemo address ${host}:${port}`, { code: 'BAD_ADDRESS' });
  }
  return `http://${host}:${port}`;
}

/**
 * Parse a setup.xml description.
 * @param {string} xml
 * @returns {{ deviceType?: string, name?: string, manufacturer?: string, model?: string,
 *   serial?: string, udn?: string, mac?: string, firmware?: string }}
 */
export function parseSetup(xml) {
  // Bounded: these strings end up in Gladys (device names, params) and logs.
  const read = (tag, max = 100) => readTag(xml, tag)?.slice(0, max) || undefined;
  return {
    deviceType: read('deviceType'),
    name: read('friendlyName'),
    manufacturer: read('manufacturer'),
    model: read('modelName'),
    serial: read('serialNumber', 64),
    udn: read('UDN', 120),
    mac: read('macAddress', 32),
    firmware: read('firmwareVersion'),
  };
}

/**
 * Parse the `InsightParams` string of an Insight:
 * state|lastchange|onfor|ontoday|ontotal|timeperiod|_|currentmW|todaymW·min|totalmW·min|thresholdmW
 * @param {string} text
 */
export function parseInsightParams(text) {
  const parts = String(text ?? '').split('|');
  if (parts.length < 10) {
    throw new WemoError('Unexpected InsightParams answer', { code: 'BAD_ANSWER' });
  }
  const num = (i) => {
    const value = Number.parseFloat(parts[i]);
    return Number.isFinite(value) ? value : 0;
  };
  // Energy counters are milliwatt-minutes: / 1000 (W) / 1000 (kW) / 60 (h).
  const mwMinToKwh = (value) => value / 60_000_000;
  return {
    state: Number.parseInt(parts[0], 10) || 0,
    onTodaySeconds: num(3),
    onTotalSeconds: num(4),
    powerW: num(7) / 1000,
    todayKwh: mwMinToKwh(num(8)),
    totalKwh: mwMinToKwh(num(9)),
    thresholdW: parts.length > 10 ? num(10) / 1000 : undefined,
  };
}

/**
 * Parse the attribute list of a Maker (`GetAttributes`), itself XML escaped
 * inside the SOAP answer: { Switch: '0', Sensor: '1', SensorPresent: '1', ... }.
 * @param {string} attributeList decoded content of <attributeList>
 */
export function parseAttributes(attributeList) {
  const attributes = {};
  const pattern = /<attribute>\s*<name>([^<]{1,64})<\/name>\s*<value>([^<]{0,64})<\/value>/g;
  for (const [, name, value] of String(attributeList ?? '').matchAll(pattern)) {
    attributes[name.trim()] = value.trim();
  }
  return attributes;
}

/**
 * Normalize the BinaryState field: an Insight answers "8|1611105078|..." (8 is
 * "on, standby"), the others a single digit.
 */
export function parseBinaryState(text) {
  const value = Number.parseInt(String(text ?? '').split('|')[0], 10);
  if (!Number.isFinite(value)) {
    throw new WemoError('Unexpected BinaryState answer', { code: 'BAD_ANSWER' });
  }
  return value;
}

/**
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createWemoClient({
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  async function request(url, init = {}) {
    let response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new WemoError(timeout ? 'No answer (timeout)' : 'Connection failed', {
        code: timeout ? 'TIMEOUT' : 'UNREACHABLE',
        cause: err,
      });
    }
    const length = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
      throw new WemoError('Answer too large for a Wemo', { code: 'BAD_ANSWER' });
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new WemoError('Answer too large for a Wemo', { code: 'BAD_ANSWER' });
    }
    return { status: response.status, ok: response.ok, text };
  }

  async function fetchSetup(target) {
    const { ok, status, text } = await request(`${baseUrl(target)}/setup.xml`);
    if (!ok) {
      throw new WemoError(`setup.xml answered HTTP ${status}`, { code: 'BAD_ANSWER' });
    }
    const setup = parseSetup(text);
    if (!setup.deviceType || !/belkin/i.test(setup.deviceType)) {
      throw new WemoError('Not a Wemo device', { code: 'NOT_WEMO' });
    }
    return setup;
  }

  async function call(target, serviceName, action, args = {}) {
    const service = SERVICES[serviceName];
    const body =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
      's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
      `<u:${action} xmlns:u="${service.type}">` +
      Object.entries(args)
        .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
        .join('') +
      `</u:${action}></s:Body></s:Envelope>`;
    const { ok, status, text } = await request(`${baseUrl(target)}${service.path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        // The quotes are part of the header value: some firmwares refuse it bare.
        SOAPACTION: `"${service.type}#${action}"`,
      },
      body,
    });
    if (!ok) {
      const fault = readTag(text, 'errorDescription') ?? readTag(text, 'faultstring');
      throw new WemoError(`${action} refused (HTTP ${status}${fault ? `, ${fault}` : ''})`, {
        code: 'REFUSED',
      });
    }
    return text;
  }

  return {
    fetchSetup,
    call,

    /** @returns {Promise<{ state: number, brightness?: number }>} */
    async getBinaryState(target) {
      const text = await call(target, 'basicevent', 'GetBinaryState');
      const state = parseBinaryState(readTag(text, 'BinaryState'));
      const brightness = Number.parseInt(readTag(text, 'brightness') ?? '', 10);
      return Number.isFinite(brightness) ? { state, brightness } : { state };
    },

    async setBinaryState(target, state, brightness) {
      const args = { BinaryState: state ? 1 : 0 };
      if (brightness !== undefined) {
        args.brightness = brightness;
      }
      const text = await call(target, 'basicevent', 'SetBinaryState', args);
      // A Wemo already in the requested state answers "Error" instead of the
      // new value: that is a success, not a failure.
      const answer = readTag(text, 'BinaryState');
      return answer === undefined || answer === 'Error' ? undefined : parseBinaryState(answer);
    },

    async getInsightParams(target) {
      const text = await call(target, 'insight', 'GetInsightParams');
      return parseInsightParams(readTag(text, 'InsightParams'));
    },

    async getAttributes(target) {
      const text = await call(target, 'deviceevent', 'GetAttributes');
      return parseAttributes(readTag(text, 'attributeList'));
    },

    /**
     * Find on which port the Wemo of this serial number answers now, the
     * known port first. Resolves the port, or `undefined`.
     */
    async locate(host, serial, knownPort) {
      const ports = [...new Set([knownPort, ...WEMO_PORTS].filter(isValidPort))];
      for (const port of ports) {
        try {
          const setup = await fetchSetup({ host, port });
          if (setup.serial === serial) {
            return port;
          }
        } catch {
          // Not this port: try the next one.
        }
      }
      return undefined;
    },
  };
}
