import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmAndClearDiagnostics,
  createSettingsModel,
  getSettings,
  renderSettingsPanel,
  updateSetting,
} from '../src/settings.js';
import { DEFAULT_SETTINGS, EXTENSION_ID } from '../src/constants.js';

test('getSettings creates defaults and preserves existing overrides', () => {
  const extensionSettings = {
    [EXTENSION_ID]: { includeSnippets: false },
  };

  const settings = getSettings(extensionSettings);

  assert.equal(settings.includeSnippets, false);
  assert.equal(settings.saveDiagnostics, DEFAULT_SETTINGS.saveDiagnostics);
  assert.equal(extensionSettings[EXTENSION_ID], settings);
});

test('updateSetting writes value and requests debounced settings save', () => {
  const settings = { saveDiagnostics: true };
  let saved = 0;

  updateSetting(settings, 'saveDiagnostics', false, () => {
    saved++;
  });

  assert.equal(settings.saveDiagnostics, false);
  assert.equal(saved, 1);
});

test('createSettingsModel reports stats and size warnings', () => {
  const model = createSettingsModel(
    { ...DEFAULT_SETTINGS },
    { recordCount: 3, totalBytes: 3 * 1024 * 1024, averageBytes: 21 * 1024 },
  );

  assert.equal(model.recordCountLabel, '3 条记录');
  assert.equal(model.totalSizeWarning, true);
  assert.equal(model.averageSizeWarning, true);
});

test('confirmAndClearDiagnostics skips when user cancels', async () => {
  const removed = await confirmAndClearDiagnostics({
    confirm: () => false,
    clearChatDiagnostics: () => assert.fail('clear should not run'),
  });

  assert.equal(removed, 0);
});

test('confirmAndClearDiagnostics clears when user confirms', async () => {
  let called = 0;
  const removed = await confirmAndClearDiagnostics({
    confirm: () => true,
    clearChatDiagnostics: async args => {
      called++;
      assert.deepEqual(args.chat, []);
      return 2;
    },
    chat: [],
  });

  assert.equal(called, 1);
  assert.equal(removed, 2);
});

class FakeElement {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.className = '';
    this.type = '';
    this.checked = false;
    this.value = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  replaceChildren(...children) {
    this.children = children;
  }
}

function collectText(element, output = []) {
  if (element.textContent) output.push(element.textContent);
  for (const child of element.children ?? []) collectText(child, output);
  return output;
}

test('renderSettingsPanel appends native settings UI with cleanup button', () => {
  const container = new FakeElement();
  const document = {
    querySelector: selector => (selector === '#extensions_settings2' ? container : null),
    createElement: () => new FakeElement(),
  };

  const panel = renderSettingsPanel({
    document,
    settings: { ...DEFAULT_SETTINGS },
    stats: { recordCount: 1, totalBytes: 100, averageBytes: 100 },
  });

  const text = collectText(panel).join('\n');
  assert.equal(container.children[0], panel);
  assert.match(text, /绿灯激活诊断器/);
  assert.match(text, /清除当前聊天诊断记录/);
});
