export function entryKey(entry) {
  return `${entry?.world ?? ''}.${entry?.uid ?? ''}`;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function cloneEntries(entries) {
  return Array.from(entries ?? []).map(clone);
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
    const activatedEntries = payload?.activated?.entries instanceof Map
      ? payload.activated.entries.values()
      : payload?.activated?.entries;

    current.loops.push({
      loopCount: payload?.state?.loopCount ?? current.loops.length + 1,
      stateCurrent: clone(payload?.state?.current ?? null),
      stateNext: clone(payload?.state?.next ?? null),
      newAll: cloneEntries(all),
      newSuccessful: cloneEntries(successful),
      probabilityFailed: cloneEntries(all.filter(entry => !successfulKeys.has(entryKey(entry)))),
      activatedEntries: cloneEntries(activatedEntries),
      activatedText: String(payload?.activated?.text ?? ''),
      sortedEntries: cloneEntries(payload?.sortedEntries),
      budget: clone(payload?.budget ?? {}),
      recursionDelay: clone(payload?.recursionDelay ?? {}),
      timedEffects: clone(payload?.timedEffects ?? {}),
    });
  }

  function onActivated(entries) {
    if (!current) return;
    current.finalActivatedEntries = cloneEntries(entries);
  }

  function finish() {
    const result = current;
    current = null;
    return result;
  }

  return {
    start,
    onScanDone,
    onActivated,
    finish,
    getCurrent: () => current,
  };
}
