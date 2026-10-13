// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest itself, but nothing there knows
// which handlers the code registers: these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { ACTIONS } from '../src/capabilities/actions.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widgets.js';
import { SSDP_SEARCH_TARGET } from '../src/wemo/discovery.js';
import { SCENE_TRIGGERS } from '../src/wemo/fleet.js';
import { LANGUAGES } from '../src/capabilities/labels.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

function sameKeys(declared, handled, what) {
  for (const key of declared) {
    assert.ok(handled.includes(key), `${what} "${key}" is declared but has no handler`);
  }
  for (const key of handled) {
    assert.ok(declared.includes(key), `${what} "${key}" is handled but not declared`);
  }
}

test('every manifest action has a handler, and vice versa', () => {
  sameKeys(keysOf(manifest.actions), Object.keys(ACTIONS), 'action');
});

test('every scene action has a handler, and vice versa', () => {
  sameKeys(keysOf(manifest.scene_actions), Object.keys(SCENE_ACTIONS), 'scene action');
});

test('every widget has a content handler, and vice versa', () => {
  sameKeys(keysOf(manifest.widgets), Object.keys(WIDGETS), 'widget');
  for (const widget of Object.values(WIDGETS)) {
    assert.equal(typeof widget.get, 'function');
  }
});

test('every scene trigger the fleet fires is declared, and vice versa', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  sameKeys(keysOf(manifest.scene_triggers), Object.values(SCENE_TRIGGERS), 'scene trigger');
});

test('the capability fields and the categories fit the gladys_version range', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), [4, 86, 0]), 'categories need Gladys >= 4.86.0');
  assert.ok(
    isAtLeast(minGladysVersion(), [5, 1, 0]),
    'scene_triggers, scene_actions and widgets need Gladys >= 5.1.0',
  );
});

test('the transport is local only: the Belkin cloud is gone', () => {
  // A single transport: no "Prefer the local connection" toggle, and no
  // GLADYS_PREFER_LOCAL key to handle.
  assert.deepEqual(manifest.transports, ['local']);
});

test('the SSDP capture declared is the one the discovery asks for', () => {
  assert.deepEqual(manifest.network_discovery, [{ type: 'ssdp', st: SSDP_SEARCH_TARGET }]);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG, and every key is known', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG), `section "${field.key}" stores no value`);
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG has no "${field.key}"`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('section fields are purely presentational, with https links', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamic.length > 0);
  for (const field of dynamic) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('every text carries every Gladys language: label, description, placeholder, options', () => {
  const texts = [manifest.description];
  const visit = (item) => {
    for (const key of ['label', 'description', 'placeholder']) {
      if (item[key] !== undefined) {
        texts.push(item[key]);
      }
    }
    for (const nested of [
      ...(item.fields ?? []),
      ...(item.options ?? []),
      ...(item.variables ?? []),
      ...(item.outputs ?? []),
      ...(item.settings ?? []),
      ...(item.links ?? []),
    ]) {
      visit(nested);
    }
  };
  for (const item of [
    ...manifest.config_schema,
    ...manifest.actions,
    ...manifest.scene_triggers,
    ...manifest.scene_actions,
    ...manifest.widgets,
  ]) {
    visit(item);
  }
  for (const text of texts) {
    assert.equal(typeof text, 'object', JSON.stringify(text));
    assert.deepEqual(Object.keys(text), LANGUAGES, `languages of ${JSON.stringify(text)}`);
    for (const lang of LANGUAGES) {
      assert.ok(text[lang], `empty ${lang} in ${JSON.stringify(text)}`);
    }
  }
});

test('the code offers the four languages of the Gladys interface', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('section texts hold 1000 characters at most per language', () => {
  for (const section of manifest.config_schema.filter((field) => field.type === 'section')) {
    for (const lang of LANGUAGES) {
      assert.ok(section.description[lang].length <= 1000, `${section.key}.${lang}`);
    }
  }
});

test('the version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  assert.deepEqual(Object.keys(manifest.description), LANGUAGES);
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('widget labels hold 3 to 30 characters and descriptions 100 at most', () => {
  for (const widget of manifest.widgets) {
    for (const lang of LANGUAGES) {
      assert.ok(widget.label[lang].length >= 3 && widget.label[lang].length <= 30);
      assert.ok(widget.description[lang].length <= 100);
    }
  }
});
