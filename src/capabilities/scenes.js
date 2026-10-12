// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// index.js registers each entry with `gladys.onSceneAction(key, ...)`. The
// fields arrive RESOLVED (a `"source": "devices"` field is the chosen device
// external_id) and the handler resolves the declared outputs.
//
// A scene action is never a condition: a device that cannot do what is asked
// is an OUTPUT (`toggled: false`, `reachable: false`) the scene author can
// test, not a failure. Only an order the Wemo refused throws.
//
// The scene TRIGGERS are fired by the fleet itself (src/wemo/fleet.js), on the
// transitions it reads. No action here fires a scene event: a scene bound to
// that event would loop through the integration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { insightStateName } from '../wemo/fleet.js';
import { KINDS } from '../wemo/models.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  async toggle_device(_gladys, { fields, fleet }) {
    logger.info(`Scene action toggle_device <- ${fields.device}`);
    const isOn = await fleet.toggle(fields.device);
    return isOn === undefined ? { toggled: false, is_on: false } : { toggled: true, is_on: isOn };
  },

  async read_insight(_gladys, { fields, fleet }) {
    logger.info(`Scene action read_insight <- ${fields.device}`);
    const entry = fleet.entryByExternalId(fields.device);
    if (!entry || entry.kind !== KINDS.INSIGHT) {
      return { reachable: false, state: 'unsupported', power: 0, today_energy: 0 };
    }
    await fleet.refresh(entry);
    if (entry.failures > 0 || !entry.reading) {
      return { reachable: false, state: 'unreachable', power: 0, today_energy: 0 };
    }
    return {
      reachable: true,
      state: insightStateName(entry.reading.insightState),
      power: Math.round(entry.reading.powerW * 10) / 10,
      today_energy: Math.round(entry.reading.todayKwh * 1000) / 1000,
    };
  },

  async rediscover(_gladys, { fleet }) {
    logger.info('Scene action rediscover');
    const result = await fleet.rediscover();
    return { found: result.devices.length };
  },
};
