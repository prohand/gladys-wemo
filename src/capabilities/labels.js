// -----------------------------------------------------------------------------
// Bilingual texts shared by the widgets, the actions and the scene actions.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { insightStateName } from '../wemo/fleet.js';
import { KINDS } from '../wemo/models.js';

const TEXTS = {
  on: { en: 'On', fr: 'Allumé' },
  off: { en: 'Off', fr: 'Éteint' },
  standby: { en: 'Standby', fr: 'En veille' },
  motion: { en: 'Motion', fr: 'Mouvement' },
  calm: { en: 'No motion', fr: 'Aucun mouvement' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable' },
  waiting: { en: 'Waiting', fr: 'En attente' },
};

/**
 * What a Wemo is doing, as a status row value and color.
 * @param {object} entry fleet entry
 */
export function describeState(entry) {
  if (entry.online === false) {
    return { value: TEXTS.unreachable, color: WIDGET_COLORS.DANGER };
  }
  const reading = entry.reading;
  if (!reading) {
    return { value: TEXTS.waiting, color: WIDGET_COLORS.NEUTRAL };
  }
  if (entry.kind === KINDS.MOTION) {
    return reading.motion
      ? { value: TEXTS.motion, color: WIDGET_COLORS.WARNING }
      : { value: TEXTS.calm, color: WIDGET_COLORS.NEUTRAL };
  }
  if (entry.kind === KINDS.INSIGHT) {
    const state = insightStateName(reading.insightState);
    if (state === 'on') {
      const watts = Math.round(reading.powerW);
      return {
        value: { en: `On, ${watts} W`, fr: `Allumé, ${watts} W` },
        color: WIDGET_COLORS.SUCCESS,
      };
    }
    return state === 'standby'
      ? { value: TEXTS.standby, color: WIDGET_COLORS.INFO }
      : { value: TEXTS.off, color: WIDGET_COLORS.NEUTRAL };
  }
  if (!reading.on) {
    return { value: TEXTS.off, color: WIDGET_COLORS.NEUTRAL };
  }
  if (reading.brightness !== undefined) {
    return {
      value: { en: `On, ${reading.brightness} %`, fr: `Allumé, ${reading.brightness} %` },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return { value: TEXTS.on, color: WIDGET_COLORS.SUCCESS };
}

/** "Kitchen (192.168.1.20)" */
export function nameWithAddress(entry) {
  return `${entry.name} (${entry.host})`;
}

/** Join lines in both languages, bounded so the message fits under a button. */
export function lines(entries, max = 1000) {
  const join = (lang) => {
    const text = entries.map((line) => line[lang] ?? line.en).join('\n');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };
  return { en: join('en'), fr: join('fr') };
}
