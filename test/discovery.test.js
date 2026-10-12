import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWemoClient } from '../src/wemo/client.js';
import {
  SSDP_SEARCH_TARGET,
  discover,
  parseHosts,
  parseSsdpHeaders,
  ssdpCandidates,
} from '../src/wemo/discovery.js';
import { kindOf } from '../src/wemo/models.js';
import { createFakeGladys, createFakeLogger } from './helpers/fakeGladys.js';
import { createFakeWemoNetwork } from './helpers/fakeWemo.js';

test('kindOf maps the Wemo device types, and nothing else', () => {
  assert.equal(kindOf('urn:Belkin:device:controllee:1'), 'switch');
  assert.equal(kindOf('urn:Belkin:device:insight:1'), 'insight');
  assert.equal(kindOf('urn:Belkin:device:Maker:1'), 'maker');
  assert.equal(kindOf('urn:Belkin:device:sensor:1'), 'motion');
  assert.equal(kindOf('urn:Belkin:device:bridge:1'), undefined);
  assert.equal(kindOf('urn:schemas-upnp-org:device:basic:1'), undefined);
});

test('parseSsdpHeaders lowercases the header names', () => {
  const headers = parseSsdpHeaders(
    'HTTP/1.1 200 OK\r\nLOCATION: http://1.2.3.4:49153/setup.xml\r\nST: x\r\n',
  );
  assert.equal(headers.location, 'http://1.2.3.4:49153/setup.xml');
  assert.equal(headers.st, 'x');
});

test('ssdpCandidates talks to the source IP, never to the LOCATION host', () => {
  const candidates = ssdpCandidates([
    {
      source_ip: '192.168.1.20',
      headers: `LOCATION: http://10.0.0.1:49153/setup.xml\r\nST: ${SSDP_SEARCH_TARGET}\r\n`,
    },
    // Not a Wemo.
    {
      source_ip: '192.168.1.30',
      headers: 'LOCATION: http://192.168.1.30:80/desc.xml\r\nST: upnp:rootdevice\r\n',
    },
    // Not http.
    {
      source_ip: '192.168.1.40',
      headers: `LOCATION: file:///etc/passwd\r\nST: ${SSDP_SEARCH_TARGET}\r\n`,
    },
    // Bad source.
    { source_ip: 'not an ip', headers: `LOCATION: http://x:1/\r\nST: ${SSDP_SEARCH_TARGET}\r\n` },
    // Duplicate answer.
    {
      source_ip: '192.168.1.20',
      headers: `LOCATION: http://192.168.1.20:49153/setup.xml\r\nST: ${SSDP_SEARCH_TARGET}\r\n`,
    },
  ]);
  assert.deepEqual(candidates, [{ host: '192.168.1.20', port: 49153 }]);
});

test('parseHosts reads addresses with an optional port and reports the bad ones', () => {
  assert.deepEqual(parseHosts(' 192.168.1.20, 192.168.1.21:49153\nwemo.lan;; bad/host x:99999 '), {
    hosts: [{ host: '192.168.1.20' }, { host: '192.168.1.21', port: 49153 }, { host: 'wemo.lan' }],
    invalid: ['bad/host', 'x:99999'],
  });
  assert.deepEqual(parseHosts(''), { hosts: [], invalid: [] });
});

test('discover merges SSDP and typed addresses, by serial', async () => {
  const network = createFakeWemoNetwork([
    { kind: 'switch', serial: 'S1', name: 'Kitchen', host: '192.168.1.20', port: 49153 },
    { kind: 'insight', serial: 'S2', name: 'Washer', host: '192.168.1.21', port: 49154 },
    { kind: 'bridge', serial: 'S3', name: 'Link', host: '192.168.1.22', port: 49153 },
    { kind: 'motion', serial: 'S4', name: 'Hall', host: '10.0.5.9', port: 49155 },
  ]);
  const gladys = createFakeGladys({ ssdpAnswers: network.ssdpAnswers().slice(0, 3) });
  const result = await discover({
    gladys,
    client: createWemoClient({ fetch: network.fetch }),
    // The motion sensor sits on another VLAN: typed by hand, port unknown.
    // The kitchen plug is typed too: one device, not two.
    config: { hosts: '10.0.5.9, 192.168.1.20:49153, 192.168.1.99, bad/one' },
    logger: createFakeLogger(),
  });
  assert.deepEqual(gladys.scans, [{ type: 'ssdp', options: { timeoutSeconds: 5 } }]);
  assert.deepEqual(
    result.devices.map((device) => [device.serial, device.kind, device.port]).sort(),
    [
      ['S1', 'switch', 49153],
      ['S2', 'insight', 49154],
      ['S4', 'motion', 49155],
    ],
  );
  assert.deepEqual(
    result.unsupported.map((device) => device.name),
    ['Link'],
  );
  assert.deepEqual(result.unreachable, ['192.168.1.99']);
  assert.deepEqual(result.invalidHosts, ['bad/one']);
  assert.equal(result.ssdpError, undefined);
});

test('discover still probes the typed addresses when SSDP is refused', async () => {
  const network = createFakeWemoNetwork([
    { kind: 'switch', serial: 'S1', name: 'Kitchen', host: '192.168.1.20', port: 49152 },
  ]);
  const error = Object.assign(new Error('Forbidden'), { status: 403 });
  const result = await discover({
    gladys: createFakeGladys({ scanError: error }),
    client: createWemoClient({ fetch: network.fetch }),
    config: { hosts: '192.168.1.20' },
    logger: createFakeLogger(),
  });
  assert.equal(result.ssdpError, error);
  assert.deepEqual(
    result.devices.map((device) => device.serial),
    ['S1'],
  );
});
