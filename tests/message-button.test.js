import test from 'node:test';
import assert from 'node:assert/strict';
import { injectMessageButtons } from '../src/message-button.js';

class FakeElement {
  constructor({ attrs = {}, className = '' } = {}) {
    this.attrs = attrs;
    this.className = className;
    this.children = [];
    this.title = '';
    this.dataset = {};
    this.listeners = {};
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  querySelector(selector) {
    if (selector === '.extraMesButtons') return this.extraButtons ?? null;
    if (selector === '.green-light-diagnostics-button') {
      return this.children.find(child => child.className.includes('green-light-diagnostics-button')) ?? null;
    }
    return null;
  }

  prepend(child) {
    this.children.unshift(child);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  click() {
    this.listeners.click?.({
      preventDefault() {},
      stopPropagation() {},
    });
  }
}

function makeMessage({ id, swipeId = 0, isUser = false, withContainer = true }) {
  const message = new FakeElement({
    attrs: { mesid: String(id), swipeid: String(swipeId), is_user: String(isUser) },
    className: 'mes',
  });
  if (withContainer) {
    message.extraButtons = new FakeElement({ className: 'extraMesButtons' });
  }
  return message;
}

test('injectMessageButtons skips user messages and adds one AI button in extra menu', () => {
  const aiMessage = makeMessage({ id: 2, swipeId: 1, isUser: false });
  const userMessage = makeMessage({ id: 1, isUser: true });
  const root = { querySelectorAll: () => [userMessage, aiMessage] };
  globalThis.document = { createElement: () => new FakeElement() };

  injectMessageButtons({ root });
  injectMessageButtons({ root });

  assert.equal(userMessage.extraButtons.children.length, 0);
  assert.equal(aiMessage.extraButtons.children.length, 1);
  const button = aiMessage.extraButtons.children[0];
  assert.match(button.className, /mes_button/);
  assert.match(button.className, /green-light-diagnostics-button/);
  assert.match(button.className, /fa-traffic-light/);
  assert.equal(button.title, '绿灯激活诊断');
});

test('injectMessageButtons click callback receives message id and swipe id', () => {
  const aiMessage = makeMessage({ id: 7, swipeId: 3, isUser: false });
  const root = { querySelectorAll: () => [aiMessage] };
  const clicks = [];
  globalThis.document = { createElement: () => new FakeElement() };

  injectMessageButtons({ root, onClick: detail => clicks.push(detail) });
  aiMessage.extraButtons.children[0].click();

  assert.deepEqual(clicks, [{ messageId: 7, swipeId: 3 }]);
});

test('injectMessageButtons can mark whether a message already has a record', () => {
  const aiMessage = makeMessage({ id: 7, swipeId: 3, isUser: false });
  const root = { querySelectorAll: () => [aiMessage] };
  globalThis.document = { createElement: () => new FakeElement() };

  injectMessageButtons({ root, hasRecord: ({ messageId }) => messageId === 7 });

  assert.equal(aiMessage.extraButtons.children[0].dataset.hasRecord, 'true');
});
