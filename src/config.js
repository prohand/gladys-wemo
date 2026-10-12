// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the manifest `config_schema`. This module
// only provides the defaults and normalizes the received object, so the rest of
// the code never deals with `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

// MUST stay consistent with the `default` values of the manifest config_schema
// (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  hosts: '', // Wemo addresses typed by hand, for networks where SSDP does not cross
  poll_interval: 10, // seconds between two reads of a plug, switch or dimmer
  motion_poll_interval: 2, // seconds between two reads of a motion sensor
  auto_rediscover: true, // look for a device that went silent at another address
};

// Bounds of the manifest: a value typed outside them is brought back inside.
const BOUNDS = {
  poll_interval: [5, 300],
  motion_poll_interval: [1, 30],
};

function bounded(key, raw) {
  const [min, max] = BOUNDS[key];
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIG[key];
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = raw ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...config,
    hosts: typeof config.hosts === 'string' ? config.hosts : DEFAULT_CONFIG.hosts,
    poll_interval: bounded('poll_interval', config.poll_interval ?? DEFAULT_CONFIG.poll_interval),
    motion_poll_interval: bounded(
      'motion_poll_interval',
      config.motion_poll_interval ?? DEFAULT_CONFIG.motion_poll_interval,
    ),
    auto_rediscover: config.auto_rediscover !== false,
  };
}
