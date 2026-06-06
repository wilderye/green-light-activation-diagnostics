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
  const message = chat?.[messageId];
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

  for (let messageId = 0; messageId < (chat?.length ?? 0); messageId++) {
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

  for (const message of chat ?? []) {
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
