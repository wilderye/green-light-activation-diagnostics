export function entryKey(entry) {
  return `${entry?.world ?? ''}.${entry?.uid ?? ''}`;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function cloneEntries(entries) {
  return Array.from(entries ?? []).map(clone);
}

function collectTimedEffectEntries(timedEffects, entries) {
  const result = {
    sticky: [],
    cooldown: [],
    delay: [],
  };

  if (!timedEffects || typeof timedEffects.isEffectActive !== 'function') {
    return result;
  }

  for (const entry of entries ?? []) {
    for (const type of Object.keys(result)) {
      try {
        if (timedEffects.isEffectActive(type, entry)) {
          result[type].push(entry);
        }
      } catch {
        // SillyTavern's timed effect manager is an internal object; ignore shape changes.
      }
    }
  }

  return result;
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
    const sortedEntries = payload?.sortedEntries ?? [];
    const successfulKeys = new Set(successful.map(entryKey));
    const activatedEntries = payload?.activated?.entries instanceof Map
      ? payload.activated.entries.values()
      : payload?.activated?.entries;
    const timedEffectEntries = collectTimedEffectEntries(payload?.timedEffects, sortedEntries);

    current.loops.push({
      loopCount: payload?.state?.loopCount ?? current.loops.length + 1,
      stateCurrent: clone(payload?.state?.current ?? null),
      stateNext: clone(payload?.state?.next ?? null),
      newAll: cloneEntries(all),
      newSuccessful: cloneEntries(successful),
      probabilityFailed: cloneEntries(all.filter(entry => !successfulKeys.has(entryKey(entry)))),
      activatedEntries: cloneEntries(activatedEntries),
      activatedText: String(payload?.activated?.text ?? ''),
      sortedEntries: cloneEntries(sortedEntries),
      budget: clone(payload?.budget ?? {}),
      recursionDelay: clone(payload?.recursionDelay ?? {}),
      timedEffectEntries: {
        sticky: cloneEntries(timedEffectEntries.sticky),
        cooldown: cloneEntries(timedEffectEntries.cooldown),
        delay: cloneEntries(timedEffectEntries.delay),
      },
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
