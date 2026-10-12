import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatePublisher } from '../src/wemo/states.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

test('only changes are published, a deadband value when it moved enough or got old', async () => {
  const gladys = createFakeGladys();
  let time = 0;
  const publisher = createStatePublisher(gladys, { now: () => time });
  const publish = (value) => publisher.publish([{ id: 'p', value, deadband: 1 }]);

  assert.equal(await publish(100), 1);
  assert.equal(await publish(100.4), 0, 'under the deadband');
  assert.equal(await publish(101.2), 1);
  time += 5 * 60 * 1000;
  assert.equal(await publish(101.5), 1, 'old enough to follow a slow drift');
  assert.equal(await publish(101.5), 0, 'unchanged is never published');
  assert.deepEqual(gladys.statesOf('p'), [100, 101.2, 101.5]);
});

test('a refused batch goes out again; forget() republishes', async () => {
  const gladys = createFakeGladys();
  const publisher = createStatePublisher(gladys);
  const original = gladys.publishStates;
  gladys.publishStates = async () => {
    throw new Error('429');
  };
  await assert.rejects(publisher.publish([{ id: 'a', value: 1 }]));
  gladys.publishStates = original;
  assert.equal(await publisher.publish([{ id: 'a', value: 1 }]), 1);
  assert.equal(await publisher.publish([{ id: 'a', value: 1 }]), 0);
  publisher.forget();
  assert.equal(await publisher.publish([{ id: 'a', value: 1 }]), 1);
  assert.equal(publisher.valueOf('a'), 1);
});
