import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNativeOutcome,
  getEntryDisplayName,
  isGreenLightEntry,
} from '../src/entry-utils.js';

test('isGreenLightEntry includes enabled keyword entries only', () => {
  assert.equal(isGreenLightEntry({ key: ['lamp'] }), true);
  assert.equal(isGreenLightEntry({ key: ['  ', 'lamp'] }), true);
  assert.equal(isGreenLightEntry({ key: ['lamp'], disable: true }), false);
  assert.equal(isGreenLightEntry({ key: ['lamp'], constant: true }), false);
  assert.equal(isGreenLightEntry({ key: [] }), false);
  assert.equal(isGreenLightEntry({ key: ['   '] }), false);
  assert.equal(isGreenLightEntry({}), false);
});

test('getEntryDisplayName uses comment before uid fallback', () => {
  assert.equal(getEntryDisplayName({ comment: 'The Door', uid: 2 }), 'The Door');
  assert.equal(getEntryDisplayName({ comment: '   ', uid: 2 }), 'UID 2');
  assert.equal(getEntryDisplayName({}), 'UID ?');
});

test('classifyNativeOutcome marks final activated entries as joined', () => {
  const entry = { world: 'w', uid: 1 };

  const outcome = classifyNativeOutcome(entry, {
    finalActivatedEntries: [entry],
    loops: [],
  });

  assert.deepEqual(outcome, { status: 'joined', reasonType: 'native_joined' });
});

test('classifyNativeOutcome marks probability failures from collector loops', () => {
  const entry = { world: 'w', uid: 1 };

  const outcome = classifyNativeOutcome(entry, {
    finalActivatedEntries: [],
    loops: [{ probabilityFailed: [entry] }],
  });

  assert.deepEqual(outcome, { status: 'matched_not_joined', reasonType: 'probability_failed' });
});

test('classifyNativeOutcome marks group loser when a final winner shares a group', () => {
  const entry = { world: 'w', uid: 1, group: 'arc' };

  const outcome = classifyNativeOutcome(entry, {
    finalActivatedEntries: [{ world: 'w', uid: 2, group: 'other, arc' }],
    loops: [],
  });

  assert.deepEqual(outcome, { status: 'matched_not_joined', reasonType: 'group_loser' });
});

test('classifyNativeOutcome marks budget blocked when scan overflowed', () => {
  const entry = { world: 'w', uid: 1 };

  const outcome = classifyNativeOutcome(entry, {
    finalActivatedEntries: [],
    loops: [{ budget: { overflowed: true } }],
  });

  assert.deepEqual(outcome, { status: 'matched_not_joined', reasonType: 'budget_blocked' });
});

test('classifyNativeOutcome falls back to unknown matched-not-joined reason', () => {
  const outcome = classifyNativeOutcome({ world: 'w', uid: 1 }, {
    finalActivatedEntries: [],
    loops: [],
  });

  assert.deepEqual(outcome, {
    status: 'matched_not_joined',
    reasonType: 'matched_not_joined_unknown',
  });
});
