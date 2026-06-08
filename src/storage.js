import { STORAGE_KEY } from './constants.js';

export const TEMPORARY_STORAGE_KEY = `${STORAGE_KEY}_temporary_records`;
export const TEMPORARY_RECORD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const TEMPORARY_RECORD_LIMIT = 500;

const STORE_VERSION = 1;
const HASH_PREFIX = 'chat_';

export function getSwipeId(message) {
  const swipeId = Number(message?.swipe_id ?? 0);
  return Number.isFinite(swipeId) && swipeId >= 0 ? swipeId : 0;
}

export function getMessageSignature(message) {
  if (!message) return null;

  return {
    sendDate: String(message.send_date ?? ''),
    isUser: Boolean(message.is_user),
    textHash: hashString(String(message.mes ?? '')),
  };
}

function createEmptyData() {
  return {
    version: STORE_VERSION,
    scopes: {},
  };
}

function normalizeData(data) {
  if (!data || typeof data !== 'object' || data.version !== STORE_VERSION) {
    return createEmptyData();
  }

  if (!data.scopes || typeof data.scopes !== 'object') {
    data.scopes = {};
  }

  return data;
}

function getStorage(storage) {
  if (storage) return storage;

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getChatStorageScope(chat = []) {
  const firstMessageIndex = (chat ?? []).findIndex(message => String(message?.mes ?? '').trim());
  const firstMessage = firstMessageIndex >= 0 ? chat[firstMessageIndex] : null;
  const seed = firstMessage
    ? [
      firstMessageIndex,
      firstMessage.send_date ?? '',
      firstMessage.name ?? '',
      firstMessage.is_user ? 'user' : 'assistant',
      String(firstMessage.mes ?? '').slice(0, 512),
    ].join('\u001f')
    : 'empty';

  return `${HASH_PREFIX}${hashString(seed)}`;
}

function coerceKey(value) {
  const number = Number(value ?? 0);
  return String(Number.isFinite(number) && number >= 0 ? number : 0);
}

function normalizeMessageSignature(signature) {
  if (!signature || typeof signature !== 'object') return null;

  return {
    sendDate: String(signature.sendDate ?? ''),
    isUser: Boolean(signature.isUser),
    textHash: String(signature.textHash ?? ''),
  };
}

function signaturesMatch(storedSignature, requestedSignature) {
  const stored = normalizeMessageSignature(storedSignature);
  const requested = normalizeMessageSignature(requestedSignature);
  if (!requested) return true;
  if (!stored) return false;

  return stored.sendDate === requested.sendDate
    && stored.isUser === requested.isUser
    && stored.textHash === requested.textHash;
}

function collectRecords(data, scopeKey = null) {
  const scopeEntries = scopeKey == null
    ? Object.entries(data.scopes ?? {})
    : [[scopeKey, data.scopes?.[scopeKey]]];
  const records = [];

  for (const [currentScopeKey, scope] of scopeEntries) {
    if (!scope?.messages) continue;

    for (const [messageId, messageRecord] of Object.entries(scope.messages)) {
      for (const [swipeId, envelope] of Object.entries(messageRecord?.swipes ?? {})) {
        records.push({
          scopeKey: currentScopeKey,
          messageId,
          swipeId,
          envelope,
          record: envelope?.record,
          updatedAt: Number(envelope?.updatedAt ?? 0),
        });
      }
    }
  }

  return records;
}

function deleteRecord(data, { scopeKey, messageId, swipeId }) {
  const scope = data.scopes?.[scopeKey];
  const messageRecord = scope?.messages?.[messageId];
  if (!messageRecord?.swipes || !(swipeId in messageRecord.swipes)) return false;

  delete messageRecord.swipes[swipeId];

  if (!Object.keys(messageRecord.swipes).length) {
    delete scope.messages[messageId];
  }
  if (!Object.keys(scope.messages ?? {}).length) {
    delete data.scopes[scopeKey];
  }

  return true;
}

function pruneData(data, { now, maxAgeMs, maxRecords }) {
  let changed = false;
  const cutoff = now - maxAgeMs;

  for (const record of collectRecords(data)) {
    if (record.updatedAt < cutoff) {
      changed = deleteRecord(data, record) || changed;
    }
  }

  const records = collectRecords(data).sort((a, b) => a.updatedAt - b.updatedAt);
  const extraCount = records.length - maxRecords;
  if (extraCount > 0) {
    for (const record of records.slice(0, extraCount)) {
      changed = deleteRecord(data, record) || changed;
    }
  }

  return changed;
}

function byteSize(value) {
  const json = JSON.stringify(value ?? null);
  if (typeof Blob === 'function') return new Blob([json]).size;
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(json).length;
  return json.length;
}

export function createTemporaryDiagnosticsStore({
  storage,
  getScopeKey = () => HASH_PREFIX + 'default',
  now = () => Date.now(),
  maxAgeMs = TEMPORARY_RECORD_MAX_AGE_MS,
  maxRecords = TEMPORARY_RECORD_LIMIT,
} = {}) {
  const backend = getStorage(storage);
  let memoryData = createEmptyData();
  let cache = null;
  let useMemory = !backend;

  function loadData() {
    if (cache) return cache;

    if (useMemory) {
      cache = memoryData;
      pruneAndSave(cache);
      return cache;
    }

    try {
      const parsed = JSON.parse(backend.getItem(TEMPORARY_STORAGE_KEY) ?? 'null');
      cache = normalizeData(parsed);
    } catch {
      cache = createEmptyData();
    }

    pruneAndSave(cache);
    return cache;
  }

  function saveData(data) {
    cache = data;

    if (useMemory) {
      memoryData = data;
      return;
    }

    try {
      backend.setItem(TEMPORARY_STORAGE_KEY, JSON.stringify(data));
    } catch {
      useMemory = true;
      memoryData = data;
    }
  }

  function pruneAndSave(data) {
    if (pruneData(data, {
      now: now(),
      maxAgeMs,
      maxRecords,
    })) {
      saveData(data);
    }
  }

  function currentScopeKey() {
    return String(getScopeKey?.() || HASH_PREFIX + 'default');
  }

  function readDiagnosticRecord({ messageId, swipeId = 0, messageSignature } = {}) {
    const data = loadData();
    const scope = data.scopes[currentScopeKey()];
    const envelope = scope?.messages?.[coerceKey(messageId)]?.swipes?.[coerceKey(swipeId)];
    if (!signaturesMatch(envelope?.messageSignature, messageSignature)) return null;
    return envelope?.record ?? null;
  }

  function writeDiagnosticRecord({ messageId, swipeId = 0, record, messageSignature } = {}) {
    if (messageId == null || !record) return false;

    const data = loadData();
    pruneAndSave(data);

    const scopeKey = currentScopeKey();
    const timestamp = now();
    const messageKey = coerceKey(messageId);
    const swipeKey = coerceKey(swipeId);
    const scope = data.scopes[scopeKey] ??= {
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: {},
    };
    const messageRecord = scope.messages[messageKey] ??= {
      updatedAt: timestamp,
      swipes: {},
    };

    scope.updatedAt = timestamp;
    messageRecord.updatedAt = timestamp;
    messageRecord.swipes[swipeKey] = {
      updatedAt: timestamp,
      record,
      messageSignature: normalizeMessageSignature(messageSignature),
    };

    pruneData(data, {
      now: timestamp,
      maxAgeMs,
      maxRecords,
    });
    saveData(data);
    return true;
  }

  function clearDiagnostics() {
    const data = loadData();
    const scopeKey = currentScopeKey();
    const removed = collectRecords(data, scopeKey).length;

    if (data.scopes[scopeKey]) {
      delete data.scopes[scopeKey];
      saveData(data);
    }

    return removed;
  }

  function getDiagnosticsStats() {
    const data = loadData();
    pruneAndSave(data);

    const records = collectRecords(data, currentScopeKey()).map(entry => entry.record);
    const sizes = records.map(byteSize);
    const totalBytes = sizes.reduce((sum, value) => sum + value, 0);

    return {
      recordCount: records.length,
      totalBytes,
      averageBytes: records.length ? Math.round(totalBytes / records.length) : 0,
    };
  }

  return {
    readDiagnosticRecord,
    writeDiagnosticRecord,
    clearDiagnostics,
    getDiagnosticsStats,
    prune: () => pruneAndSave(loadData()),
  };
}
