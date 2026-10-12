// -----------------------------------------------------------------------------
// State publication, deduplicated.
//
// Gladys accepts 300 states a minute per integration. Polling a dozen Wemo
// every few seconds would burn that budget on values that did not move, so
// only CHANGES are published. A feature with a `deadband` (the Insight power)
// is published when it moved by at least that much, or when it moved at all
// and its last publication is older than REFRESH_MS, so a curve still follows
// a slow drift.
// -----------------------------------------------------------------------------

const REFRESH_MS = 5 * 60 * 1000;

/**
 * @param {{ publishStates: Function }} gladys
 * @param {{ now?: () => number }} [options]
 */
export function createStatePublisher(gladys, { now = Date.now } = {}) {
  // feature external id -> { value, at }
  const last = new Map();

  function shouldPublish({ id, value, deadband }) {
    const previous = last.get(id);
    if (!previous) {
      return true;
    }
    if (previous.value === value) {
      return false;
    }
    if (!deadband) {
      return true;
    }
    return Math.abs(previous.value - value) >= deadband || now() - previous.at >= REFRESH_MS;
  }

  return {
    /**
     * Publish what changed among `states`.
     * @param {Array<{ id: string, value: number, deadband?: number }>} states
     * @returns {Promise<number>} number of states published
     */
    async publish(states) {
      const changed = states.filter(shouldPublish);
      if (changed.length === 0) {
        return 0;
      }
      await gladys.publishStates(
        changed.map(({ id, value }) => ({ device_feature_external_id: id, state: value })),
      );
      // Remembered only once Gladys took them: a refused batch goes out again
      // at the next read.
      const at = now();
      for (const { id, value } of changed) {
        last.set(id, { value, at });
      }
      return changed.length;
    },

    /** Last value published for a feature, or `undefined`. */
    valueOf(id) {
      return last.get(id)?.value;
    },

    /** Forget a feature, or everything: the next reading is published again. */
    forget(id) {
      if (id === undefined) {
        last.clear();
      } else {
        last.delete(id);
      }
    },
  };
}
