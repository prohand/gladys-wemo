import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('normalizeConfig fills the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
});

test('normalizeConfig converts and bounds the numbers typed in the form', () => {
  const config = normalizeConfig({ poll_interval: '30', motion_poll_interval: 0 });
  assert.equal(config.poll_interval, 30);
  assert.equal(config.motion_poll_interval, 1);
  assert.equal(normalizeConfig({ poll_interval: 99999 }).poll_interval, 300);
  assert.equal(normalizeConfig({ poll_interval: 'abc' }).poll_interval, 10);
});

test('normalizeConfig keeps the hosts text and reads the boolean', () => {
  assert.equal(normalizeConfig({ hosts: '192.168.1.20' }).hosts, '192.168.1.20');
  assert.equal(normalizeConfig({ hosts: 42 }).hosts, '');
  assert.equal(normalizeConfig({ auto_rediscover: false }).auto_rediscover, false);
  assert.equal(normalizeConfig({ auto_rediscover: undefined }).auto_rediscover, true);
});
