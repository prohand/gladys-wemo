// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
//
// Each handler resolves the bilingual message shown under its button. Keys are
// stored in the manifest: never rename one.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { describeState, lines, nameWithAddress } from './labels.js';

const logger = createLogger({ name: 'actions' });

/** Describe the outcome of a discovery under the "Search" button. */
export function describeDiscovery(result, fleet) {
  const out = [];
  const created = new Set(fleet.createdEntries().map((entry) => entry.serial));
  const found = result.devices;
  if (found.length === 0) {
    out.push({
      en: 'No Wemo answered. Check that it is on the same network as Gladys, or type its address in "Wemo addresses".',
      fr: "Aucun Wemo n'a répondu. Vérifiez qu'il est sur le même réseau que Gladys, ou saisissez son adresse dans « Adresses des Wemo ».",
    });
  } else {
    const fresh = found.filter((device) => !created.has(device.serial)).length;
    out.push({
      en: `${found.length} Wemo found, ${fresh} not added yet: add them from the Discovery tab.`,
      fr: `${found.length} Wemo trouvé(s), dont ${fresh} pas encore ajouté(s) : ajoutez-les depuis l'onglet Découverte.`,
    });
    for (const device of found) {
      out.push({ en: `- ${nameWithAddress(device)}`, fr: `- ${nameWithAddress(device)}` });
    }
  }
  for (const device of result.unsupported) {
    const name = `${device.name ?? '?'} (${device.host})`;
    out.push({
      en: `Not supported: ${name}, ${device.deviceType}.`,
      fr: `Non pris en charge : ${name}, ${device.deviceType}.`,
    });
  }
  for (const address of result.unreachable) {
    out.push({
      en: `No Wemo answers at ${address}.`,
      fr: `Aucun Wemo ne répond à l'adresse ${address}.`,
    });
  }
  if (result.invalidHosts.length > 0) {
    const list = result.invalidHosts.join(', ');
    out.push({ en: `Addresses ignored: ${list}.`, fr: `Adresses ignorées : ${list}.` });
  }
  if (result.ssdpError) {
    out.push({
      en: 'Automatic search unavailable on this Gladys: only the typed addresses were tried.',
      fr: 'Recherche automatique indisponible sur ce Gladys : seules les adresses saisies ont été essayées.',
    });
  }
  return lines(out);
}

export const ACTIONS = {
  async scan(_gladys, { fleet }) {
    logger.info('Action scan');
    return describeDiscovery(await fleet.rediscover(), fleet);
  },

  async test_connection(_gladys, { fleet }) {
    logger.info('Action test_connection');
    const created = fleet.createdEntries();
    if (created.length === 0) {
      return {
        en: 'No Wemo added to Gladys yet: run "Search for Wemo devices" first.',
        fr: "Aucun Wemo ajouté à Gladys pour l'instant : lancez d'abord « Rechercher les Wemo ».",
      };
    }
    await Promise.all(created.map((entry) => fleet.refresh(entry)));
    return lines(
      created.map((entry) => {
        // Judged on this very read: one failure is not enough to turn the
        // device offline, but it is the answer to "does it respond now?".
        if (entry.failures === 0 && entry.reading) {
          const { value } = describeState(entry);
          return {
            en: `OK  ${nameWithAddress(entry)}: ${value.en}`,
            fr: `OK  ${nameWithAddress(entry)} : ${value.fr}`,
          };
        }
        const error = entry.lastError ?? '?';
        return {
          en: `KO  ${nameWithAddress(entry)}, port ${entry.port}: ${error}`,
          fr: `KO  ${nameWithAddress(entry)}, port ${entry.port} : ${error}`,
        };
      }),
    );
  },
};
