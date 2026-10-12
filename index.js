// -----------------------------------------------------------------------------
// Entry point of the Wemo integration for Gladys Assistant.
//
// SDK wiring only: the Wemo protocol lives in src/wemo/, the Gladys devices in
// src/devices/, the 5.1 capabilities (scenes, widgets) in src/capabilities/.
// Every handler is registered BEFORE connect().
//
// Environment variables provided by the Gladys supervisor (read by the SDK):
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { createWemoClient } from './src/wemo/client.js';
import { createFleet } from './src/wemo/fleet.js';
import { ACTIONS } from './src/capabilities/actions.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { WIDGETS, createWidgetRefresher } from './src/capabilities/widgets.js';

const gladys = new GladysIntegration();
const widgetRefresher = createWidgetRefresher(gladys);

// Application-level status shown in the Configuration screen: "connected"
// unless every Wemo added to Gladys is unreachable.
let reportedAllOffline;
async function reportConnectionStatus() {
  const { total, offline } = fleet.summary();
  const allOffline = total > 0 && offline === total;
  if (allOffline === reportedAllOffline) {
    return;
  }
  reportedAllOffline = allOffline;
  await gladys
    .setConnectionStatus(
      !allOffline,
      allOffline
        ? {
            en: 'No Wemo answers on the local network.',
            fr: 'Aucun Wemo ne répond sur le réseau local.',
          }
        : undefined,
    )
    .catch((err) => logger.warn(`Connection status not sent: ${err.message}`));
}

const fleet = createFleet({
  gladys,
  client: createWemoClient(),
  logger,
  config: normalizeConfig(),
  onChange(kind) {
    widgetRefresher.request();
    if (kind === 'connection') {
      reportConnectionStatus();
    }
  },
});

// --- Discovery: the user opens the Discovery tab -----------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> searching for Wemo devices');
  await fleet.rediscover();
});

// --- Commands ----------------------------------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  // Throwing sends a success:false acknowledgement: Gladys shows the failure.
  await fleet.setValue(device, feature, value);
});

// --- Devices added, changed or removed in Gladys -----------------------------
gladys.onDeviceCreated((device) => fleet.deviceCreated(device));
gladys.onDeviceUpdated((device) => fleet.deviceCreated(device));
gladys.onDeviceDeleted((device) => fleet.deviceDeleted(device));

// --- Buttons of the Configuration screen -------------------------------------
for (const [key, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(key, (fields) => handler(gladys, { fields, fleet }));
}

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
// Scene TRIGGERS need no handler: the fleet fires them (src/wemo/fleet.js).
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(gladys, { fields, fleet }));
}

// --- Dashboard widgets (Gladys 5.1+) -----------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, fleet }));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(gladys, { actionKey, params, settings, fleet }),
    );
  }
}

// --- Configuration saved -----------------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  fleet.setConfig(normalizeConfig(newConfig));
  widgetRefresher.request();
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK logs the WebSocket lifecycle itself; these handlers only run the
// integration's own (re)initialization.
gladys.on('connected', async () => {
  try {
    fleet.setConfig(normalizeConfig(gladys.config));
    // The devices created in Gladys carry the address of each Wemo.
    fleet.syncFromGladys(gladys.devices);
    // Re-publish them: a new version of the integration may bring features.
    await gladys.publishDiscoveredDevices(fleet.discoveredDevices());
    fleet.start();
    // The badges known before a reconnection: Gladys may have restarted.
    await publishTransports(fleet.transportEntries());
    // Nudges sent while the socket was down were dropped: re-sync dashboards.
    widgetRefresher.request();
    reportedAllOffline = undefined;
    await reportConnectionStatus();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// Gladys takes 100 transport entries per call.
async function publishTransports(entries) {
  for (let i = 0; i < entries.length; i += 100) {
    await gladys
      .publishTransports(entries.slice(i, i + 100))
      .catch((err) => logger.warn(`Transport badges not sent: ${err.message}`));
  }
}

// Nothing to publish to while Gladys is away: the reads resume on reconnection.
gladys.on('disconnected', () => {
  fleet.stop();
  widgetRefresher.cancel();
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  fleet.stop();
  widgetRefresher.cancel();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Wemo integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
