import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/session.js';

test('captureGenerationInput copies coreChat with original index, role, depth, and text', () => {
  const coreChat = [
    { index: 4, is_user: true, name: 'User', mes: 'first' },
    { index: 5, is_user: false, name: 'Bot', mes: 'second' },
  ];
  const original = structuredClone(coreChat);
  const store = createSessionStore({});

  const session = store.captureGenerationInput(coreChat, 4096, undefined, 'normal');

  assert.deepEqual(coreChat, original);
  assert.equal(session.contextSize, 4096);
  assert.equal(session.generationType, 'normal');
  assert.deepEqual(session.chatMessages, [
    {
      sourceType: 'chat',
      messageIndex: 4,
      depth: 1,
      role: 'user',
      name: 'User',
      text: 'first',
    },
    {
      sourceType: 'chat',
      messageIndex: 5,
      depth: 0,
      role: 'assistant',
      name: 'Bot',
      text: 'second',
    },
  ]);
});

test('captureGenerationInput records character card fields with text', () => {
  const store = createSessionStore({
    getCharacterCardFields: () => ({
      persona: 'persona text',
      description: 'description text',
      personality: '',
      charDepthPrompt: 'depth prompt',
      scenario: 'scenario text',
      creatorNotes: 'creator notes',
    }),
  });

  const session = store.captureGenerationInput([], 1000, undefined, 'continue');

  assert.deepEqual(session.fieldSources, [
    { sourceType: 'persona', text: 'persona text' },
    { sourceType: 'characterDescription', text: 'description text' },
    { sourceType: 'characterDepthPrompt', text: 'depth prompt' },
    { sourceType: 'scenario', text: 'scenario text' },
    { sourceType: 'creatorNotes', text: 'creator notes' },
  ]);
});

test('captureGenerationInput records only scan-enabled extension prompts', () => {
  const store = createSessionStore({
    extension_prompts: {
      scan_me: { value: 'scan this', scan: true, depth: 2, role: 1 },
      blank: { value: '   ', scan: true },
      skip_me: { value: 'do not scan', scan: false },
    },
  });

  const session = store.captureGenerationInput([], 1000, undefined, 'swipe');

  assert.deepEqual(session.injectionSources, [
    {
      sourceType: 'injection',
      key: 'scan_me',
      depth: 2,
      role: 1,
      text: 'scan this',
    },
  ]);
});

test('session store exposes active session and consume clears it', () => {
  const store = createSessionStore({});
  const session = store.captureGenerationInput([], 1000, undefined, undefined);

  assert.equal(store.getActiveSession(), session);
  assert.equal(store.consumeActiveSession(), session);
  assert.equal(store.getActiveSession(), null);
});
