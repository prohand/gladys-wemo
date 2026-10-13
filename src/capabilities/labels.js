// -----------------------------------------------------------------------------
// Texts shared by the widgets, the actions and the scene actions, in every
// language Gladys offers (the core shows `en` for any other).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { insightStateName } from '../wemo/fleet.js';
import { KINDS } from '../wemo/models.js';

/** Languages every user-facing text carries: the languages of the Gladys UI. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Build a multi-language text by calling `fn(lang)` for each language. */
export function eachLanguage(fn) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, fn(lang)]));
}

/** The same text in every language (a name, an address). */
export function untranslated(text) {
  return eachLanguage(() => text);
}

const TEXTS = {
  on: { en: 'On', fr: 'Allumé', de: 'Ein', es: 'Encendido' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  standby: { en: 'Standby', fr: 'En veille', de: 'Standby', es: 'En reposo' },
  motion: { en: 'Motion', fr: 'Mouvement', de: 'Bewegung', es: 'Movimiento' },
  calm: { en: 'No motion', fr: 'Aucun mouvement', de: 'Keine Bewegung', es: 'Sin movimiento' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Warten', es: 'En espera' },
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
        value: eachLanguage((lang) => `${TEXTS.on[lang]}, ${watts} W`),
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
      value: eachLanguage((lang) => `${TEXTS.on[lang]}, ${reading.brightness} %`),
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return { value: TEXTS.on, color: WIDGET_COLORS.SUCCESS };
}

/** "Kitchen (192.168.1.20)" */
export function nameWithAddress(entry) {
  return `${entry.name} (${entry.host})`;
}

/** Join lines in every language, bounded so the message fits under a button. */
export function lines(entries, max = 1000) {
  return eachLanguage((lang) => {
    const text = entries.map((line) => line[lang] ?? line.en).join('\n');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  });
}
