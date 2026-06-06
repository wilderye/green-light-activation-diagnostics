import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanelModel, openDiagnosticsPanel } from '../src/panel.js';

const record = {
  summaryText: '实际加入 1 条：关键词触发 2 条\n命中未加入 1 条：概率失败 1 条',
  items: [
    {
      entryKey: 'w.1',
      world: '<world>',
      uid: 1,
      name: 'Joined',
      nativeConfirmation: { status: 'joined', reasonType: 'native_joined' },
      pluginExplanation: {
        reasonType: 'keyword',
        sourceType: 'chat',
        sourceMessageIndex: 7,
        snippet: 'hit snippet',
        primaryMatches: [{ key: 'green', match: 'green', snippet: 'hit snippet' }],
        secondaryMatches: [],
        missingSecondaryKeys: [],
      },
    },
    {
      entryKey: 'w.2',
      world: 'World',
      uid: 2,
      name: 'Blocked',
      nativeConfirmation: { status: 'matched_not_joined', reasonType: 'probability_failed' },
      pluginExplanation: {
        reasonType: 'keyword',
        sourceType: 'persona',
        sourceMessageIndex: null,
        snippet: 'persona snippet',
        primaryMatches: [{ key: 'amber', match: 'amber', snippet: 'persona snippet' }],
        secondaryMatches: [],
        missingSecondaryKeys: [],
      },
    },
  ],
};

test('createPanelModel returns no-record state for empty messages', () => {
  const model = createPanelModel(null, { messageId: 4, viewportWidth: 800 });

  assert.equal(model.noRecord, true);
  assert.equal(model.message, '本条消息没有绿灯诊断记录');
  assert.equal(model.subtitle, '第 4 楼 · 本次 AI 回复生成前');
  assert.deepEqual(model.items, []);
});

test('createPanelModel filters joined, matched-not-joined, and non-chat source items', () => {
  assert.deepEqual(createPanelModel(record, { filter: 'joined' }).items.map(item => item.uid), [1]);
  assert.deepEqual(createPanelModel(record, { filter: 'matched_not_joined' }).items.map(item => item.uid), [2]);
  assert.deepEqual(createPanelModel(record, { filter: 'non_chat_source' }).items.map(item => item.uid), [2]);
});

test('createPanelModel builds desktop detail model with selected item', () => {
  const model = createPanelModel(record, { viewportWidth: 900, selectedEntryKey: 'w.2' });

  assert.equal(model.layout, 'desktop');
  assert.equal(model.selectedItem.uid, 2);
  assert.equal(model.items[0].statusLabel, '已加入');
  assert.equal(model.items[1].statusLabel, '命中未加入');
  assert.match(model.items[1].reasonText, /概率失败/);
});

test('createPanelModel builds mobile expandable cards', () => {
  const model = createPanelModel(record, { viewportWidth: 390 });

  assert.equal(model.layout, 'mobile');
  assert.equal(model.cardsExpandable, true);
  assert.equal(model.items[0].expanded, false);
});

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.listeners = {};
    this.textContent = '';
    this.innerHTMLWrites = [];
  }

  set innerHTML(value) {
    this.innerHTMLWrites.push(value);
  }

  get innerHTML() {
    return '';
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    this.removed = true;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
}

function collectText(element, output = []) {
  if (element.textContent) output.push(element.textContent);
  for (const child of element.children ?? []) collectText(child, output);
  return output;
}

test('openDiagnosticsPanel renders untrusted text with textContent', () => {
  const body = new FakeElement('body');
  const document = {
    body,
    querySelector: () => null,
    createElement: tagName => new FakeElement(tagName),
  };

  const panel = openDiagnosticsPanel({ record, messageId: 1, document });
  const text = collectText(panel).join('\n');

  assert.match(text, /<world>/);
  assert.equal(panel.innerHTMLWrites.length, 0);
  assert.equal(body.children[0], panel);
});
