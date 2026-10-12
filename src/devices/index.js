// -----------------------------------------------------------------------------
// Wemo devices as Gladys sees them.
//
// One Gladys device per Wemo, identified by its serial number. The features
// depend on the family (src/wemo/models.js):
//
//   family       features
//   switch       binary (switch)
//   lightswitch  binary (light)
//   dimmer       binary + brightness (light)
//   insight      binary (switch) + power (W) + energy (kWh, total)
//   motion       motion (motion sensor)
//   maker        binary (switch) + contact (opening sensor, the input)
//
// External ids are forever: Gladys keys devices, history, scenes and
// dashboards on them. The device id is built from the serial number (never
// from the name or the IP, which change), the feature ids from the keys of
// FEATURES below, which are never renamed.
//
// The address of the device (host, port) travels in the device params: Gladys
// keeps them with the created device and gives them back at every
// (re)connection, so the integration needs no storage of its own.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { KINDS, KIND_LABELS } from '../wemo/models.js';

// Device type part of the external ids. Never change it.
const DEVICE_TYPE = 'wemo';

export const FEATURES = {
  BINARY: 'binary',
  BRIGHTNESS: 'brightness',
  POWER: 'power',
  ENERGY: 'energy',
  MOTION: 'motion',
  CONTACT: 'contact',
};

export const PARAMS = {
  SERIAL: 'WEMO_SERIAL',
  KIND: 'WEMO_KIND',
  HOST: 'WEMO_HOST',
  PORT: 'WEMO_PORT',
  MODEL: 'WEMO_MODEL',
  FIRMWARE: 'WEMO_FIRMWARE',
  MAC: 'WEMO_MAC',
};

// External ids only take what Gladys stores safely; a Wemo serial is
// alphanumeric anyway (e.g. 221517K0101769).
function platformId(serial) {
  return String(serial).replace(/[^A-Za-z0-9_-]/g, '_');
}

export function idsOf(gladys, serial) {
  return gladys.externalIds(DEVICE_TYPE, platformId(serial));
}

/** True when the external id belongs to a Wemo of this integration. */
export function isWemoExternalId(gladys, externalId) {
  return String(externalId ?? '').startsWith(gladys.externalId(`${DEVICE_TYPE}:`));
}

const binaryFeature = (ids, category, type, name) => ({
  name,
  external_id: ids.feature(FEATURES.BINARY),
  category,
  type,
  read_only: false,
  has_feedback: true, // the state published is the one read back from the Wemo
  keep_history: true,
  min: 0,
  max: 1,
});

function featuresOf(ids, kind) {
  switch (kind) {
    case KINDS.SWITCH:
      return [
        binaryFeature(
          ids,
          DEVICE_FEATURE_CATEGORIES.SWITCH,
          DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          'On/Off',
        ),
      ];
    case KINDS.LIGHT_SWITCH:
      return [
        binaryFeature(
          ids,
          DEVICE_FEATURE_CATEGORIES.LIGHT,
          DEVICE_FEATURE_TYPES.LIGHT.BINARY,
          'On/Off',
        ),
      ];
    case KINDS.DIMMER:
      return [
        binaryFeature(
          ids,
          DEVICE_FEATURE_CATEGORIES.LIGHT,
          DEVICE_FEATURE_TYPES.LIGHT.BINARY,
          'On/Off',
        ),
        {
          name: 'Brightness',
          external_id: ids.feature(FEATURES.BRIGHTNESS),
          category: DEVICE_FEATURE_CATEGORIES.LIGHT,
          type: DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS,
          unit: DEVICE_FEATURE_UNITS.PERCENT,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 100,
        },
      ];
    case KINDS.INSIGHT:
      return [
        binaryFeature(
          ids,
          DEVICE_FEATURE_CATEGORIES.SWITCH,
          DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          'On/Off',
        ),
        {
          name: 'Power',
          external_id: ids.feature(FEATURES.POWER),
          category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
          type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER,
          unit: DEVICE_FEATURE_UNITS.WATT,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 3680,
        },
        {
          name: 'Energy',
          external_id: ids.feature(FEATURES.ENERGY),
          category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
          type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.ENERGY,
          unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 1_000_000,
        },
      ];
    case KINDS.MOTION:
      return [
        {
          name: 'Motion',
          external_id: ids.feature(FEATURES.MOTION),
          category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 1,
        },
      ];
    case KINDS.MAKER:
      return [
        binaryFeature(
          ids,
          DEVICE_FEATURE_CATEGORIES.SWITCH,
          DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          'Relay',
        ),
        {
          // 1 = the input contact is closed (a garage door at rest on its
          // reed switch, say), 0 = open.
          name: 'Input',
          external_id: ids.feature(FEATURES.CONTACT),
          category: DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 1,
        },
      ];
    default:
      return [];
  }
}

/**
 * Discovery payload of one Wemo.
 * @param {object} gladys SDK instance (externalIds)
 * @param {{ serial: string, kind: string, name?: string, host: string, port: number,
 *   model?: string, firmware?: string, mac?: string }} entry
 */
export function buildDevice(gladys, entry) {
  const ids = idsOf(gladys, entry.serial);
  const params = [
    { name: PARAMS.SERIAL, value: entry.serial },
    { name: PARAMS.KIND, value: entry.kind },
    { name: PARAMS.HOST, value: entry.host },
    { name: PARAMS.PORT, value: String(entry.port) },
  ];
  for (const [name, value] of [
    [PARAMS.MODEL, entry.model],
    [PARAMS.FIRMWARE, entry.firmware],
    [PARAMS.MAC, entry.mac],
  ]) {
    if (value) {
      params.push({ name, value: String(value) });
    }
  }
  return {
    name: entry.name || KIND_LABELS[entry.kind] || 'Wemo',
    external_id: ids.device,
    params,
    features: featuresOf(ids, entry.kind),
  };
}

/**
 * Read back a Wemo from a device created in Gladys (its params), or
 * `undefined` when the params are incomplete.
 */
export function entryFromGladysDevice(gladys, device) {
  if (!isWemoExternalId(gladys, device?.external_id)) {
    return undefined;
  }
  const param = (name) => device.params?.find((p) => p.name === name)?.value;
  const serial = param(PARAMS.SERIAL);
  const kind = param(PARAMS.KIND);
  const host = param(PARAMS.HOST);
  const port = Number(param(PARAMS.PORT));
  if (!serial || !Object.values(KINDS).includes(kind) || !host || !Number.isInteger(port)) {
    return undefined;
  }
  return {
    serial,
    kind,
    name: device.name,
    host,
    port,
    model: param(PARAMS.MODEL),
    firmware: param(PARAMS.FIRMWARE),
    mac: param(PARAMS.MAC),
  };
}

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Gladys states of one reading of a Wemo (see src/wemo/poller.js).
 * @returns {Array<{ id: string, value: number, deadband?: number }>}
 */
export function statesOf(gladys, entry, reading) {
  const ids = idsOf(gladys, entry.serial);
  const states = [];
  if (reading.on !== undefined) {
    states.push({ id: ids.feature(FEATURES.BINARY), value: reading.on ? 1 : 0 });
  }
  if (reading.brightness !== undefined) {
    states.push({ id: ids.feature(FEATURES.BRIGHTNESS), value: reading.brightness });
  }
  if (reading.powerW !== undefined) {
    // A running appliance moves by a few tenths of a watt at every read: the
    // deadband keeps Gladys under its 300 states a minute with many Insights.
    states.push({ id: ids.feature(FEATURES.POWER), value: round(reading.powerW, 1), deadband: 1 });
  }
  if (reading.totalKwh !== undefined) {
    states.push({ id: ids.feature(FEATURES.ENERGY), value: round(reading.totalKwh, 3) });
  }
  if (reading.motion !== undefined) {
    states.push({ id: ids.feature(FEATURES.MOTION), value: reading.motion ? 1 : 0 });
  }
  if (reading.contact !== undefined) {
    states.push({ id: ids.feature(FEATURES.CONTACT), value: reading.contact ? 1 : 0 });
  }
  return states;
}

/** Feature key of a feature external id ("binary", "brightness"...). */
export function featureKeyOf(gladys, entry, featureExternalId) {
  const prefix = `${idsOf(gladys, entry.serial).device}:`;
  return String(featureExternalId).startsWith(prefix)
    ? String(featureExternalId).slice(prefix.length)
    : undefined;
}
