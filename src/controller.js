import { createSessionStore } from './session.js';
import { createScanCollector } from './scan-collector.js';
import { createMatcher } from './matcher.js';
import { buildDiagnosticRecord } from './diagnostic-builder.js';
import {
  createTemporaryDiagnosticsStore,
  getChatStorageScope,
  getMessageSignature,
  getSwipeId,
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
  const diagnosticsStore = nativeDeps.diagnosticsStore ?? createTemporaryDiagnosticsStore({
    storage: nativeDeps.localStorage,
    getScopeKey: () => nativeDeps.getDiagnosticsScope?.() ?? getChatStorageScope(nativeDeps.chat ?? []),
  });
  let activated = false;
  let stopObserving = null;
  let settingsPanel = null;

  function getLocale() {
    return nativeDeps.getLocale?.() ?? nativeDeps.locale;
  }

  function refreshSettingsPanel() {
    const stats = diagnosticsStore.getDiagnosticsStats();
    nativeDeps.onStatsRefresh?.(stats);

    if (!documentRef) return;
    settingsPanel?.remove?.();
    settingsPanel = renderSettingsPanel({
      document: documentRef,
      settings,
      stats,
      locale: getLocale(),
      onChange: (key, value) => {
        updateSetting(settings, key, value, nativeDeps.saveSettingsDebounced);
        refreshSettingsPanel();
      },
      onClear: async () => {
        await confirmAndClearDiagnostics({
          confirm: nativeDeps.confirm ?? globalThis.confirm,
          clearDiagnostics: diagnosticsStore.clearDiagnostics,
          locale: getLocale(),
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
      locale: getLocale(),
      hasRecord: ({ messageId, swipeId }) => Boolean(diagnosticsStore.readDiagnosticRecord({
        messageId,
        swipeId: swipeId ?? getSwipeId(nativeDeps.chat?.[messageId]),
        messageSignature: getMessageSignature(nativeDeps.chat?.[messageId]),
      })),
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
    const record = diagnosticsStore.readDiagnosticRecord({
      messageId,
      swipeId: getSwipeId(nativeDeps.chat?.[messageId]),
      messageSignature: getMessageSignature(nativeDeps.chat?.[messageId]),
    });
    openDiagnosticsPanel({
      record,
      messageId,
      document: documentRef,
      locale: getLocale(),
      onJumpToMessage: jumpToMessage,
    });
  }

  async function onAiMessageRendered(messageId) {
    const collected = collector.finish();
    if (collected && settings.enabled && settings.saveDiagnostics) {
      const message = nativeDeps.chat?.[messageId];
      if (!message) {
        refreshButtons();
        refreshSettingsPanel();
        return;
      }

      const swipeId = getSwipeId(message);
      const record = buildDiagnosticRecord({
        collected,
        matcher,
        settings,
        messageId,
        swipeId,
        locale: getLocale(),
      });

      if (settings.includeMatchedNotJoined === false) {
        record.items = record.items.filter(item => item.nativeConfirmation.status === 'joined');
      }

      diagnosticsStore.writeDiagnosticRecord({
        messageId,
        swipeId,
        messageSignature: getMessageSignature(message),
        record,
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
