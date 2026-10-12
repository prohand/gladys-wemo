// -----------------------------------------------------------------------------
// Wemo device families.
//
// Every Wemo announces a UPnP `deviceType` in its setup.xml. The family decides
// which Gladys features the device gets and which SOAP calls read its state.
// The family name is stored as a device param (WEMO_KIND): never rename one.
//
// Not supported (logged and skipped at discovery): the Wemo Link bridge and its
// bulbs, and the appliances (coffee maker, slow cooker, humidifier, heater, air
// purifier), whose protocols differ.
// -----------------------------------------------------------------------------

export const KINDS = {
  SWITCH: 'switch', // Wemo Switch, Wemo Mini (controllee)
  LIGHT_SWITCH: 'lightswitch', // Wemo Light Switch, 3-Way
  DIMMER: 'dimmer', // Wemo Dimmer
  INSIGHT: 'insight', // Wemo Insight: relay + power metering
  MOTION: 'motion', // Wemo Motion sensor
  MAKER: 'maker', // Wemo Maker: relay + contact input
};

// `urn:Belkin:device:<name>:1` -> family (compared lowercase).
const DEVICE_TYPES = {
  controllee: KINDS.SWITCH,
  lightswitch: KINDS.LIGHT_SWITCH,
  dimmer: KINDS.DIMMER,
  insight: KINDS.INSIGHT,
  sensor: KINDS.MOTION,
  maker: KINDS.MAKER,
};

/**
 * Family of a UPnP device type, or `undefined` when unsupported.
 * @param {string} deviceType e.g. "urn:Belkin:device:controllee:1"
 */
export function kindOf(deviceType) {
  const match = /^urn:belkin:device:([a-z0-9]+):\d+$/i.exec(String(deviceType ?? '').trim());
  return match ? DEVICE_TYPES[match[1].toLowerCase()] : undefined;
}

/** Families with a relay Gladys can switch. */
export function hasRelay(kind) {
  return kind !== KINDS.MOTION && Object.values(KINDS).includes(kind);
}

/** Families that drive a light (shown as a light in Gladys). */
export function isLight(kind) {
  return kind === KINDS.LIGHT_SWITCH || kind === KINDS.DIMMER;
}

// Default product name, when the device gives no friendly name.
export const KIND_LABELS = {
  [KINDS.SWITCH]: 'Wemo Switch',
  [KINDS.LIGHT_SWITCH]: 'Wemo Light Switch',
  [KINDS.DIMMER]: 'Wemo Dimmer',
  [KINDS.INSIGHT]: 'Wemo Insight',
  [KINDS.MOTION]: 'Wemo Motion',
  [KINDS.MAKER]: 'Wemo Maker',
};
