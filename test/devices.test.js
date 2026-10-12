import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES,
  buildDevice,
  entryFromGladysDevice,
  featureKeyOf,
  statesOf,
} from '../src/devices/index.js';
import { KINDS } from '../src/wemo/models.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const base = { serial: '221517K0101769', host: '192.168.1.20', port: 49153, name: 'Kitchen' };

const featureKeys = (device) => device.features.map((f) => f.external_id.split(':').at(-1));

test('each family gets its features', () => {
  const expected = {
    [KINDS.SWITCH]: ['binary'],
    [KINDS.LIGHT_SWITCH]: ['binary'],
    [KINDS.DIMMER]: ['binary', 'brightness'],
    [KINDS.INSIGHT]: ['binary', 'power', 'energy'],
    [KINDS.MOTION]: ['motion'],
    [KINDS.MAKER]: ['binary', 'contact'],
  };
  for (const [kind, keys] of Object.entries(expected)) {
    assert.deepEqual(featureKeys(buildDevice(gladys, { ...base, kind })), keys, kind);
  }
  assert.equal(
    buildDevice(gladys, { ...base, kind: KINDS.LIGHT_SWITCH }).features[0].category,
    'light',
  );
  assert.equal(buildDevice(gladys, { ...base, kind: KINDS.SWITCH }).features[0].category, 'switch');
});

test('every feature declares min and max (NOT NULL in Gladys)', () => {
  for (const kind of Object.values(KINDS)) {
    for (const feature of buildDevice(gladys, { ...base, kind }).features) {
      assert.equal(typeof feature.min, 'number', `${kind}.${feature.name} min`);
      assert.equal(typeof feature.max, 'number', `${kind}.${feature.name} max`);
    }
  }
});

test('external ids are built from the serial, never from the name or the address', () => {
  const a = buildDevice(gladys, { ...base, kind: KINDS.SWITCH });
  const b = buildDevice(gladys, { ...base, kind: KINDS.SWITCH, name: 'Renamed', host: '10.0.0.9' });
  assert.equal(a.external_id, 'ext:wemo-test:wemo:221517K0101769');
  assert.equal(a.external_id, b.external_id);
  assert.equal(a.features[0].external_id, 'ext:wemo-test:wemo:221517K0101769:binary');
  // An odd serial cannot break the id format.
  assert.equal(
    buildDevice(gladys, { ...base, serial: 'a:b c', kind: KINDS.SWITCH }).external_id,
    'ext:wemo-test:wemo:a_b_c',
  );
});

test('the address travels in the params and comes back from Gladys', () => {
  const entry = { ...base, kind: KINDS.INSIGHT, model: 'Insight', firmware: '2.00', mac: 'AA' };
  const device = buildDevice(gladys, entry);
  assert.deepEqual(entryFromGladysDevice(gladys, device), entry);
  assert.equal(entryFromGladysDevice(gladys, { ...device, params: [] }), undefined);
  assert.equal(
    entryFromGladysDevice(gladys, { external_id: 'ext:other:x', params: [] }),
    undefined,
  );
});

test('a device without a friendly name is named after its family', () => {
  assert.equal(
    buildDevice(gladys, { ...base, name: undefined, kind: KINDS.DIMMER }).name,
    'Wemo Dimmer',
  );
});

test('statesOf rounds the readings and marks the power with a deadband', () => {
  const entry = { ...base, kind: KINDS.INSIGHT };
  const states = statesOf(gladys, entry, { on: true, powerW: 12.345, totalKwh: 1.23456 });
  assert.deepEqual(
    states.map(({ id, value, deadband }) => [id.split(':').at(-1), value, deadband]),
    [
      ['binary', 1, undefined],
      ['power', 12.3, 1],
      ['energy', 1.235, undefined],
    ],
  );
});

test('featureKeyOf reads the key of a feature of THIS device only', () => {
  const entry = { ...base, kind: KINDS.DIMMER };
  const device = buildDevice(gladys, entry);
  assert.equal(featureKeyOf(gladys, entry, device.features[1].external_id), FEATURES.BRIGHTNESS);
  assert.equal(featureKeyOf(gladys, entry, 'ext:wemo-test:wemo:OTHER:binary'), undefined);
});
