import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearChatDiagnostics,
  getDiagnosticsStats,
  getSwipeId,
  readDiagnosticRecord,
  writeDiagnosticRecord,
} from '../src/storage.js';
import { STORAGE_KEY } from '../src/constants.js';

test('getSwipeId normalizes invalid swipe ids to zero', () => {
  assert.equal(getSwipeId({ swipe_id: 2 }), 2);
  assert.equal(getSwipeId({ swipe_id: '1' }), 1);
  assert.equal(getSwipeId({ swipe_id: -1 }), 0);
  assert.equal(getSwipeId({ swipe_id: Number.NaN }), 0);
  assert.equal(getSwipeId({}), 0);
});

test('readDiagnosticRecord prefers current swipe before message fallback', () => {
  const fallbackRecord = { id: 'fallback' };
  const swipeRecord = { id: 'swipe' };
  const message = {
    swipe_id: 1,
    extra: { [STORAGE_KEY]: fallbackRecord },
    swipe_info: [
      { extra: { [STORAGE_KEY]: { id: 'other' } } },
      { extra: { [STORAGE_KEY]: swipeRecord } },
    ],
  };

  assert.equal(readDiagnosticRecord(message), swipeRecord);
});

test('readDiagnosticRecord returns fallback record when current swipe has none', () => {
  const fallbackRecord = { id: 'fallback' };
  const message = {
    swipe_id: 1,
    extra: { [STORAGE_KEY]: fallbackRecord },
    swipe_info: [{ extra: {} }, { extra: {} }],
  };

  assert.equal(readDiagnosticRecord(message), fallbackRecord);
});

test('writeDiagnosticRecord stores record on message and current swipe', async () => {
  const record = { summary: { joined: 1 } };
  const chat = [
    {
      swipe_id: 1,
      extra: {},
      swipe_info: [{ extra: {} }, { extra: {} }],
    },
  ];
  const synced = [];
  let saved = 0;

  const written = await writeDiagnosticRecord({
    chat,
    messageId: 0,
    record,
    syncMesToSwipe: id => synced.push(id),
    saveChatConditional: async () => {
      saved++;
    },
  });

  assert.equal(written, true);
  assert.equal(chat[0].extra[STORAGE_KEY], record);
  assert.equal(chat[0].swipe_info[1].extra[STORAGE_KEY], record);
  assert.deepEqual(synced, [0]);
  assert.equal(saved, 1);
});

test('writeDiagnosticRecord returns false for missing messages', async () => {
  const written = await writeDiagnosticRecord({
    chat: [],
    messageId: 10,
    record: {},
    syncMesToSwipe: () => assert.fail('sync should not be called'),
    saveChatConditional: () => assert.fail('save should not be called'),
  });

  assert.equal(written, false);
});

test('clearChatDiagnostics removes only diagnostic records from message and swipes', async () => {
  const chat = [
    {
      extra: { [STORAGE_KEY]: { id: 1 }, keep: true },
      swipe_info: [
        { extra: { [STORAGE_KEY]: { id: 2 }, keep: true } },
        { extra: { keep: true } },
      ],
    },
    {
      extra: { keep: true },
      swipe_info: [{ extra: { [STORAGE_KEY]: { id: 3 } } }],
    },
  ];
  const synced = [];
  let saved = 0;

  const removed = await clearChatDiagnostics({
    chat,
    syncMesToSwipe: id => synced.push(id),
    saveChatConditional: async () => {
      saved++;
    },
  });

  assert.equal(removed, 3);
  assert.equal(chat[0].extra[STORAGE_KEY], undefined);
  assert.equal(chat[0].extra.keep, true);
  assert.equal(chat[0].swipe_info[0].extra[STORAGE_KEY], undefined);
  assert.equal(chat[0].swipe_info[0].extra.keep, true);
  assert.equal(chat[1].swipe_info[0].extra[STORAGE_KEY], undefined);
  assert.deepEqual(synced, [0, 1]);
  assert.equal(saved, 1);
});

test('getDiagnosticsStats counts all stored records and estimates sizes', () => {
  const chat = [
    {
      extra: { [STORAGE_KEY]: { id: 'message' } },
      swipe_info: [{ extra: { [STORAGE_KEY]: { id: 'swipe' } } }],
    },
    { extra: {} },
  ];

  const stats = getDiagnosticsStats(chat);

  assert.equal(stats.recordCount, 2);
  assert.ok(stats.totalBytes > 0);
  assert.equal(stats.averageBytes, Math.round(stats.totalBytes / 2));
});
