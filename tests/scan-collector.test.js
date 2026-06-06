import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanCollector, entryKey } from '../src/scan-collector.js';

test('entryKey combines world and uid', () => {
  assert.equal(entryKey({ world: 'lore', uid: 7 }), 'lore.7');
  assert.equal(entryKey({ uid: 7 }), '.7');
});

test('scan collector ignores scan events without an active session', () => {
  const collector = createScanCollector();

  collector.onScanDone({ new: { all: [{ uid: 1 }], successful: [] } });
  collector.onActivated([{ uid: 1 }]);

  assert.equal(collector.getCurrent(), null);
});

test('scan collector records loops and probability failures from new all minus successful', () => {
  const session = { id: 1 };
  const collector = createScanCollector();
  const failed = { world: 'w', uid: 1, key: ['fail'] };
  const successful = { world: 'w', uid: 2, key: ['ok'] };

  collector.start(session);
  collector.onScanDone({
    state: { current: 1, next: 2, loopCount: 4 },
    new: { all: [failed, successful], successful: [successful] },
    activated: {
      entries: new Map([[entryKey(successful), successful]]),
      text: 'activated text',
    },
    sortedEntries: [successful, failed],
    budget: { current: 123, overflowed: true },
    recursionDelay: { currentLevel: 1 },
  });

  const current = collector.getCurrent();
  assert.equal(current.session, session);
  assert.equal(current.loops.length, 1);
  assert.equal(current.loops[0].loopCount, 4);
  assert.deepEqual(current.loops[0].stateCurrent, 1);
  assert.deepEqual(current.loops[0].stateNext, 2);
  assert.deepEqual(current.loops[0].newAll, [failed, successful]);
  assert.deepEqual(current.loops[0].newSuccessful, [successful]);
  assert.deepEqual(current.loops[0].probabilityFailed, [failed]);
  assert.deepEqual(current.loops[0].activatedEntries, [successful]);
  assert.equal(current.loops[0].activatedText, 'activated text');
  assert.deepEqual(current.loops[0].budget, { current: 123, overflowed: true });
  assert.deepEqual(current.loops[0].recursionDelay, { currentLevel: 1 });
});

test('scan collector stores final activated entries from native final event', () => {
  const session = { id: 1 };
  const collector = createScanCollector();
  const finalEntry = { world: 'w', uid: 10 };

  collector.start(session);
  collector.onActivated([finalEntry]);
  const collected = collector.finish();

  assert.equal(collected.session, session);
  assert.deepEqual(collected.finalActivatedEntries, [finalEntry]);
  assert.equal(collector.getCurrent(), null);
});
