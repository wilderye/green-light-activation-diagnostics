import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticRecord } from '../src/diagnostic-builder.js';

function makeMatcher(explanation = {}) {
  return {
    explainEntry(entry) {
      return {
        confidence: 'plugin_explanation',
        reasonType: 'keyword',
        sourceType: 'chat',
        sourceMessageIndex: 3,
        snippet: '...green key...',
        matchCount: 1,
        primaryMatches: [{ key: entry.key[0], snippet: '...green key...' }],
        secondaryMatches: [],
        missingSecondaryKeys: [],
        ...explanation,
      };
    },
  };
}

test('buildDiagnosticRecord includes green entries and excludes constant or no-key entries', () => {
  const joined = { world: 'w', uid: 1, comment: 'Joined', key: ['green'] };
  const failed = { world: 'w', uid: 2, comment: 'Failed', key: ['amber'] };
  const constant = { world: 'w', uid: 3, comment: 'Constant', key: ['blue'], constant: true };
  const noKey = { world: 'w', uid: 4, comment: 'No key', key: [] };

  const record = buildDiagnosticRecord({
    collected: {
      session: { generationType: 'normal' },
      loops: [{ newAll: [failed, constant, noKey], probabilityFailed: [failed] }],
      finalActivatedEntries: [joined],
    },
    matcher: makeMatcher(),
    settings: {},
    messageId: 9,
    swipeId: 1,
  });

  assert.deepEqual(record.items.map(item => item.uid), [2, 1]);
  assert.equal(record.items[0].nativeConfirmation.reasonType, 'probability_failed');
  assert.equal(record.items[1].nativeConfirmation.status, 'joined');
});

test('buildDiagnosticRecord separates native confirmation and plugin explanation', () => {
  const record = buildDiagnosticRecord({
    collected: {
      session: { generationType: 'swipe' },
      loops: [],
      finalActivatedEntries: [{ world: 'w', uid: 1, comment: 'Entry', key: ['green'] }],
    },
    matcher: makeMatcher({ sourceType: 'persona', sourceMessageIndex: null }),
    settings: {},
    messageId: 4,
    swipeId: 2,
  });

  assert.equal(record.messageId, 4);
  assert.equal(record.swipeId, 2);
  assert.equal(record.generationType, 'swipe');
  assert.deepEqual(record.items[0].nativeConfirmation, { status: 'joined', reasonType: 'native_joined' });
  assert.equal(record.items[0].pluginExplanation.confidence, 'plugin_explanation');
  assert.equal(record.items[0].pluginExplanation.sourceType, 'persona');
});

test('buildDiagnosticRecord creates colon hierarchy summary wording', () => {
  const record = buildDiagnosticRecord({
    collected: {
      session: { generationType: 'normal' },
      loops: [{ newAll: [{ world: 'w', uid: 2, key: ['amber'] }], probabilityFailed: [{ world: 'w', uid: 2, key: ['amber'] }] }],
      finalActivatedEntries: [{ world: 'w', uid: 1, key: ['green'] }],
    },
    matcher: makeMatcher(),
    settings: {},
    messageId: 1,
    swipeId: 0,
  });

  assert.equal(record.summary.joined, 1);
  assert.equal(record.summary.matchedNotJoined, 1);
  assert.match(record.summaryText, /实际加入 1 条：关键词触发 2 条/);
  assert.match(record.summaryText, /命中未加入 1 条：概率失败 1 条/);
});

test('buildDiagnosticRecord stores compact snippets without full scan text', () => {
  const fullText = 'full scan text should not be persisted in this diagnostic record';
  const record = buildDiagnosticRecord({
    collected: {
      session: {
        generationType: 'normal',
        chatMessages: [{ text: fullText }],
      },
      loops: [],
      finalActivatedEntries: [{ world: 'w', uid: 1, key: ['green'], content: fullText }],
    },
    matcher: makeMatcher({ snippet: '...green...' }),
    settings: { snippetRadius: 4 },
    messageId: 1,
    swipeId: 0,
  });

  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes(fullText), false);
  assert.equal(record.items[0].content, undefined);
  assert.equal(record.items[0].pluginExplanation.snippet, '...green...');
});
