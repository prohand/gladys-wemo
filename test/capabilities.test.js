// -----------------------------------------------------------------------------
// Scene actions, Configuration screen actions and dashboard widgets, on a fake
// LAN of Wemo devices.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { ACTIONS } from '../src/capabilities/actions.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import {
  INSIGHT_WIDGET,
  OVERVIEW_WIDGET,
  WIDGETS,
  WIDGET_ACTIONS,
  createWidgetRefresher,
} from '../src/capabilities/widgets.js';
import { buildDevice, idsOf } from '../src/devices/index.js';
import { createWemoClient } from '../src/wemo/client.js';
import { createFleet } from '../src/wemo/fleet.js';
import { createFakeClock } from './helpers/fakeClock.js';
import { createFakeGladys, createFakeLogger } from './helpers/fakeGladys.js';
import { createFakeWemoNetwork } from './helpers/fakeWemo.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const PLUG = { kind: 'switch', serial: 'P1', name: 'Kitchen', host: '192.168.1.20', port: 49153 };
const INSIGHT = {
  kind: 'insight',
  serial: 'I1',
  name: 'Washer',
  host: '192.168.1.22',
  port: 49153,
};
const MOTION = { kind: 'motion', serial: 'M1', name: 'Hall', host: '192.168.1.23', port: 49153 };

function setup({ devices = [PLUG, INSIGHT, MOTION], createdSerials } = {}) {
  const network = createFakeWemoNetwork(devices);
  const gladys = createFakeGladys({ ssdpAnswers: network.ssdpAnswers() });
  const fleet = createFleet({
    gladys,
    client: createWemoClient({ fetch: network.fetch }),
    logger: createFakeLogger(),
    config: normalizeConfig(),
  });
  const createdDevices = devices.filter(
    (device) => !createdSerials || createdSerials.includes(device.serial),
  );
  fleet.syncFromGladys(createdDevices.map((device) => buildDevice(gladys, device)));
  return { network, gladys, fleet };
}

const declaredOutputs = (key) =>
  manifest.scene_actions.find((action) => action.key === key).outputs.map((o) => o.key);

test('scene actions only resolve their declared outputs', async () => {
  const { network, gladys, fleet } = setup();
  network.device('I1').insight = {
    state: 8,
    powerMw: 3000,
    todayMwMin: 6_000_000,
    totalMwMin: 0,
    onToday: 0,
  };
  const results = {
    toggle_device: await SCENE_ACTIONS.toggle_device(gladys, {
      fields: { device: idsOf(gladys, 'P1').device },
      fleet,
    }),
    read_insight: await SCENE_ACTIONS.read_insight(gladys, {
      fields: { device: idsOf(gladys, 'I1').device },
      fleet,
    }),
    rediscover: await SCENE_ACTIONS.rediscover(gladys, { fields: {}, fleet }),
  };
  for (const [key, outputs] of Object.entries(results)) {
    assert.deepEqual(Object.keys(outputs).sort(), declaredOutputs(key).sort(), key);
  }
  assert.deepEqual(results.toggle_device, { toggled: true, is_on: true });
  assert.deepEqual(results.read_insight, {
    reachable: true,
    state: 'standby',
    power: 3,
    today_energy: 0.1,
  });
  assert.deepEqual(results.rediscover, { found: 3 });
  // No scene action fires a scene event (it would loop through the integration).
  assert.deepEqual(gladys.sceneEvents, []);
});

test('a scene action on the wrong device is an output, not a failure', async () => {
  const { network, gladys, fleet } = setup();
  assert.deepEqual(
    await SCENE_ACTIONS.toggle_device(gladys, {
      fields: { device: idsOf(gladys, 'M1').device },
      fleet,
    }),
    { toggled: false, is_on: false },
  );
  assert.equal(
    (
      await SCENE_ACTIONS.read_insight(gladys, {
        fields: { device: idsOf(gladys, 'P1').device },
        fleet,
      })
    ).state,
    'unsupported',
  );
  network.device('I1').failure = 'timeout';
  assert.deepEqual(
    await SCENE_ACTIONS.read_insight(gladys, {
      fields: { device: idsOf(gladys, 'I1').device },
      fleet,
    }),
    { reachable: false, state: 'unreachable', power: 0, today_energy: 0 },
  );
});

test('"Search for Wemo devices" publishes them and lists what it found', async () => {
  const { gladys, fleet } = setup({ createdSerials: ['P1'] });
  const message = await ACTIONS.scan(gladys, { fleet });
  assert.match(message.en, /3 Wemo found, 2 not added yet/);
  assert.match(message.fr, /3 Wemo trouvé\(s\), dont 2 pas encore/);
  assert.match(message.en, /Washer \(192\.168\.1\.22\)/);
  assert.equal(gladys.lastDiscovered().length, 3);
});

test('"Search" says when nothing answers and when SSDP is unavailable', async () => {
  const { gladys, fleet } = setup({ devices: [] });
  gladys.scanError = new Error('Forbidden');
  const message = await ACTIONS.scan(gladys, { fleet });
  assert.match(message.en, /No Wemo answered/);
  assert.match(message.en, /Automatic search unavailable/);
});

test('"Test the connection" reads every Wemo now', async () => {
  const { network, gladys, fleet } = setup();
  network.device('M1').failure = 'refuse';
  const message = await ACTIONS.test_connection(gladys, { fleet });
  assert.match(message.en, /OK {2}Kitchen \(192\.168\.1\.20\): Off/);
  assert.match(message.en, /KO {2}Hall \(192\.168\.1\.23\), port 49153: Connection failed/);
  assert.match(message.fr, /OK {2}Kitchen \(192\.168\.1\.20\) : Éteint/);

  const empty = setup({ devices: [] });
  assert.match(
    (await ACTIONS.test_connection(empty.gladys, { fleet: empty.fleet })).en,
    /No Wemo added/,
  );
});

test('the overview widget renders exactly as sent: empty, then with devices', async () => {
  const empty = setup({ devices: [] });
  const emptyContent = await WIDGETS[OVERVIEW_WIDGET].get(empty.gladys, { fleet: empty.fleet });
  assert.deepEqual(validateWidgetContent(emptyContent), []);

  const { network, gladys, fleet } = setup();
  network.device('I1').insight.state = 1;
  network.device('I1').insight.powerMw = 450_000;
  network.device('M1').failure = 'timeout';
  for (const entry of fleet.entries()) {
    for (let i = 0; i < 3; i += 1) {
      await fleet.refresh(entry);
    }
  }
  const content = await WIDGETS[OVERVIEW_WIDGET].get(gladys, { fleet });
  assert.deepEqual(validateWidgetContent(content), []);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    ['2/3', 450],
  );
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.equal(rows[0].label, 'Hall', 'unreachable devices first');
  assert.equal(rows[0].value.en, 'Unreachable');
  const button = content.components.find((c) => c.type === 'button');
  assert.equal(button.action.key, WIDGET_ACTIONS.REDISCOVER);
});

test('the overview button runs a search and answers a short toast', async () => {
  const { gladys, fleet } = setup();
  const toast = await WIDGETS[OVERVIEW_WIDGET].action(gladys, {
    actionKey: WIDGET_ACTIONS.REDISCOVER,
    fleet,
  });
  assert.ok(toast.en.length <= 200 && toast.fr.length <= 200);
  assert.match(toast.en, /3 Wemo found/);
  await assert.rejects(
    WIDGETS[OVERVIEW_WIDGET].action(gladys, { actionKey: 'nope', fleet }),
    /Unknown widget action/,
  );
});

test('the Insight widget binds its tiles and chart to the Insight features', async () => {
  const { network, gladys, fleet } = setup();
  const insight = idsOf(gladys, 'I1');
  const notChosen = await WIDGETS[INSIGHT_WIDGET].get(gladys, { fleet, settings: {} });
  assert.deepEqual(validateWidgetContent(notChosen), []);
  assert.equal(notChosen.components[0].type, 'text');

  network.device('I1').insight = {
    state: 1,
    powerMw: 900_000,
    todayMwMin: 0,
    totalMwMin: 0,
    onToday: 3900,
  };
  await fleet.refresh(fleet.entryByExternalId(insight.device));
  const content = await WIDGETS[INSIGHT_WIDGET].get(gladys, {
    fleet,
    settings: { device: insight.device },
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const published = new Set(buildDevice(gladys, INSIGHT).features.map((f) => f.external_id));
  for (const component of content.components) {
    for (const id of [component.device_feature, ...(component.device_features ?? [])].filter(
      Boolean,
    )) {
      assert.ok(published.has(id), `${component.type} bound to an unknown feature ${id}`);
    }
  }
  const button = content.components.find((c) => c.type === 'button');
  assert.deepEqual([button.device_feature, button.value], [insight.feature('binary'), 0]);
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.equal(rows[2].value, '1 h 05');
});

test('widget nudges are throttled to one per 10 s, the last one kept', async () => {
  const gladys = createFakeGladys();
  const clock = createFakeClock();
  const refresher = createWidgetRefresher(gladys, { timers: clock.timers, now: clock.now });
  refresher.request();
  refresher.request();
  refresher.request();
  assert.deepEqual(gladys.widgetRefreshes, [OVERVIEW_WIDGET, INSIGHT_WIDGET]);
  await clock.advance(10_000);
  assert.deepEqual(gladys.widgetRefreshes.length, 4);
  refresher.request();
  refresher.cancel();
  await clock.advance(20_000);
  assert.deepEqual(gladys.widgetRefreshes.length, 4);
});
