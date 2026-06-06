# 绿灯激活诊断器 Implementation Plan

> **Execution:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent third-party SillyTavern extension that shows, per AI message swipe, which native green-light World Info entries joined the prompt or matched but were blocked.

**Architecture:** The extension uses SillyTavern native extension hooks only: `manifest.json` `generate_interceptor`, native `eventSource` events, native `chat`/`saveChatConditional` persistence, and DOM integration with `.extraMesButtons`. It separates native session capture, WI scan collection, explanation matching, chat-record storage, settings cleanup, and responsive UI so each piece can be tested without a running Tavern.

**Tech Stack:** Plain ES modules loaded by SillyTavern third-party extensions, native ST imports from `script.js`, `scripts/extensions.js`, `scripts/world-info.js`, CSS using ST theme variables, Node built-in `node:test` for pure unit tests. No Tavern Helper APIs are used.

---

## Native API Policy

This is an independent SillyTavern extension, not a Tavern Helper script.

Use these native surfaces:

- `manifest.json` with `js`, `css`, `generate_interceptor`, and `hooks.activate`.
- `eventSource` and `event_types` from `../../../../script.js` after installation under `public/scripts/extensions/third-party/<repo>/`.
- `chat`, `saveChatConditional`, `syncMesToSwipe`, `getCharacterCardFields`, `extension_prompts`, `saveSettingsDebounced` from native `script.js`.
- `extension_settings` from native `scripts/extensions.js`.
- `parseRegexFromString`, `world_info_logic`, `world_info_position` from native `scripts/world-info.js`.
- Message DOM: `.mes[mesid]`, `swipeid`, `is_user`, `.mes_buttons`, `.extraMesButtons`, `.mes_button`.

Do not use Tavern Helper APIs (`TavernHelper`, message variables, helper worldbook APIs, helper event wrappers). If a future implementation wants one, stop and ask first, with the specific saving in work explained.

## Repository And File Structure

Create this repository outside `st-wilder`:

```text
E:/游戏文档/酒馆/antigravity/green-light-activation-diagnostics/
```

Files to create:

- `manifest.json`: ST extension manifest, display name, loading order, JS/CSS entry, generation interceptor name.
- `index.js`: native import boundary, dependency injection, global interceptor registration, activate hook.
- `style.css`: message button, settings panel, desktop modal/drawer, mobile full-screen panel.
- `README.md`: install/use notes, accuracy boundary, storage cleanup warning.
- `src/constants.js`: storage key, extension id, defaults, label maps.
- `src/settings.js`: default settings, settings load/save, settings panel, record-size stats, cleanup action.
- `src/storage.js`: read/write/clear diagnostics on `message.extra` and `message.swipe_info[swipe_id].extra`.
- `src/session.js`: generation-interceptor session cache and source-bucket capture.
- `src/scan-collector.js`: `WORLDINFO_SCAN_DONE` and `WORLD_INFO_ACTIVATED` collection.
- `src/entry-utils.js`: green-light filter, entry key, native outcome classification.
- `src/matcher.js`: plugin explanation matching using native regex parser and WI logic constants.
- `src/diagnostic-builder.js`: final persisted record builder and summary counts.
- `src/message-button.js`: inject always-visible AI-message action button and click routing.
- `src/panel.js`: responsive diagnostics panel rendering and interactions.
- `tests/*.test.js`: pure tests for storage, session, scan collection, entry classification, matcher, builder, and render model.

Files not to create in `st-wilder`: all plugin source, build output, and tests.

## Test List

Use TDD for pure logic before wiring it into ST:

- Storage reads current swipe record before fallback record.
- Storage writes to `message.extra` and current `swipe_info[swipe_id].extra`, then calls native sync/save dependencies.
- Clearing current chat removes only `green_light_activation_diagnostics_v1` from all messages and swipes.
- Interceptor captures processed `coreChat` without mutation and records `index`, role, depth, text.
- Green-light filter excludes constant entries, disabled entries, entries with no primary key, and non-keyword vector-only entries.
- `WORLDINFO_SCAN_DONE` collector records loops and classifies probability failures as `new.all - new.successful`.
- Final joined entries come only from `WORLD_INFO_ACTIVATED`.
- Matcher handles plaintext, whole-word, case-sensitive override, regex keys via native `parseRegexFromString`, AND ANY, AND ALL, NOT ANY, NOT ALL.
- Builder labels `原生确认` vs `插件解释` separately.
- Builder stores compact snippets, never full prompt/core scan text.
- Panel render model shows no-record state, joined, matched-not-joined, multi-hit hint, and mobile card data.

## Task 1: Scaffold The Standalone Extension

**Files:**
- Create: `package.json`
- Create: `manifest.json`
- Create: `index.js`
- Create: `style.css`
- Create: `README.md`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "green-light-activation-diagnostics",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 2: Create ST manifest**

Create `manifest.json`:

```json
{
  "display_name": "绿灯激活诊断器",
  "loading_order": 50,
  "requires": [],
  "optional": [],
  "generate_interceptor": "greenLightActivationDiagnostics_captureGenerationInput",
  "js": "index.js",
  "css": "style.css",
  "author": "noz",
  "version": "0.1.0",
  "homePage": "https://github.com/noz/green-light-activation-diagnostics",
  "auto_update": true,
  "hooks": {
    "activate": "activateGreenLightActivationDiagnostics"
  }
}
```

- [ ] **Step 3: Create native import boundary**

Create `index.js`:

```js
import {
  chat,
  eventSource,
  event_types,
  extension_prompts,
  getCharacterCardFields,
  saveChatConditional,
  saveSettingsDebounced,
  syncMesToSwipe,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { parseRegexFromString, world_info_logic, world_info_position } from '../../../world-info.js';

const nativeDeps = {
  chat,
  eventSource,
  event_types,
  extension_prompts,
  getCharacterCardFields,
  saveChatConditional,
  saveSettingsDebounced,
  syncMesToSwipe,
  extension_settings,
  parseRegexFromString,
  world_info_logic,
  world_info_position,
};

let controller;

export async function activateGreenLightActivationDiagnostics() {
  const { createExtensionController } = await import('./src/controller.js');
  controller = createExtensionController(nativeDeps);
  controller.activate();
}

globalThis.greenLightActivationDiagnostics_captureGenerationInput = async (coreChat, contextSize, abort, type) => {
  controller?.captureGenerationInput(coreChat, contextSize, abort, type);
};
```

- [ ] **Step 4: Add smoke controller**

Create `src/controller.js`:

```js
export function createExtensionController() {
  return {
    activate() {},
    captureGenerationInput() {},
  };
}
```

- [ ] **Step 5: Add smoke test**

Create `tests/smoke.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionController } from '../src/controller.js';

test('controller exposes activation and interceptor methods', () => {
  const controller = createExtensionController({});
  assert.equal(typeof controller.activate, 'function');
  assert.equal(typeof controller.captureGenerationInput, 'function');
});
```

- [ ] **Step 6: Run test**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json manifest.json index.js style.css README.md src/controller.js tests/smoke.test.js
git commit -m "chore: scaffold green light diagnostics extension"
```

## Task 2: Define Constants, Settings, And Storage

**Files:**
- Create: `src/constants.js`
- Create: `src/storage.js`
- Create: `src/settings.js`
- Create: `tests/storage.test.js`
- Modify: `src/controller.js`

- [ ] **Step 1: Write storage tests**

Test current-swipe preference, fallback read, write, clear, and stats.

Key assertions:

```js
assert.equal(readDiagnosticRecord(message), swipeRecord);
assert.equal(message.extra.green_light_activation_diagnostics_v1, record);
assert.equal(message.swipe_info[1].extra.green_light_activation_diagnostics_v1, record);
assert.equal(stats.recordCount, 2);
```

- [ ] **Step 2: Run failing storage test**

Run: `npm test`

Expected: FAIL because `src/storage.js` does not exist.

- [ ] **Step 3: Implement constants**

Create `src/constants.js`:

```js
export const EXTENSION_ID = 'greenLightActivationDiagnostics';
export const STORAGE_KEY = 'green_light_activation_diagnostics_v1';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  saveDiagnostics: true,
  includeMatchedNotJoined: true,
  includeSnippets: true,
  snippetRadius: 48,
  warnAverageBytes: 20 * 1024,
  warnTotalBytes: 2 * 1024 * 1024,
});
```

- [ ] **Step 4: Implement storage helpers**

Create `src/storage.js`:

```js
import { STORAGE_KEY } from './constants.js';

export function getSwipeId(message) {
  const swipeId = Number(message?.swipe_id ?? 0);
  return Number.isFinite(swipeId) && swipeId >= 0 ? swipeId : 0;
}

export function readDiagnosticRecord(message) {
  const swipeId = getSwipeId(message);
  return message?.swipe_info?.[swipeId]?.extra?.[STORAGE_KEY]
    ?? message?.extra?.[STORAGE_KEY]
    ?? null;
}

export async function writeDiagnosticRecord({ chat, messageId, record, syncMesToSwipe, saveChatConditional }) {
  const message = chat[messageId];
  if (!message) return false;
  const swipeId = getSwipeId(message);
  message.extra ??= {};
  message.extra[STORAGE_KEY] = record;
  if (Array.isArray(message.swipe_info) && message.swipe_info[swipeId]) {
    message.swipe_info[swipeId].extra ??= {};
    message.swipe_info[swipeId].extra[STORAGE_KEY] = record;
  }
  syncMesToSwipe?.(messageId);
  await saveChatConditional?.();
  return true;
}

export async function clearChatDiagnostics({ chat, syncMesToSwipe, saveChatConditional }) {
  let removed = 0;
  for (let messageId = 0; messageId < chat.length; messageId++) {
    const message = chat[messageId];
    if (message?.extra && STORAGE_KEY in message.extra) {
      delete message.extra[STORAGE_KEY];
      removed++;
    }
    if (Array.isArray(message?.swipe_info)) {
      for (const swipeInfo of message.swipe_info) {
        if (swipeInfo?.extra && STORAGE_KEY in swipeInfo.extra) {
          delete swipeInfo.extra[STORAGE_KEY];
          removed++;
        }
      }
    }
    syncMesToSwipe?.(messageId);
  }
  if (removed) await saveChatConditional?.();
  return removed;
}

export function getDiagnosticsStats(chat) {
  const records = [];
  for (const message of chat) {
    if (message?.extra?.[STORAGE_KEY]) records.push(message.extra[STORAGE_KEY]);
    for (const swipeInfo of message?.swipe_info ?? []) {
      if (swipeInfo?.extra?.[STORAGE_KEY]) records.push(swipeInfo.extra[STORAGE_KEY]);
    }
  }
  const sizes = records.map(record => new Blob([JSON.stringify(record)]).size);
  const totalBytes = sizes.reduce((sum, value) => sum + value, 0);
  return {
    recordCount: records.length,
    totalBytes,
    averageBytes: records.length ? Math.round(totalBytes / records.length) : 0,
  };
}
```

- [ ] **Step 5: Implement settings loader**

Create `src/settings.js`:

```js
import { DEFAULT_SETTINGS, EXTENSION_ID } from './constants.js';

export function getSettings(extension_settings) {
  extension_settings[EXTENSION_ID] ??= structuredClone(DEFAULT_SETTINGS);
  extension_settings[EXTENSION_ID] = { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_ID] };
  return extension_settings[EXTENSION_ID];
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/constants.js src/storage.js src/settings.js src/controller.js tests/storage.test.js
git commit -m "feat: add diagnostic storage helpers"
```

## Task 3: Capture Generation Sessions And Scan Sources

**Files:**
- Create: `src/session.js`
- Create: `tests/session.test.js`
- Modify: `src/controller.js`

- [ ] **Step 1: Write session tests**

Test that `captureGenerationInput()` creates a session, copies `coreChat` without mutation, keeps original `index`, computes depth, and captures `getCharacterCardFields()` plus scan-enabled `extension_prompts`.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL because `src/session.js` does not exist.

- [ ] **Step 3: Implement session store**

Create `src/session.js`:

```js
export function createSessionStore({ getCharacterCardFields, extension_prompts }) {
  let activeSession = null;
  let nextId = 1;

  function captureGenerationInput(coreChat, contextSize, abort, type = 'normal') {
    const chatMessages = coreChat.map((message, position) => ({
      sourceType: 'chat',
      messageIndex: message.index,
      depth: coreChat.length - position - 1,
      role: message.is_user ? 'user' : 'assistant',
      name: message.name ?? '',
      text: String(message.mes ?? ''),
    }));

    const fields = getCharacterCardFields?.() ?? {};
    const fieldSources = [
      ['persona', fields.persona],
      ['characterDescription', fields.description],
      ['characterPersonality', fields.personality],
      ['characterDepthPrompt', fields.charDepthPrompt],
      ['scenario', fields.scenario],
      ['creatorNotes', fields.creatorNotes],
    ].filter(([, text]) => String(text ?? '').trim()).map(([sourceType, text]) => ({ sourceType, text: String(text) }));

    const injectionSources = Object.entries(extension_prompts ?? {})
      .filter(([, prompt]) => prompt?.scan && String(prompt.value ?? '').trim())
      .map(([key, prompt]) => ({
        sourceType: 'injection',
        key,
        depth: prompt.depth ?? 0,
        role: prompt.role ?? null,
        text: String(prompt.value),
      }));

    activeSession = {
      id: nextId++,
      generationType: type ?? 'normal',
      contextSize,
      createdAt: new Date().toISOString(),
      chatMessages,
      fieldSources,
      injectionSources,
    };
    return activeSession;
  }

  return {
    captureGenerationInput,
    getActiveSession: () => activeSession,
    consumeActiveSession: () => {
      const session = activeSession;
      activeSession = null;
      return session;
    },
  };
}
```

- [ ] **Step 4: Wire controller to session store**

Modify `src/controller.js` to create a session store and delegate `captureGenerationInput`.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/session.js src/controller.js tests/session.test.js
git commit -m "feat: capture native generation scan sources"
```

## Task 4: Collect Native World Info Scan Results

**Files:**
- Create: `src/scan-collector.js`
- Create: `tests/scan-collector.test.js`
- Modify: `src/controller.js`

- [ ] **Step 1: Write scan collector tests**

Cover ignored events without an active session, loop storage, probability failures as `new.all - new.successful`, budget state, and final joined entries from `WORLD_INFO_ACTIVATED`.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL because `src/scan-collector.js` does not exist.

- [ ] **Step 3: Implement collector**

Create `src/scan-collector.js`:

```js
export function entryKey(entry) {
  return `${entry?.world ?? ''}.${entry?.uid ?? ''}`;
}

export function createScanCollector() {
  let current = null;

  function start(session) {
    current = session ? { session, loops: [], finalActivatedEntries: [] } : null;
  }

  function onScanDone(payload) {
    if (!current) return;
    const all = payload?.new?.all ?? [];
    const successful = payload?.new?.successful ?? [];
    const successfulKeys = new Set(successful.map(entryKey));
    current.loops.push({
      loopCount: payload?.state?.loopCount ?? current.loops.length + 1,
      stateCurrent: payload?.state?.current ?? null,
      stateNext: payload?.state?.next ?? null,
      newAll: all.map(structuredClone),
      newSuccessful: successful.map(structuredClone),
      probabilityFailed: all.filter(entry => !successfulKeys.has(entryKey(entry))).map(structuredClone),
      activatedEntries: Array.from(payload?.activated?.entries?.values?.() ?? payload?.activated?.entries ?? []).map(structuredClone),
      activatedText: String(payload?.activated?.text ?? ''),
      sortedEntries: (payload?.sortedEntries ?? []).map(structuredClone),
      budget: structuredClone(payload?.budget ?? {}),
      recursionDelay: structuredClone(payload?.recursionDelay ?? {}),
    });
  }

  function onActivated(entries) {
    if (!current) return;
    current.finalActivatedEntries = (entries ?? []).map(structuredClone);
  }

  function finish() {
    const result = current;
    current = null;
    return result;
  }

  return { start, onScanDone, onActivated, finish, getCurrent: () => current };
}
```

- [ ] **Step 4: Wire native events in controller**

In `activate()`, register:

```js
eventSource.on(event_types.WORLDINFO_SCAN_DONE, collector.onScanDone);
eventSource.on(event_types.WORLD_INFO_ACTIVATED, collector.onActivated);
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onAiMessageRendered);
```

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/scan-collector.js src/controller.js tests/scan-collector.test.js
git commit -m "feat: collect native world info scan events"
```

## Task 5: Classify Green-Light Entries And Native Outcomes

**Files:**
- Create: `src/entry-utils.js`
- Create: `tests/entry-utils.test.js`

- [ ] **Step 1: Write entry utility tests**

Cover green-light filtering, joined status from final activated keys, probability failure, group loser, and budget-blocked inference.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL because `src/entry-utils.js` does not exist.

- [ ] **Step 3: Implement utilities**

Create `src/entry-utils.js`:

```js
import { entryKey } from './scan-collector.js';

export function isGreenLightEntry(entry) {
  return Boolean(
    entry
    && !entry.disable
    && !entry.constant
    && Array.isArray(entry.key)
    && entry.key.some(key => String(key ?? '').trim())
  );
}

export function getEntryDisplayName(entry) {
  return entry?.comment?.trim?.() || `UID ${entry?.uid ?? '?'}`;
}

export function classifyNativeOutcome(entry, collected) {
  const key = entryKey(entry);
  const finalKeys = new Set((collected.finalActivatedEntries ?? []).map(entryKey));
  if (finalKeys.has(key)) return { status: 'joined', reasonType: 'native_joined' };

  const probabilityFailed = collected.loops?.some(loop => loop.probabilityFailed?.some(item => entryKey(item) === key));
  if (probabilityFailed) return { status: 'matched_not_joined', reasonType: 'probability_failed' };

  const sameGroupWinner = entry.group && (collected.finalActivatedEntries ?? []).some(item => {
    if (entryKey(item) === key) return false;
    return String(item.group ?? '').split(/,\s*/).includes(entry.group);
  });
  if (sameGroupWinner) return { status: 'matched_not_joined', reasonType: 'group_loser' };

  const budgetOverflowed = collected.loops?.some(loop => loop.budget?.overflowed);
  if (budgetOverflowed) return { status: 'matched_not_joined', reasonType: 'budget_blocked' };

  return { status: 'matched_not_joined', reasonType: 'matched_not_joined_unknown' };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/entry-utils.js tests/entry-utils.test.js
git commit -m "feat: classify green light world info outcomes"
```

## Task 6: Implement Explanation Matching

**Files:**
- Create: `src/matcher.js`
- Create: `tests/matcher.test.js`

- [ ] **Step 1: Write matcher tests**

Cover plaintext, case sensitivity, whole-word matching, regex keys, source priority, multiple hits, AND ANY, AND ALL, NOT ANY, and NOT ALL. NOT ANY/NOT ALL must be explained as missing secondary conditions, not fake positive hits.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL because `src/matcher.js` does not exist.

- [ ] **Step 3: Implement source selection**

Create `src/matcher.js` with this source function:

```js
export function getEligibleSourcesForEntry(entry, session, recursionTexts = []) {
  const sources = [...(session.chatMessages ?? [])];
  if (entry.matchPersonaDescription) sources.push(...session.fieldSources.filter(x => x.sourceType === 'persona'));
  if (entry.matchCharacterDescription) sources.push(...session.fieldSources.filter(x => x.sourceType === 'characterDescription'));
  if (entry.matchCharacterPersonality) sources.push(...session.fieldSources.filter(x => x.sourceType === 'characterPersonality'));
  if (entry.matchCharacterDepthPrompt) sources.push(...session.fieldSources.filter(x => x.sourceType === 'characterDepthPrompt'));
  if (entry.matchScenario) sources.push(...session.fieldSources.filter(x => x.sourceType === 'scenario'));
  if (entry.matchCreatorNotes) sources.push(...session.fieldSources.filter(x => x.sourceType === 'creatorNotes'));
  sources.push(...(session.injectionSources ?? []));
  sources.push(...recursionTexts.map((text, index) => ({ sourceType: 'recursion', index, text })));
  return sources.filter(source => String(source.text ?? '').trim());
}
```

- [ ] **Step 4: Implement key matching**

`createMatcher({ parseRegexFromString, world_info_logic })` should expose `explainEntry(entry, session, recursionTexts, settings)`.

Implementation rules:

- Use `parseRegexFromString(key)` for regex keys.
- For plaintext, apply case sensitivity from `entry.caseSensitive` if present; otherwise default false.
- For whole-word, use ST's boundary idea: single word uses `(?:^|\W)(key)(?:$|\W)`, multi-word uses includes.
- Return `primaryMatches`, `secondaryMatches`, `sourceType`, `sourceMessageIndex`, `snippet`, `matchCount`, `reasonType`, and `confidence: 'plugin_explanation'`.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/matcher.js tests/matcher.test.js
git commit -m "feat: explain green light keyword matches"
```

## Task 7: Build Compact Diagnostic Records

**Files:**
- Create: `src/diagnostic-builder.js`
- Create: `tests/diagnostic-builder.test.js`
- Modify: `src/controller.js`

- [ ] **Step 1: Write builder tests**

Cover summary counts, summary wording with colon hierarchy, blue/constant exclusion, compact snippets, and separate `nativeConfirmation` / `pluginExplanation` fields.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL because builder does not exist.

- [ ] **Step 3: Implement record builder**

Create `src/diagnostic-builder.js`:

```js
import { SCHEMA_VERSION } from './constants.js';
import { entryKey } from './scan-collector.js';
import { classifyNativeOutcome, getEntryDisplayName, isGreenLightEntry } from './entry-utils.js';

export function buildDiagnosticRecord({ collected, matcher, settings, messageId, swipeId }) {
  const session = collected.session;
  const seen = new Map();
  for (const loop of collected.loops ?? []) {
    for (const entry of [...(loop.newAll ?? []), ...(loop.activatedEntries ?? [])]) {
      if (isGreenLightEntry(entry)) seen.set(entryKey(entry), entry);
    }
  }
  for (const entry of collected.finalActivatedEntries ?? []) {
    if (isGreenLightEntry(entry)) seen.set(entryKey(entry), entry);
  }

  const recursionTexts = (collected.loops ?? []).map(loop => loop.activatedText).filter(Boolean);
  const items = [...seen.values()].map(entry => {
    const nativeConfirmation = classifyNativeOutcome(entry, collected);
    const pluginExplanation = matcher.explainEntry(entry, session, recursionTexts, settings);
    return {
      entryKey: entryKey(entry),
      world: entry.world ?? '',
      uid: entry.uid,
      name: getEntryDisplayName(entry),
      nativeConfirmation,
      pluginExplanation,
      position: entry.position,
      depth: entry.depth ?? null,
      order: entry.order ?? null,
      probability: entry.probability ?? null,
      group: entry.group ?? '',
      sticky: entry.sticky ?? null,
      cooldown: entry.cooldown ?? null,
      delay: entry.delay ?? null,
    };
  });

  const joined = items.filter(item => item.nativeConfirmation.status === 'joined').length;
  const matchedNotJoined = items.filter(item => item.nativeConfirmation.status === 'matched_not_joined').length;
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    messageId,
    swipeId,
    generationType: session.generationType,
    summary: {
      joined,
      matchedNotJoined,
      keywordTriggered: items.filter(item => item.pluginExplanation.reasonType === 'keyword').length,
      recursion: items.filter(item => item.pluginExplanation.sourceType === 'recursion').length,
      sticky: items.filter(item => item.nativeConfirmation.reasonType === 'sticky').length,
      nonChatSource: items.filter(item => !['chat', 'recursion'].includes(item.pluginExplanation.sourceType)).length,
    },
    items,
  };
}
```

- [ ] **Step 4: Wire finalization on AI message rendered**

When `CHARACTER_MESSAGE_RENDERED` fires, controller should finish collector, build record, write current-swipe record, and re-run button injection for that rendered message.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/diagnostic-builder.js src/controller.js tests/diagnostic-builder.test.js
git commit -m "feat: persist compact green light diagnostics"
```

## Task 8: Add Message Action Button

**Files:**
- Create: `src/message-button.js`
- Create: `tests/message-button.test.js`
- Modify: `src/controller.js`
- Modify: `style.css`

- [ ] **Step 1: Write button tests**

Verify user messages are skipped, AI messages get exactly one `.green-light-diagnostics-button`, button is inside `.extraMesButtons`, and click callback receives `messageId` and `swipeId`.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL because `src/message-button.js` does not exist.

- [ ] **Step 3: Implement button injection**

Create `src/message-button.js`:

```js
export function injectMessageButtons({ root = document, onClick }) {
  const messages = root.querySelectorAll('#chat .mes[mesid][is_user="false"], .mes[mesid][is_user="false"]');
  for (const message of messages) {
    const container = message.querySelector('.extraMesButtons');
    if (!container || container.querySelector('.green-light-diagnostics-button')) continue;
    const button = document.createElement('div');
    button.className = 'mes_button green-light-diagnostics-button fa-solid fa-traffic-light';
    button.title = '绿灯激活诊断';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.({
        messageId: Number(message.getAttribute('mesid')),
        swipeId: Number(message.getAttribute('swipeid') ?? 0),
      });
    });
    container.prepend(button);
  }
}

export function observeMessages({ onMutation }) {
  const target = document.querySelector('#chat');
  if (!target) return () => {};
  const observer = new MutationObserver(() => onMutation?.());
  observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['is_user', 'swipeid'] });
  return () => observer.disconnect();
}
```

- [ ] **Step 4: Add CSS**

Append to `style.css`:

```css
.green-light-diagnostics-button[data-has-record="true"] {
  opacity: 0.85;
}

.green-light-diagnostics-button[data-has-record="false"] {
  opacity: 0.35;
}
```

- [ ] **Step 5: Wire controller**

Call `injectMessageButtons()` on activation, `CHARACTER_MESSAGE_RENDERED`, `MESSAGE_SWIPED`, and MutationObserver callback.

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/message-button.js src/controller.js style.css tests/message-button.test.js
git commit -m "feat: add green light diagnostics message button"
```

## Task 9: Build Responsive Diagnostics Panel

**Files:**
- Create: `src/panel.js`
- Create: `tests/panel.test.js`
- Modify: `style.css`
- Modify: `src/controller.js`

- [ ] **Step 1: Write panel tests**

Cover no-record state, joined/matched/not-chat filters, desktop list/detail model, mobile expandable cards, and safe text rendering.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL because `src/panel.js` does not exist.

- [ ] **Step 3: Implement panel**

Create `src/panel.js` with `createPanelModel(record, { messageId })` and `openDiagnosticsPanel({ record, messageId, onJumpToMessage })`. Use `textContent` for worldbook text, keywords, and snippets.

- [ ] **Step 4: Add desktop and mobile CSS**

Add CSS:

```css
.green-light-diagnostics-panel {
  position: fixed;
  inset: 5dvh max(16px, 8vw);
  z-index: 4000;
  display: grid;
  grid-template-rows: auto 1fr;
  background: var(--SmartThemeBlurTintColor);
  color: var(--SmartThemeBodyColor);
  border: 1px solid var(--SmartThemeBorderColor);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgb(0 0 0 / 35%);
  overflow: hidden;
}

.green-light-diagnostics-body {
  display: grid;
  grid-template-columns: minmax(240px, 38%) minmax(0, 1fr);
  min-height: 0;
}

@media (max-width: 600px) {
  .green-light-diagnostics-panel {
    inset: env(safe-area-inset-top) 0 0 0;
    width: 100dvw;
    height: calc(100dvh - env(safe-area-inset-top));
    border-radius: 0;
  }

  .green-light-diagnostics-body {
    display: block;
    overflow-y: auto;
  }
}
```

- [ ] **Step 5: Wire button click**

Controller reads `readDiagnosticRecord(chat[messageId])` and opens panel. No-record state opens the same panel shell.

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/panel.js src/controller.js style.css tests/panel.test.js
git commit -m "feat: render responsive diagnostics panel"
```

## Task 10: Add Settings Panel And Cleanup

**Files:**
- Modify: `src/settings.js`
- Modify: `src/controller.js`
- Modify: `style.css`
- Create: `tests/settings.test.js`

- [ ] **Step 1: Write settings tests**

Cover defaults, setting toggles, stats, cleanup confirmation, and size warnings over 20KB average or 2MB total.

- [ ] **Step 2: Run failing test**

Run: `npm test`

Expected: FAIL for missing settings UI exports.

- [ ] **Step 3: Implement settings panel**

Append settings DOM to `#extensions_settings2` or `#extensions_settings` if the second column is missing:

- title: `绿灯激活诊断器`
- toggles: save diagnostics, include matched-not-joined, include snippets
- number input: snippet radius
- stats block
- button: `清除当前聊天诊断记录`

Use native browser `confirm()` or ST Popup only if the panel already imports it. Do not use Tavern Helper.

- [ ] **Step 4: Wire stats refresh**

Refresh stats on activation, chat change, record write, and cleanup.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/settings.js src/controller.js style.css tests/settings.test.js
git commit -m "feat: add diagnostics settings and cleanup"
```

## Task 11: End-To-End Native Wiring

**Files:**
- Modify: `src/controller.js`
- Modify: `README.md`
- Create: `tests/controller.test.js`

- [ ] **Step 1: Write controller integration test**

Test an in-memory flow:

1. capture generation input;
2. receive scan-done payload;
3. receive activated entries;
4. receive AI message rendered;
5. record is written to current swipe;
6. settings stats refresh callback is called.

- [ ] **Step 2: Run failing integration test**

Run: `npm test`

Expected: FAIL until controller wires all modules.

- [ ] **Step 3: Implement full controller**

`createExtensionController(nativeDeps)` should initialize settings, session store, collector, matcher, storage, buttons, panel, and event listeners. It should keep unregister callbacks for MutationObserver and avoid duplicate activation.

- [ ] **Step 4: Update README**

Add Git install instructions, accuracy notes, storage location, cleanup warning, and mobile support note.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/controller.js README.md tests/controller.test.js
git commit -m "feat: wire native diagnostics flow"
```

## Task 12: Manual Verification In SillyTavern

**Files:**
- Modify only if manual testing finds issues.

- [ ] **Step 1: Install locally as third-party extension**

Copy or symlink the repo into:

```text
SillyTavern/public/scripts/extensions/third-party/green-light-activation-diagnostics
```

or install by Git URL after publishing the repo.

- [ ] **Step 2: Verify button rules**

Expected:

- AI messages show traffic-light button in the three-dot actions.
- User messages do not show it.
- No-record AI message opens panel saying `本条消息没有绿灯诊断记录`.

- [ ] **Step 3: Verify green-light scenarios**

Use a test worldbook with primary keyword, primary + secondary AND ANY, AND ALL, NOT ANY, NOT ALL, probability 0, group competition, low budget, sticky/cooldown/delay, persona/character-description source.

Expected:

- Final joined entries match ST native activation event.
- Matched-not-joined appears by default.
- UI distinguishes `原生确认` and `插件解释`.
- Blue/constant/no-key entries are absent.

- [ ] **Step 4: Verify persistence and swipe isolation**

Refresh browser and switch between multiple swipes.

Expected: same-swipe record persists, different swipes can show different records.

- [ ] **Step 5: Verify cleanup**

Use `清除当前聊天诊断记录`.

Expected: records disappear; buttons remain; no-record message is shown.

- [ ] **Step 6: Verify mobile widths**

Use browser device widths 360px, 390px, 430px.

Expected: no horizontal scrolling, expandable cards work, long names/keywords wrap, snippets do not overlap later content.

- [ ] **Step 7: Run tests and commit fixes**

Run:

```bash
npm test
```

Then commit any fixes:

```bash
git add .
git commit -m "fix: polish diagnostics manual verification issues"
```

## Known Boundaries

- The extension does not patch `world-info.js`, so native per-key match traces are unavailable.
- `WORLD_INFO_ACTIVATED` is the authority for entries actually added to prompt.
- Match source, exact keyword, and snippet are plugin explanations based on native scan inputs.
- Probability failure is strongly detectable from `new.all - new.successful` in `WORLDINFO_SCAN_DONE`.
- Some blockers, especially group/budget/timed-effect interactions, may require inferred labels from scan loop state. UI should show these as explanations, not native trace.
- NOT ANY and NOT ALL must never be displayed as if a missing secondary key was a positive text hit.

## Self-Review

Spec coverage:

- Independent ST extension: covered by repo structure, manifest, native imports.
- No Tavern Helper APIs: covered by Native API Policy.
- AI message three-dot button only: Task 8.
- Always clickable no-record behavior: Task 9.
- Native actual-joined result: Tasks 4 and 7.
- Plugin explanation matching: Task 6.
- Persistent per-swipe chat storage: Task 2 and Task 7.
- Settings cleanup and size warning: Task 10.
- Matched-not-joined default visibility: Task 9.
- Mobile-specific UI: Task 9 and Task 12.
- Blue/constant/no-key exclusion: Task 5 and Task 12.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified future handlers remain in the plan.
- Every native event listener invoked by the design is registered in Task 4 or Task 11.
- `generate_interceptor` global function is registered in Task 1.

Type consistency:

- Storage key is consistently `green_light_activation_diagnostics_v1`.
- Extension settings key is consistently `greenLightActivationDiagnostics`.
- Record fields consistently use `nativeConfirmation` and `pluginExplanation`.
