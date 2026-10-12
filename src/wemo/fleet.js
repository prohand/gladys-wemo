// -----------------------------------------------------------------------------
// The fleet: every Wemo the integration knows, read in a loop.
//
// Why the integration polls itself instead of relying on Gladys `onPoll`:
//   - a motion sensor has to be read every second or two to start a scene in
//     time, while Gladys polls at fixed frequencies;
//   - UPnP push (GENA subscriptions) needs the Wemo to open a connection back
//     to the integration, which the bridge network of the container does not
//     offer.
//
// What it guarantees:
//   - one request at a time per Wemo (a queue per device): a command never
//     crosses a read on a device that handles one connection at a time;
//   - only changes reach Gladys (src/wemo/states.js);
//   - a Wemo that stops answering is looked for on its other ports, then, once
//     offline, at another address (SSDP), and its badge turns `unreachable`;
//   - the scene triggers fire on TRANSITIONS only: the first reading after a
//     start or a reconnection is a baseline, never an event.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { discover as defaultDiscover } from './discovery.js';
import { KINDS, hasRelay } from './models.js';
import { createStatePublisher } from './states.js';
import {
  FEATURES,
  buildDevice,
  entryFromGladysDevice,
  featureKeyOf,
  idsOf,
  statesOf,
} from '../devices/index.js';

// Scene trigger keys, as declared in the manifest `scene_triggers` field.
// Scenes store them: never rename one.
export const SCENE_TRIGGERS = {
  MOTION_DETECTED: 'motion_detected',
  INSIGHT_STATE_CHANGED: 'insight_state_changed',
  CONNECTION_CHANGED: 'connection_changed',
};

// Consecutive failed reads before a Wemo is declared offline: a single lost
// answer is ordinary on a busy Wi-Fi.
export const OFFLINE_AFTER_FAILURES = 3;

// An offline Wemo is still tried, less often.
const OFFLINE_POLL_SECONDS = 30;

// SSDP is a broadcast on the whole LAN, run by the core: not more than once in
// five minutes for devices gone silent (a user scan is never throttled here).
const REDISCOVER_MIN_INTERVAL_MS = 5 * 60 * 1000;

// Spread the first reads at startup instead of hitting every Wemo at once.
const START_STAGGER_MS = 200;

// Insight `state` values: 0 off, 1 on (drawing power), 8 on but in standby
// (under the threshold set in the Wemo app: the appliance has finished).
export function insightStateName(state) {
  if (state === 0) {
    return 'off';
  }
  return state === 8 ? 'standby' : 'on';
}

const TRANSIENT_CODES = new Set(['UNREACHABLE', 'TIMEOUT']);

/**
 * @param {object} options
 * @param {object} options.gladys SDK instance
 * @param {ReturnType<import('./client.js').createWemoClient>} options.client
 * @param {object} options.logger
 * @param {object} options.config normalized config
 * @param {Function} [options.discover] discovery (tests inject a fake)
 * @param {(kind: 'state' | 'connection') => void} [options.onChange]
 * @param {{ setTimeout: Function, clearTimeout: Function }} [options.timers]
 * @param {() => number} [options.now]
 */
export function createFleet({
  gladys,
  client,
  logger,
  config: initialConfig,
  discover = defaultDiscover,
  onChange = () => {},
  timers = { setTimeout, clearTimeout },
  now = Date.now,
}) {
  /** @type {Map<string, object>} serial -> entry */
  const entries = new Map();
  const publisher = createStatePublisher(gladys, { now });
  let config = initialConfig;
  let running = false;
  let lastRediscoverAt = -Infinity;
  let rediscovering;

  function upsert(data, { created } = {}) {
    let entry = entries.get(data.serial);
    if (!entry) {
      entry = {
        ...data,
        created: false,
        online: undefined,
        failures: 0,
        reading: undefined,
        lastError: undefined,
        lastSeenAt: undefined,
        queue: Promise.resolve(),
        timer: undefined,
      };
      entries.set(data.serial, entry);
    }
    if (created !== undefined) {
      entry.created = created;
    }
    return entry;
  }

  const target = (entry) => ({ host: entry.host, port: entry.port });

  function enqueue(entry, task) {
    const run = entry.queue.catch(() => {}).then(task);
    entry.queue = run.catch(() => {});
    return run;
  }

  async function readOnce(entry) {
    switch (entry.kind) {
      case KINDS.INSIGHT: {
        const params = await client.getInsightParams(target(entry));
        return { on: params.state !== 0, insightState: params.state, ...params };
      }
      case KINDS.MOTION: {
        const { state } = await client.getBinaryState(target(entry));
        return { motion: state === 1 };
      }
      case KINDS.MAKER: {
        const attributes = await client.getAttributes(target(entry));
        return {
          on: attributes.Switch === '1',
          // The input reads 0 when its contact is closed. Without a sensor
          // wired in, there is nothing to publish.
          contact: attributes.SensorPresent === '1' ? attributes.Sensor === '0' : undefined,
        };
      }
      case KINDS.DIMMER: {
        const { state, brightness } = await client.getBinaryState(target(entry));
        return { on: state !== 0, brightness };
      }
      default: {
        const { state } = await client.getBinaryState(target(entry));
        return { on: state !== 0 };
      }
    }
  }

  // A Wemo that refuses the connection has most likely moved to another port
  // (reboot, Wi-Fi reconnection): look for it once per silence, by serial.
  async function relocate(entry) {
    const port = await client.locate(entry.host, entry.serial, entry.port);
    if (port === undefined || port === entry.port) {
      return false;
    }
    logger.info(`${entry.name}: now answers on port ${port} (was ${entry.port})`);
    entry.port = port;
    await persistAddresses();
    return true;
  }

  async function withRelocation(entry, operation) {
    try {
      return await operation();
    } catch (err) {
      if (!TRANSIENT_CODES.has(err.code) || entry.relocated) {
        throw err;
      }
      entry.relocated = true;
      if (await relocate(entry)) {
        return operation();
      }
      throw err;
    }
  }

  async function safely(what, promise) {
    try {
      await promise;
    } catch (err) {
      logger.warn(`${what} failed: ${err.message}`);
    }
  }

  function fireEvent(key, entry, data = {}) {
    return safely(
      `Scene event ${key}`,
      gladys.publishSceneEvent(key, {
        device: idsOf(gladys, entry.serial).device,
        device_name: entry.name,
        ...data,
      }),
    );
  }

  function transportOf(entry) {
    return {
      external_id: idsOf(gladys, entry.serial).device,
      transport: entry.online ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE,
    };
  }

  async function onReading(entry, reading) {
    const previous = entry.reading;
    const wasOnline = entry.online;
    entry.reading = reading;
    entry.failures = 0;
    entry.relocated = false;
    entry.lastError = undefined;
    entry.lastSeenAt = now();
    entry.online = true;

    if (wasOnline !== true && entry.created) {
      await safely('Transport badge', gladys.publishTransports([transportOf(entry)]));
    }
    if (entry.created) {
      await safely(`States of ${entry.name}`, publisher.publish(statesOf(gladys, entry, reading)));
    }
    if (wasOnline === false) {
      logger.info(`${entry.name}: back online`);
      await fireEvent(SCENE_TRIGGERS.CONNECTION_CHANGED, entry, { status: 'online' });
    }
    if (previous && entry.created) {
      if (reading.motion && !previous.motion) {
        await fireEvent(SCENE_TRIGGERS.MOTION_DETECTED, entry);
      }
      if (
        reading.insightState !== undefined &&
        previous.insightState !== undefined &&
        insightStateName(reading.insightState) !== insightStateName(previous.insightState)
      ) {
        await fireEvent(SCENE_TRIGGERS.INSIGHT_STATE_CHANGED, entry, {
          state: insightStateName(reading.insightState),
          power: Math.round(reading.powerW * 10) / 10,
        });
      }
    }
    if (wasOnline !== true) {
      onChange('connection');
    } else if (
      !previous ||
      ['on', 'brightness', 'motion', 'contact'].some((key) => previous[key] !== reading[key]) ||
      insightStateName(previous.insightState) !== insightStateName(reading.insightState)
    ) {
      onChange('state');
    }
  }

  async function onFailure(entry, err) {
    entry.failures += 1;
    entry.lastError = err.message;
    logger.debug(`${entry.name} (${entry.host}:${entry.port}): ${err.message}`);
    if (entry.failures < OFFLINE_AFTER_FAILURES || entry.online === false) {
      return;
    }
    entry.online = false;
    logger.warn(`${entry.name}: no answer at ${entry.host}:${entry.port} (${err.message})`);
    if (entry.created) {
      await safely('Transport badge', gladys.publishTransports([transportOf(entry)]));
      await fireEvent(SCENE_TRIGGERS.CONNECTION_CHANGED, entry, { status: 'offline' });
    }
    onChange('connection');
    if (config.auto_rediscover) {
      maybeRediscover();
    }
  }

  async function poll(entry) {
    try {
      await onReading(entry, await withRelocation(entry, () => readOnce(entry)));
    } catch (err) {
      await onFailure(entry, err);
    }
  }

  function cancel(entry) {
    timers.clearTimeout(entry.timer);
    entry.timer = undefined;
  }

  function schedule(entry, delayMs) {
    cancel(entry);
    if (!running || !entry.created) {
      return;
    }
    entry.timer = timers.setTimeout(() => {
      entry.timer = undefined;
      enqueue(entry, () => poll(entry)).finally(() => schedule(entry, nextDelayMs(entry)));
    }, delayMs);
  }

  function nextDelayMs(entry) {
    if (entry.online === false) {
      return Math.max(config.poll_interval, OFFLINE_POLL_SECONDS) * 1000;
    }
    const seconds =
      entry.kind === KINDS.MOTION ? config.motion_poll_interval : config.poll_interval;
    return seconds * 1000;
  }

  // Gladys keeps the address of a created device in its params: re-publishing
  // the discovered devices upserts them, so a Wemo that moved is found at its
  // new address after a restart too.
  async function persistAddresses() {
    await safely('Device list', gladys.publishDiscoveredDevices(fleet.discoveredDevices()));
  }

  function maybeRediscover() {
    if (now() - lastRediscoverAt < REDISCOVER_MIN_INTERVAL_MS) {
      return;
    }
    fleet.rediscover().catch((err) => logger.warn(`Rediscovery failed: ${err.message}`));
  }

  const fleet = {
    get config() {
      return config;
    },

    setConfig(newConfig) {
      config = newConfig;
      if (running) {
        for (const entry of entries.values()) {
          schedule(entry, nextDelayMs(entry));
        }
      }
    },

    /** Align on the devices created in Gladys (at every (re)connection). */
    syncFromGladys(devices) {
      const created = new Set();
      for (const device of devices ?? []) {
        const data = entryFromGladysDevice(gladys, device);
        if (!data) {
          continue;
        }
        created.add(data.serial);
        const known = entries.has(data.serial);
        const entry = upsert(data, { created: true });
        // The name is the user's in Gladys. The address in memory is at least
        // as fresh as the params, unless the device is new to us.
        entry.name = device.name || entry.name;
        if (!known) {
          entry.host = data.host;
          entry.port = data.port;
        }
      }
      for (const entry of entries.values()) {
        if (!created.has(entry.serial)) {
          entry.created = false;
          cancel(entry);
        }
      }
      if (running) {
        for (const entry of entries.values()) {
          if (entry.created && !entry.timer) {
            schedule(entry, 0);
          }
        }
      }
    },

    /** A device was created or updated in Gladys. */
    deviceCreated(device) {
      const data = entryFromGladysDevice(gladys, device);
      if (!data) {
        return;
      }
      const known = entries.has(data.serial);
      const entry = upsert(data, { created: true });
      entry.name = device.name || entry.name;
      if (!known) {
        entry.host = data.host;
        entry.port = data.port;
      }
      // Its states were never published: the first read publishes them all.
      for (const key of Object.values(FEATURES)) {
        publisher.forget(idsOf(gladys, entry.serial).feature(key));
      }
      if (running && !entry.timer) {
        schedule(entry, 0);
      }
    },

    deviceDeleted(device) {
      const entry = fleet.entryByExternalId(device?.external_id);
      if (entry) {
        entry.created = false;
        cancel(entry);
      }
    },

    /** Merge the result of a discovery. */
    mergeDiscovered(found) {
      for (const data of found) {
        const known = entries.get(data.serial);
        const entry = upsert(data);
        if (known) {
          if (known.host !== data.host || known.port !== data.port) {
            logger.info(`${entry.name}: found at ${data.host}:${data.port}`);
          }
          entry.host = data.host;
          entry.port = data.port;
          entry.model = data.model ?? entry.model;
          entry.firmware = data.firmware ?? entry.firmware;
          entry.mac = data.mac ?? entry.mac;
          if (!entry.created && data.name) {
            entry.name = data.name;
          }
        }
      }
    },

    /** Run a discovery, merge it and publish the device list to Gladys. */
    async rediscover() {
      if (rediscovering) {
        return rediscovering;
      }
      lastRediscoverAt = now();
      rediscovering = (async () => {
        const result = await discover({ gladys, client, config, logger });
        fleet.mergeDiscovered(result.devices);
        await gladys.publishDiscoveredDevices(fleet.discoveredDevices());
        // A device found again at a new address is read right away.
        for (const entry of entries.values()) {
          if (running && entry.created && entry.online === false) {
            schedule(entry, 0);
          }
        }
        return result;
      })();
      try {
        return await rediscovering;
      } finally {
        rediscovering = undefined;
      }
    },

    discoveredDevices() {
      return [...entries.values()].map((entry) => buildDevice(gladys, entry));
    },

    entries() {
      return [...entries.values()];
    },

    createdEntries() {
      return [...entries.values()].filter((entry) => entry.created);
    },

    entryByExternalId(externalId) {
      return [...entries.values()].find(
        (entry) => idsOf(gladys, entry.serial).device === externalId,
      );
    },

    transportEntries() {
      return fleet
        .createdEntries()
        .filter((entry) => entry.online !== undefined)
        .map(transportOf);
    },

    start() {
      running = true;
      // A new session with Gladys: publish every state once again.
      publisher.forget();
      fleet.createdEntries().forEach((entry, index) => schedule(entry, index * START_STAGGER_MS));
    },

    stop() {
      running = false;
      for (const entry of entries.values()) {
        cancel(entry);
      }
    },

    /** Read a Wemo now (Test the connection, scene actions). */
    refresh(entry) {
      return enqueue(entry, async () => {
        await poll(entry);
        return entry;
      });
    },

    /** Gladys asks for a value (onSetValue). Throws when the Wemo refuses. */
    async setValue(device, feature, value) {
      const entry = fleet.entryByExternalId(device?.external_id);
      if (!entry) {
        throw new Error(`Unknown Wemo ${device?.external_id}`);
      }
      const key = featureKeyOf(gladys, entry, feature.external_id);
      return enqueue(entry, async () => {
        if (key === FEATURES.BINARY && hasRelay(entry.kind)) {
          await withRelocation(entry, () => client.setBinaryState(target(entry), value === 1));
        } else if (key === FEATURES.BRIGHTNESS && entry.kind === KINDS.DIMMER) {
          const level = Math.round(Math.min(100, Math.max(0, Number(value) || 0)));
          await withRelocation(entry, () =>
            level === 0
              ? client.setBinaryState(target(entry), false)
              : client.setBinaryState(target(entry), true, level),
          );
        } else {
          throw new Error(`${entry.name}: "${key}" cannot be set`);
        }
        // has_feedback: publish what the Wemo reports now, not what was asked.
        await poll(entry);
      });
    },

    /**
     * Toggle the relay of a Wemo (scene action). Resolves the new state, or
     * `undefined` when the device has no relay.
     */
    toggle(externalId) {
      const entry = fleet.entryByExternalId(externalId);
      if (!entry || !hasRelay(entry.kind)) {
        return Promise.resolve(undefined);
      }
      return enqueue(entry, async () => {
        const current = await withRelocation(entry, () => readOnce(entry));
        await client.setBinaryState(target(entry), !current.on);
        await poll(entry);
        if (entry.online !== true) {
          throw new Error(`${entry.name}: no answer after the order`);
        }
        return entry.reading.on;
      });
    },

    /** Counts for the connection status and the widget. */
    summary() {
      const created = fleet.createdEntries();
      return {
        total: created.length,
        online: created.filter((entry) => entry.online === true).length,
        offline: created.filter((entry) => entry.online === false).length,
      };
    },
  };

  return fleet;
}
