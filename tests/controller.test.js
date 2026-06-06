import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY } from '../src/constants.js';
import { createExtensionController } from '../src/controller.js';

class FakeEventSource {
  constructor() {
    this.handlers = new Map();
  }

  on(type, handler) {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  async emit(type, ...args) {
    for (const handler of this.handlers.get(type) ?? []) {
      await handler(...args);
    }
  }
}

function parseRegexFromString(input) {
  const match = String(input).match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
  if (!match) return null;
  return new RegExp(match[1], match[2]);
}

test('controller wires native generation, scan events, final activation, and per-swipe persistence', async () => {
  const eventSource = new FakeEventSource();
  const eventTypes = {
    WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',
    WORLD_INFO_ACTIVATED: 'world_info_activated',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    MESSAGE_SWIPED: 'message_swiped',
  };
  const chat = [
    {
      swipe_id: 0,
      extra: {},
      swipe_info: [{ extra: {} }],
    },
  ];
  const statsRefreshes = [];
  let saved = 0;
  const entry = { world: 'lore', uid: 1, comment: 'Green Door', key: ['green'], probability: 100 };

  const controller = createExtensionController({
    chat,
    eventSource,
    event_types: eventTypes,
    extension_prompts: {},
    extension_settings: {},
    getCharacterCardFields: () => ({}),
    parseRegexFromString,
    world_info_logic: { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 },
    syncMesToSwipe: () => {},
    saveChatConditional: async () => {
      saved++;
    },
    saveSettingsDebounced: () => {},
    onStatsRefresh: stats => statsRefreshes.push(stats),
  });

  controller.activate();
  controller.captureGenerationInput(
    [{ index: 0, is_user: true, name: 'User', mes: 'the green door opens' }],
    4096,
    undefined,
    'normal',
  );
  await eventSource.emit(eventTypes.WORLDINFO_SCAN_DONE, {
    state: { current: 1, next: 0, loopCount: 1 },
    new: { all: [entry], successful: [entry] },
    activated: { entries: new Map([[`${entry.world}.${entry.uid}`, entry]]), text: entry.content ?? '' },
    budget: { current: 10, overflowed: false },
  });
  await eventSource.emit(eventTypes.WORLD_INFO_ACTIVATED, [entry]);
  await eventSource.emit(eventTypes.CHARACTER_MESSAGE_RENDERED, 0, 'normal');

  const record = chat[0].swipe_info[0].extra[STORAGE_KEY];
  assert.equal(saved, 1);
  assert.equal(record.messageId, 0);
  assert.equal(record.swipeId, 0);
  assert.equal(record.items.length, 1);
  assert.equal(record.items[0].nativeConfirmation.status, 'joined');
  assert.equal(record.items[0].pluginExplanation.confidence, 'plugin_explanation');
  assert.equal(record.items[0].pluginExplanation.primaryMatches[0].key, 'green');
  assert.ok(statsRefreshes.at(-1).recordCount >= 1);
});
