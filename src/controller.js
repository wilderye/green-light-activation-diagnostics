import { createSessionStore } from './session.js';
import { createScanCollector } from './scan-collector.js';
import { createMatcher } from './matcher.js';
import { buildDiagnosticRecord } from './diagnostic-builder.js';
import {
  clearChatDiagnostics,
  getDiagnosticsStats,
  getSwipeId,
  readDiagnosticRecord,
  writeDiagnosticRecord,
} from './storage.js';
import {
  confirmAndClearDiagnostics,
  getSettings,
  renderSettingsPanel,
  updateSetting,
} from './settings.js';
import { injectMessageButtons, observeMessages } from './message-button.js';
import { openDiagnosticsPanel } from './panel.js';

export function createExtensionController(nativeDeps = {}) {
  const sessions = createSessionStore(nativeDeps);
  const collector = createScanCollector();
  const matcher = createMatcher(nativeDeps);
  const documentRef = nativeDeps.document ?? globalThis.document;
  const settingsStore = nativeDeps.extension_settings ?? {};
  const settings = getSettings(settingsStore);
  let activated = false;
  let stopObserving = null;
  let settingsPanel = null;

  function refreshSettingsPanel() {
    const stats = getDiagnosticsStats(nativeDeps.chat ?? []);
    nativeDeps.onStatsRefresh?.(stats);

    if (!documentRef) return;
    settingsPanel?.remove?.();
    settingsPanel = renderSettingsPanel({
      document: documentRef,
      settings,
      stats,
      onChange: (key, value) => {
        updateSetting(settings, key, value, nativeDeps.saveSettingsDebounced);
        refreshSettingsPanel();
      },
      onClear: async () => {
        await confirmAndClearDiagnostics({
          confirm: nativeDeps.confirm ?? globalThis.confirm,
          clearChatDiagnostics,
          chat: nativeDeps.chat ?? [],
          syncMesToSwipe: nativeDeps.syncMesToSwipe,
          saveChatConditional: nativeDeps.saveChatConditional,
        });
        refreshButtons();
        refreshSettingsPanel();
      },
    });
  }

  function refreshButtons(root = documentRef) {
    if (!root) return;
    injectMessageButtons({
      root,
      hasRecord: ({ messageId }) => Boolean(readDiagnosticRecord(nativeDeps.chat?.[messageId])),
      onClick: ({ messageId }) => {
        openDiagnosticsForMessage(messageId);
      },
    });
  }

  function jumpToMessage(messageId) {
    const target = documentRef?.querySelector?.(`.mes[mesid="${messageId}"]`);
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  function openDiagnosticsForMessage(messageId) {
    const record = readDiagnosticRecord(nativeDeps.chat?.[messageId]);
    openDiagnosticsPanel({
      record,
      messageId,
      document: documentRef,
      onJumpToMessage: jumpToMessage,
    });
  }

  async function onAiMessageRendered(messageId) {
    const collected = collector.finish();
    if (collected && settings.enabled && settings.saveDiagnostics) {
      const message = nativeDeps.chat?.[messageId];
      const swipeId = getSwipeId(message);
      const record = buildDiagnosticRecord({
        collected,
        matcher,
        settings,
        messageId,
        swipeId,
      });

      if (settings.includeMatchedNotJoined === false) {
        record.items = record.items.filter(item => item.nativeConfirmation.status === 'joined');
      }

      await writeDiagnosticRecord({
        chat: nativeDeps.chat ?? [],
        messageId,
        record,
        syncMesToSwipe: nativeDeps.syncMesToSwipe,
        saveChatConditional: nativeDeps.saveChatConditional,
      });
    }

    refreshButtons();
    refreshSettingsPanel();
  }

  return {
    activate() {
      if (activated) return;
      activated = true;

      nativeDeps.eventSource?.on?.(nativeDeps.event_types?.WORLDINFO_SCAN_DONE, collector.onScanDone);
      nativeDeps.eventSource?.on?.(nativeDeps.event_types?.WORLD_INFO_ACTIVATED, collector.onActivated);
      nativeDeps.eventSource?.on?.(nativeDeps.event_types?.CHARACTER_MESSAGE_RENDERED, onAiMessageRendered);
      nativeDeps.eventSource?.on?.(nativeDeps.event_types?.MESSAGE_SWIPED, () => refreshButtons());

      refreshButtons();
      refreshSettingsPanel();
      stopObserving = documentRef ? observeMessages({ root: documentRef, onMutation: () => refreshButtons() }) : null;
    },
    captureGenerationInput(coreChat, contextSize, abort, type) {
      if (!settings.enabled) return null;
      const session = sessions.captureGenerationInput(coreChat, contextSize, abort, type);
      collector.start(session);
      return session;
    },
    getActiveSession: sessions.getActiveSession,
    openDiagnosticsForMessage,
    destroy() {
      stopObserving?.();
      stopObserving = null;
      settingsPanel?.remove?.();
    },
  };
}
