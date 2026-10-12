import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { buildDevice, idsOf } from '../src/devices/index.js';
import { createWemoClient } from '../src/wemo/client.js';
import { SCENE_TRIGGERS, createFleet } from '../src/wemo/fleet.js';
import { createFakeClock } from './helpers/fakeClock.js';
import { createFakeGladys, createFakeLogger } from './helpers/fakeGladys.js';
import { createFakeWemoNetwork } from './helpers/fakeWemo.js';

const DEVICES = {
  plug: { kind: 'switch', serial: 'P1', name: 'Kitchen', host: '192.168.1.20', port: 49153 },
  dimmer: { kind: 'dimmer', serial: 'D1', name: 'Lounge', host: '192.168.1.21', port: 49153 },
  insight: { kind: 'insight', serial: 'I1', name: 'Washer', host: '192.168.1.22', port: 49153 },
  motion: { kind: 'motion', serial: 'M1', name: 'Hall', host: '192.168.1.23', port: 49153 },
  maker: { kind: 'maker', serial: 'K1', name: 'Garage', host: '192.168.1.24', port: 49153 },
};

// A Gladys device as the user created it from the discovery payload.
function created(gladys, device, name = device.name) {
  return { ...buildDevice(gladys, device), name };
}

function setup(devices = Object.values(DEVICES), config = {}) {
  const network = createFakeWemoNetwork(devices);
  const gladys = createFakeGladys();
  const clock = createFakeClock();
  const changes = [];
  const fleet = createFleet({
    gladys,
    client: createWemoClient({ fetch: network.fetch }),
    logger: createFakeLogger(),
    config: normalizeConfig(config),
    timers: clock.timers,
    now: clock.now,
    onChange: (kind) => changes.push(kind),
  });
  fleet.syncFromGladys(devices.map((device) => created(gladys, device)));
  const entry = (serial) => fleet.entries().find((e) => e.serial === serial);
  const feature = (serial, key) => idsOf(gladys, serial).feature(key);
  return { network, gladys, clock, fleet, entry, feature, changes };
}

test('a read publishes the states, then only what changed', async () => {
  const { network, gladys, fleet, entry, feature } = setup([DEVICES.plug]);
  await fleet.refresh(entry('P1'));
  await fleet.refresh(entry('P1'));
  assert.deepEqual(gladys.statesOf(feature('P1', 'binary')), [0]);

  network.device('P1').state = 1; // switched from its button
  await fleet.refresh(entry('P1'));
  assert.deepEqual(gladys.statesOf(feature('P1', 'binary')), [0, 1]);
  assert.deepEqual(gladys.transports, [
    { external_id: idsOf(gladys, 'P1').device, transport: 'local' },
  ]);
});

test('every family is read into its features', async () => {
  const { network, gladys, fleet, entry, feature } = setup();
  Object.assign(network.device('D1'), { state: 1, brightness: 40 });
  network.device('I1').insight = {
    state: 1,
    powerMw: 1_234_567,
    todayMwMin: 60_000_000,
    totalMwMin: 600_000_000,
    onToday: 600,
  };
  network.device('M1').state = 1;
  network.device('K1').attributes = { Switch: '1', Sensor: '0', SensorPresent: '1' };
  for (const e of fleet.entries()) {
    await fleet.refresh(e);
  }
  assert.deepEqual(gladys.statesOf(feature('D1', 'binary')), [1]);
  assert.deepEqual(gladys.statesOf(feature('D1', 'brightness')), [40]);
  assert.deepEqual(gladys.statesOf(feature('I1', 'binary')), [1]);
  assert.deepEqual(gladys.statesOf(feature('I1', 'power')), [1234.6]);
  assert.deepEqual(gladys.statesOf(feature('I1', 'energy')), [10]);
  assert.deepEqual(gladys.statesOf(feature('M1', 'motion')), [1]);
  assert.deepEqual(gladys.statesOf(feature('K1', 'binary')), [1]);
  assert.deepEqual(gladys.statesOf(feature('K1', 'contact')), [1]);
  assert.ok(entry('I1').online);
});

test('a Maker without a sensor wired publishes no input state', async () => {
  const { network, gladys, fleet, entry, feature } = setup([DEVICES.maker]);
  network.device('K1').attributes = { Switch: '0', Sensor: '1', SensorPresent: '0' };
  await fleet.refresh(entry('K1'));
  assert.deepEqual(gladys.statesOf(feature('K1', 'contact')), []);
});

test('motion fires motion_detected on the 0 -> 1 edge only, never on the baseline', async () => {
  const { network, gladys, fleet, entry } = setup([DEVICES.motion]);
  network.device('M1').state = 1;
  await fleet.refresh(entry('M1')); // baseline: already moving at start
  assert.deepEqual(gladys.sceneEvents, []);

  network.device('M1').state = 0;
  await fleet.refresh(entry('M1'));
  network.device('M1').state = 1;
  await fleet.refresh(entry('M1'));
  await fleet.refresh(entry('M1')); // still moving: not a new detection
  assert.deepEqual(gladys.sceneEvents, [
    {
      key: SCENE_TRIGGERS.MOTION_DETECTED,
      data: { device: idsOf(gladys, 'M1').device, device_name: 'Hall' },
    },
  ]);
});

test('an Insight fires insight_state_changed when the appliance finishes', async () => {
  const { network, gladys, fleet, entry } = setup([DEVICES.insight]);
  const insight = network.device('I1').insight;
  Object.assign(insight, { state: 1, powerMw: 2_000_000 });
  await fleet.refresh(entry('I1'));
  Object.assign(insight, { powerMw: 1_800_000 }); // still running: no event
  await fleet.refresh(entry('I1'));
  Object.assign(insight, { state: 8, powerMw: 2_500 });
  await fleet.refresh(entry('I1'));
  assert.deepEqual(gladys.sceneEvents, [
    {
      key: SCENE_TRIGGERS.INSIGHT_STATE_CHANGED,
      data: {
        device: idsOf(gladys, 'I1').device,
        device_name: 'Washer',
        state: 'standby',
        power: 2.5,
      },
    },
  ]);
});

test('a Wemo gone silent turns unreachable after three failures, then comes back', async () => {
  const { network, gladys, fleet, entry, changes } = setup([DEVICES.plug]);
  const device = idsOf(gladys, 'P1').device;
  await fleet.refresh(entry('P1'));
  network.device('P1').failure = 'timeout';
  await fleet.refresh(entry('P1'));
  await fleet.refresh(entry('P1'));
  assert.equal(entry('P1').online, true, 'two lost answers are not an outage');
  await fleet.refresh(entry('P1'));
  assert.equal(entry('P1').online, false);
  assert.deepEqual(gladys.transports.at(-1), { external_id: device, transport: 'unreachable' });
  assert.deepEqual(gladys.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.CONNECTION_CHANGED,
    data: { device, device_name: 'Kitchen', status: 'offline' },
  });
  assert.deepEqual(fleet.summary(), { total: 1, online: 0, offline: 1 });

  network.device('P1').failure = undefined;
  await fleet.refresh(entry('P1'));
  assert.equal(entry('P1').online, true);
  assert.deepEqual(gladys.transports.at(-1), { external_id: device, transport: 'local' });
  assert.deepEqual(gladys.sceneEvents.at(-1).data.status, 'online');
  assert.ok(changes.includes('connection'));
});

test('a Wemo that moved to another port is followed, and its new port saved in Gladys', async () => {
  const { network, gladys, fleet, entry } = setup([DEVICES.plug]);
  await fleet.refresh(entry('P1'));
  network.device('P1').port = 49154; // rebooted
  await fleet.refresh(entry('P1'));
  assert.equal(entry('P1').port, 49154);
  assert.equal(entry('P1').failures, 0);
  const saved = gladys.lastDiscovered()[0].params.find((p) => p.name === 'WEMO_PORT');
  assert.equal(saved.value, '49154');
});

test('a silent Wemo is found again at a new IP by SSDP', async () => {
  const { network, gladys, fleet, entry } = setup([DEVICES.plug], { poll_interval: 10 });
  await fleet.refresh(entry('P1'));
  network.device('P1').host = '192.168.1.120'; // new DHCP lease
  gladys.ssdpAnswers = network.ssdpAnswers();
  for (let i = 0; i < 3; i += 1) {
    await fleet.refresh(entry('P1'));
  }
  // The offline transition started a rediscovery in the background.
  await new Promise((resolve) => setImmediate(resolve));
  await fleet.rediscover(); // joins or reruns it
  assert.equal(entry('P1').host, '192.168.1.120');
  await fleet.refresh(entry('P1'));
  assert.equal(entry('P1').online, true);
  const saved = gladys.lastDiscovered()[0].params.find((p) => p.name === 'WEMO_HOST');
  assert.equal(saved.value, '192.168.1.120');
});

test('onSetValue switches the relay and publishes the state read back', async () => {
  const { network, gladys, fleet, feature } = setup([DEVICES.plug]);
  const device = { external_id: idsOf(gladys, 'P1').device };
  await fleet.setValue(device, { external_id: feature('P1', 'binary') }, 1);
  assert.equal(network.device('P1').state, 1);
  assert.deepEqual(gladys.statesOf(feature('P1', 'binary')), [1]);
  await assert.rejects(
    fleet.setValue({ external_id: 'ext:wemo-test:wemo:NOPE' }, { external_id: 'x' }, 1),
    /Unknown Wemo/,
  );
});

test('the dimmer brightness: 0 switches off, a level switches on at that level', async () => {
  const { network, gladys, fleet, feature } = setup([DEVICES.dimmer]);
  const device = { external_id: idsOf(gladys, 'D1').device };
  await fleet.setValue(device, { external_id: feature('D1', 'brightness') }, 140);
  assert.equal(network.device('D1').state, 1);
  assert.equal(network.device('D1').brightness, 100);
  await fleet.setValue(device, { external_id: feature('D1', 'brightness') }, 0);
  assert.equal(network.device('D1').state, 0);
  assert.equal(network.device('D1').brightness, 100, 'the level is kept for the next On');
});

test('a read-only feature cannot be set', async () => {
  const { gladys, fleet, feature } = setup([DEVICES.motion]);
  await assert.rejects(
    fleet.setValue(
      { external_id: idsOf(gladys, 'M1').device },
      { external_id: feature('M1', 'motion') },
      1,
    ),
    /cannot be set/,
  );
});

test('toggle inverts the relay and says what it is now', async () => {
  const { network, gladys, fleet } = setup([DEVICES.plug, DEVICES.motion]);
  assert.equal(await fleet.toggle(idsOf(gladys, 'P1').device), true);
  assert.equal(network.device('P1').state, 1);
  assert.equal(await fleet.toggle(idsOf(gladys, 'P1').device), false);
  assert.equal(await fleet.toggle(idsOf(gladys, 'M1').device), undefined, 'no relay');
});

test('the loop reads each Wemo at its own interval, and stops', async () => {
  const { network, fleet, clock, entry } = setup([DEVICES.plug, DEVICES.motion], {
    poll_interval: 10,
    motion_poll_interval: 2,
  });
  fleet.start();
  await clock.advance(1000);
  assert.ok(entry('P1').reading && entry('M1').reading);
  const reads = (serial) =>
    network.requests.filter((r) => r.url.includes(network.device(serial).host)).length;
  const before = { plug: reads('P1'), motion: reads('M1') };
  await clock.advance(10_000);
  assert.equal(reads('P1') - before.plug, 1);
  assert.equal(reads('M1') - before.motion, 5);
  fleet.stop();
  assert.equal(clock.pendingCount, 0);
});

test('devices deleted from Gladys are no longer read; created ones are', async () => {
  const { gladys, fleet, entry, clock } = setup([DEVICES.plug]);
  fleet.start();
  fleet.deviceDeleted({ external_id: idsOf(gladys, 'P1').device });
  assert.equal(entry('P1').created, false);
  assert.equal(clock.pendingCount, 0);
  fleet.deviceCreated(created(gladys, DEVICES.plug, 'Kitchen plug'));
  assert.equal(entry('P1').name, 'Kitchen plug');
  assert.equal(clock.pendingCount, 1);
});

test('syncFromGladys keeps an address learned since, and ignores foreign devices', () => {
  const { gladys, fleet, entry } = setup([DEVICES.plug]);
  entry('P1').port = 49155;
  fleet.syncFromGladys([
    created(gladys, DEVICES.plug),
    { external_id: 'ext:other:thing', name: 'Not ours', params: [] },
  ]);
  assert.equal(entry('P1').port, 49155);
  assert.equal(fleet.entries().length, 1);
});
