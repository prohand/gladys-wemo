import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WemoError,
  createWemoClient,
  isValidHost,
  parseAttributes,
  parseBinaryState,
  parseInsightParams,
  parseSetup,
} from '../src/wemo/client.js';
import { decodeEntities, escapeXml, readTag } from '../src/wemo/xml.js';
import { createFakeWemoNetwork } from './helpers/fakeWemo.js';

const plug = {
  kind: 'switch',
  serial: '221517K0101769',
  name: 'Kitchen',
  host: '192.168.1.20',
  port: 49153,
};

test('readTag reads a tag whatever its namespace prefix, decoded', () => {
  assert.equal(readTag('<u:BinaryState>1</u:BinaryState>', 'BinaryState'), '1');
  assert.equal(
    readTag('<friendlyName>Tom &amp; Jerry</friendlyName>', 'friendlyName'),
    'Tom & Jerry',
  );
  assert.equal(readTag('<a>1</a>', 'b'), undefined);
  assert.equal(decodeEntities('&#65;&#x42;&lt;'), 'AB<');
  assert.equal(escapeXml('<a&"\'>'), '&lt;a&amp;&quot;&apos;&gt;');
});

test('parseSetup reads the identity of a Wemo, bounded', () => {
  const setup = parseSetup(
    `<root><device><deviceType>urn:Belkin:device:controllee:1</deviceType><friendlyName>${'x'.repeat(300)}</friendlyName><serialNumber>ABC</serialNumber></device></root>`,
  );
  assert.equal(setup.deviceType, 'urn:Belkin:device:controllee:1');
  assert.equal(setup.serial, 'ABC');
  assert.equal(setup.name.length, 100);
});

test('parseInsightParams converts milliwatts and milliwatt-minutes', () => {
  const params = parseInsightParams(
    '8|1611105078|0|3600|1230|1209600|10|123456|6000000|60000000|8000',
  );
  assert.equal(params.state, 8);
  assert.equal(params.powerW, 123.456);
  assert.equal(params.todayKwh, 0.1);
  assert.equal(params.totalKwh, 1);
  assert.equal(params.onTodaySeconds, 3600);
  assert.equal(params.thresholdW, 8);
  assert.throws(() => parseInsightParams('1|2'), WemoError);
});

test('parseAttributes and parseBinaryState', () => {
  assert.deepEqual(
    parseAttributes(
      '<attribute><name>Switch</name><value>1</value></attribute><attribute><name>Sensor</name><value>0</value></attribute>',
    ),
    { Switch: '1', Sensor: '0' },
  );
  assert.equal(parseBinaryState('8|1611105078|0'), 8);
  assert.equal(parseBinaryState('0'), 0);
  assert.throws(() => parseBinaryState('Error'), WemoError);
});

test('isValidHost refuses anything but a host name or an IPv4', () => {
  assert.ok(isValidHost('192.168.1.20'));
  assert.ok(isValidHost('wemo-kitchen.lan'));
  for (const bad of ['http://x', 'a/b', 'user@host', '', ' x', 'x:80', undefined]) {
    assert.ok(!isValidHost(bad), bad);
  }
});

test('a SOAP call carries the quoted SOAPACTION and the escaped arguments', async () => {
  const network = createFakeWemoNetwork([plug]);
  const client = createWemoClient({ fetch: network.fetch });
  await client.setBinaryState(plug, true);
  const request = network.requests.at(-1);
  assert.equal(request.url, 'http://192.168.1.20:49153/upnp/control/basicevent1');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.SOAPACTION, '"urn:Belkin:service:basicevent:1#SetBinaryState"');
  assert.match(request.body, /<BinaryState>1<\/BinaryState>/);
  assert.deepEqual(await client.getBinaryState(plug), { state: 1 });
});

test('setBinaryState to the current state is a success ("Error" answer)', async () => {
  const network = createFakeWemoNetwork([{ ...plug, state: 1 }]);
  const client = createWemoClient({ fetch: network.fetch });
  assert.equal(await client.setBinaryState(plug, true), undefined);
});

test('the dimmer brightness is read and written', async () => {
  const dimmer = { ...plug, kind: 'dimmer', brightness: 30, state: 1 };
  const network = createFakeWemoNetwork([dimmer]);
  const client = createWemoClient({ fetch: network.fetch });
  assert.deepEqual(await client.getBinaryState(dimmer), { state: 1, brightness: 30 });
  await client.setBinaryState(dimmer, true, 75);
  assert.equal(network.device(plug.serial).brightness, 75);
});

test('failures carry a code the fleet can act on', async () => {
  const network = createFakeWemoNetwork([{ ...plug, failure: 'timeout' }]);
  const client = createWemoClient({ fetch: network.fetch });
  await assert.rejects(client.getBinaryState(plug), { code: 'TIMEOUT' });
  await assert.rejects(client.getBinaryState({ ...plug, port: 49154 }), { code: 'UNREACHABLE' });

  network.device(plug.serial).failure = undefined;
  await assert.rejects(client.call(plug, 'basicevent', 'Nope'), {
    code: 'REFUSED',
    message: /Invalid Action/,
  });
  await assert.rejects(client.getBinaryState({ host: 'http://evil', port: 80 }), {
    code: 'BAD_ADDRESS',
  });
});

test('an oversized answer is refused', async () => {
  const fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => 'x'.repeat(70 * 1024),
  });
  await assert.rejects(createWemoClient({ fetch }).fetchSetup(plug), { code: 'BAD_ANSWER' });
});

test('fetchSetup refuses a device that is not a Wemo', async () => {
  const fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () =>
      '<root><device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType></device></root>',
  });
  await assert.rejects(createWemoClient({ fetch }).fetchSetup(plug), { code: 'NOT_WEMO' });
});

test('locate finds the Wemo of the same serial on another port', async () => {
  const network = createFakeWemoNetwork([
    { ...plug, port: 49155 },
    { ...plug, serial: 'OTHER', port: 49152 },
  ]);
  const client = createWemoClient({ fetch: network.fetch });
  assert.equal(await client.locate(plug.host, plug.serial, 49153), 49155);
  assert.equal(await client.locate(plug.host, 'MISSING', 49153), undefined);
});
