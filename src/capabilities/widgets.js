// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
//   wemo_overview  every Wemo added to Gladys: reachable or not, what it is
//                  doing, the total power of the Insights, a Search button;
//   wemo_insight   one Insight (chosen in the widget settings): live power and
//                  energy tiles, today's consumption, a 24 h power curve and a
//                  button that switches it.
//
// The content is declarative (validated in test/widgets.test.js with the
// SDK's validateWidgetContent): the core renders it with its own theme. Live
// tiles and the chart are bound to device features and follow the published
// states by themselves; the computed parts are refreshed by a nudge when the
// fleet sees a change (see createWidgetRefresher).
// -----------------------------------------------------------------------------

import {
  WIDGET_CHART_INTERVALS,
  WIDGET_CHART_TYPES,
  WIDGET_COLORS,
  createLogger,
} from '@gladysassistant/integration-sdk';
import { describeDiscovery } from './actions.js';
import { describeState } from './labels.js';
import { FEATURES, idsOf } from '../devices/index.js';
import { insightStateName } from '../wemo/fleet.js';
import { KINDS } from '../wemo/models.js';

const logger = createLogger({ name: 'widgets' });

export const OVERVIEW_WIDGET = 'wemo_overview';
export const INSIGHT_WIDGET = 'wemo_insight';

// Keys of the button actions the contents declare.
export const WIDGET_ACTIONS = { REDISCOVER: 'rediscover' };

// The status list of a widget holds 10 rows at most.
const MAX_ROWS = 10;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function overviewContent(fleet) {
  const created = fleet.createdEntries();
  const { total, online } = fleet.summary();
  const searchButton = {
    type: 'button',
    label: { en: 'Search for Wemo', fr: 'Chercher les Wemo' },
    icon: 'search',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REDISCOVER },
  };
  if (total === 0) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          text: {
            en: 'No Wemo added yet. Search for them, then add them from the Discovery tab of the integration.',
            fr: "Aucun Wemo ajouté pour l'instant. Lancez une recherche, puis ajoutez-les depuis l'onglet Découverte de l'intégration.",
          },
        },
        searchButton,
      ],
    };
  }

  const components = [
    {
      type: 'value',
      label: { en: 'Reachable', fr: 'Joignables' },
      icon: 'wifi',
      value: `${online}/${total}`,
      color:
        online === total
          ? WIDGET_COLORS.SUCCESS
          : online === 0
            ? WIDGET_COLORS.DANGER
            : WIDGET_COLORS.WARNING,
    },
  ];
  const insights = created.filter((entry) => entry.kind === KINDS.INSIGHT && entry.online);
  if (insights.length > 0) {
    const watts = insights.reduce((sum, entry) => sum + (entry.reading?.powerW ?? 0), 0);
    components.push({
      type: 'value',
      label: { en: 'Insight power', fr: 'Puissance Insight' },
      icon: 'zap',
      value: Math.round(watts),
      unit: 'W',
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  // Unreachable devices first: they are what the user opens the widget for.
  const rows = [...created]
    .sort((a, b) => Number(a.online !== false) - Number(b.online !== false))
    .slice(0, MAX_ROWS)
    .map((entry) => ({
      label: truncate(entry.name, 40),
      icon: entry.kind === KINDS.MOTION ? 'eye' : 'power',
      ...describeState(entry),
    }));
  components.push({ type: 'status', items: rows }, searchButton);
  // The computed rows follow the fleet's nudges; the TTL is a safety net.
  return { ttl_seconds: 60, components };
}

function insightContent(gladys, fleet, settings) {
  const entry = fleet.entryByExternalId(settings?.device);
  if (!entry || entry.kind !== KINDS.INSIGHT || !entry.created) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          text: {
            en: 'Choose a Wemo Insight in the settings of this widget.',
            fr: 'Choisissez un Wemo Insight dans les réglages de ce widget.',
          },
        },
      ],
    };
  }
  const ids = idsOf(gladys, entry.serial);
  const reading = entry.reading;
  const status = [{ label: { en: 'State', fr: 'État' }, icon: 'power', ...describeState(entry) }];
  if (reading && entry.online !== false) {
    const minutes = Math.round((reading.onTodaySeconds ?? 0) / 60);
    status.push(
      {
        label: { en: 'Today', fr: "Aujourd'hui" },
        icon: 'calendar',
        value: `${reading.todayKwh.toFixed(2)} kWh`,
        color: WIDGET_COLORS.NEUTRAL,
      },
      {
        label: { en: 'Running today', fr: "En marche aujourd'hui" },
        icon: 'clock',
        value: `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`,
        color: WIDGET_COLORS.NEUTRAL,
      },
    );
  }
  const components = [
    {
      type: 'value',
      label: { en: 'Power', fr: 'Puissance' },
      icon: 'zap',
      device_feature: ids.feature(FEATURES.POWER),
    },
    {
      type: 'value',
      label: { en: 'Energy', fr: 'Énergie' },
      icon: 'battery-charging',
      device_feature: ids.feature(FEATURES.ENERGY),
    },
    {
      type: 'chart',
      title: { en: 'Power, last 24 h', fr: 'Puissance, 24 dernières h' },
      chart_type: WIDGET_CHART_TYPES.AREA,
      device_features: [ids.feature(FEATURES.POWER)],
      interval: WIDGET_CHART_INTERVALS.LAST_DAY,
    },
    { type: 'status', items: status },
  ];
  if (reading && entry.online !== false) {
    // A device-bound button goes through onSetValue like any Gladys command.
    const isOn = insightStateName(reading.insightState) !== 'off';
    components.push({
      type: 'button',
      label: isOn ? { en: 'Turn off', fr: 'Éteindre' } : { en: 'Turn on', fr: 'Allumer' },
      icon: 'power',
      style: isOn ? 'danger' : 'primary',
      device_feature: ids.feature(FEATURES.BINARY),
      value: isOn ? 0 : 1,
    });
  }
  return { ttl_seconds: 60, components };
}

export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    async get(_gladys, { fleet }) {
      logger.debug(`onWidgetGet <- ${OVERVIEW_WIDGET}`);
      return overviewContent(fleet);
    },

    async action(_gladys, { actionKey, fleet }) {
      logger.info(`onWidgetAction <- ${OVERVIEW_WIDGET}.${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.REDISCOVER) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const result = await fleet.rediscover();
      const message = describeDiscovery(result, fleet);
      // A toast holds 200 characters: the first line says it all.
      return {
        en: truncate(message.en.split('\n')[0], 200),
        fr: truncate(message.fr.split('\n')[0], 200),
      };
    },
  },

  [INSIGHT_WIDGET]: {
    async get(gladys, { fleet, settings }) {
      logger.debug(`onWidgetGet <- ${INSIGHT_WIDGET}`);
      return insightContent(gladys, fleet, settings);
    },
  },
};

export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}

// The core takes one nudge per 10 s per widget and drops the others: a burst
// of changes (a scene switching every plug) becomes one nudge now and one at
// the end of the window.
const REFRESH_WINDOW_MS = 10_000;

export function createWidgetRefresher(
  gladys,
  { timers = { setTimeout, clearTimeout }, now = Date.now } = {},
) {
  let lastAt = -Infinity;
  let pending;
  return {
    request() {
      const wait = lastAt + REFRESH_WINDOW_MS - now();
      if (wait <= 0) {
        lastAt = now();
        refreshWidgets(gladys);
        return;
      }
      if (!pending) {
        pending = timers.setTimeout(() => {
          pending = undefined;
          lastAt = now();
          refreshWidgets(gladys);
        }, wait);
      }
    },
    cancel() {
      timers.clearTimeout(pending);
      pending = undefined;
    },
  };
}
