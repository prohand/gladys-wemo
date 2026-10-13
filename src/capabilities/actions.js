// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
//
// Each handler resolves the multi-language message shown under its button. Keys are
// stored in the manifest: never rename one.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { describeState, lines, nameWithAddress, untranslated } from './labels.js';

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
      de: 'Kein Wemo hat geantwortet. Prüfe, ob er sich im selben Netzwerk wie Gladys befindet, oder trage seine Adresse unter „Wemo-Adressen“ ein.',
      es: 'Ningún Wemo ha respondido. Compruebe que está en la misma red que Gladys, o introduzca su dirección en «Direcciones de los Wemo».',
    });
  } else {
    const fresh = found.filter((device) => !created.has(device.serial)).length;
    out.push({
      en: `${found.length} Wemo found, ${fresh} not added yet: add them from the Discover tab.`,
      fr: `${found.length} Wemo trouvé(s), dont ${fresh} pas encore ajouté(s) : ajoutez-les depuis l'onglet Découverte.`,
      de: `${found.length} Wemo gefunden, davon ${fresh} noch nicht hinzugefügt: Füge sie über den Tab „Entdecken“ hinzu.`,
      es: `${found.length} Wemo encontrado(s), de ellos ${fresh} aún sin añadir: añádalos desde la pestaña «Descubrir».`,
    });
    for (const device of found) {
      out.push(untranslated(`- ${nameWithAddress(device)}`));
    }
  }
  for (const device of result.unsupported) {
    const name = `${device.name ?? '?'} (${device.host})`;
    out.push({
      en: `Not supported: ${name}, ${device.deviceType}.`,
      fr: `Non pris en charge : ${name}, ${device.deviceType}.`,
      de: `Nicht unterstützt: ${name}, ${device.deviceType}.`,
      es: `No compatible: ${name}, ${device.deviceType}.`,
    });
  }
  for (const address of result.unreachable) {
    out.push({
      en: `No Wemo answers at ${address}.`,
      fr: `Aucun Wemo ne répond à l'adresse ${address}.`,
      de: `Unter ${address} antwortet kein Wemo.`,
      es: `Ningún Wemo responde en ${address}.`,
    });
  }
  if (result.invalidHosts.length > 0) {
    const list = result.invalidHosts.join(', ');
    out.push({
      en: `Addresses ignored: ${list}.`,
      fr: `Adresses ignorées : ${list}.`,
      de: `Ignorierte Adressen: ${list}.`,
      es: `Direcciones ignoradas: ${list}.`,
    });
  }
  if (result.ssdpError) {
    out.push({
      en: 'Automatic search unavailable on this Gladys: only the typed addresses were tried.',
      fr: 'Recherche automatique indisponible sur ce Gladys : seules les adresses saisies ont été essayées.',
      de: 'Automatische Suche auf diesem Gladys nicht verfügbar: Nur die eingetragenen Adressen wurden versucht.',
      es: 'Búsqueda automática no disponible en este Gladys: solo se han probado las direcciones introducidas.',
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
        de: 'Noch kein Wemo zu Gladys hinzugefügt: Starte zuerst „Wemo-Geräte suchen“.',
        es: 'Todavía no se ha añadido ningún Wemo a Gladys: ejecute primero «Buscar dispositivos Wemo».',
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
            de: `OK  ${nameWithAddress(entry)}: ${value.de}`,
            es: `OK  ${nameWithAddress(entry)}: ${value.es}`,
          };
        }
        const error = entry.lastError ?? '?';
        return {
          en: `KO  ${nameWithAddress(entry)}, port ${entry.port}: ${error}`,
          fr: `KO  ${nameWithAddress(entry)}, port ${entry.port} : ${error}`,
          de: `KO  ${nameWithAddress(entry)}, Port ${entry.port}: ${error}`,
          es: `KO  ${nameWithAddress(entry)}, puerto ${entry.port}: ${error}`,
        };
      }),
    );
  },
};
