// -----------------------------------------------------------------------------
// In-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the surface the integration relies on and records every call,
// so tests assert on what reached Gladys without a server or a WebSocket.
// -----------------------------------------------------------------------------

export function createFakeGladys({ ssdpAnswers = [], scanError } = {}) {
  const published = [];
  const transports = [];
  const connectionStatuses = [];
  const sceneEvents = [];
  const widgetRefreshes = [];
  const discovered = [];
  const scans = [];

  return {
    published,
    transports,
    connectionStatuses,
    sceneEvents,
    widgetRefreshes,
    discovered,
    scans,
    ssdpAnswers,
    scanError,
    devices: [],
    config: {},

    externalId(suffix) {
      return `ext:wemo-test:${suffix}`;
    },

    externalIds(type, platformId) {
      const device = this.externalId(`${type}:${platformId}`);
      return { device, feature: (key) => `${device}:${key}` };
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({ featureExternalId: s.device_feature_external_id, state: s.state });
      }
      return { success: true };
    },

    async publishTransports(entries) {
      transports.push(...entries);
      return { success: true };
    },

    async publishDiscoveredDevices(devices) {
      discovered.push(devices);
      return { success: true, count: devices.length };
    },

    async scanNetwork(type, options) {
      scans.push({ type, options });
      if (this.scanError) {
        throw this.scanError;
      }
      return this.ssdpAnswers;
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
      return { success: true };
    },

    async publishSceneEvent(key, data = {}) {
      sceneEvents.push({ key, data });
      return { success: true };
    },

    requestWidgetRefresh(key) {
      widgetRefreshes.push(key);
    },

    /** States published for one feature, in order. */
    statesOf(featureExternalId) {
      return published
        .filter((entry) => entry.featureExternalId === featureExternalId)
        .map((entry) => entry.state);
    },

    /** Last discovery payload published. */
    lastDiscovered() {
      return discovered.at(-1) ?? [];
    },
  };
}

/** A silent logger that keeps the lines, for assertions. */
export function createFakeLogger() {
  const lines = [];
  const log = (level) => (message) => lines.push({ level, message: String(message) });
  return {
    lines,
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
  };
}
