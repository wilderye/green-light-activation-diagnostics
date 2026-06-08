const REQUIRED_EVENT_TYPES = [
  'WORLDINFO_SCAN_DONE',
  'WORLD_INFO_ACTIVATED',
  'CHARACTER_MESSAGE_RENDERED',
];

const LOG_PREFIX = '[green-light-activation-diagnostics]';

export function getMissingFullDiagnosticsCapabilities(nativeDeps = {}) {
  const missing = [];

  if (typeof nativeDeps.eventSource?.on !== 'function') {
    missing.push('eventSource.on');
  }

  for (const eventType of REQUIRED_EVENT_TYPES) {
    if (!nativeDeps.event_types?.[eventType]) {
      missing.push(`event_types.${eventType}`);
    }
  }

  return missing;
}

export function hasFullDiagnosticsSupport(nativeDeps = {}) {
  return getMissingFullDiagnosticsCapabilities(nativeDeps).length === 0;
}

export function createActivationRuntime({
  nativeDeps = {},
  createController,
  logger = console,
  schedule = callback => globalThis.setTimeout(callback, 0),
} = {}) {
  let controller = null;
  let activationPromise = null;
  let hookActivated = false;
  let warnedMissingSupport = false;

  function warnMissingSupport(missing) {
    if (warnedMissingSupport) return;
    warnedMissingSupport = true;
    logger?.warn?.(
      `${LOG_PREFIX} full diagnostics require SillyTavern scan events; activation skipped. Missing: ${missing.join(', ')}`,
    );
  }

  async function ensureActivated() {
    if (controller) return controller;
    if (activationPromise) return activationPromise;

    const missing = getMissingFullDiagnosticsCapabilities(nativeDeps);
    if (missing.length) {
      warnMissingSupport(missing);
      return null;
    }

    activationPromise = (async () => {
      if (typeof createController !== 'function') {
        throw new TypeError('createController must be a function');
      }

      const nextController = await createController(nativeDeps);
      nextController?.activate?.();
      controller = nextController;
      return controller;
    })().catch(error => {
      activationPromise = null;
      controller = null;
      throw error;
    });

    return activationPromise;
  }

  function activateFromHook() {
    hookActivated = true;
    return ensureActivated();
  }

  async function captureGenerationInput(...args) {
    const activeController = await ensureActivated();
    return activeController?.captureGenerationInput?.(...args) ?? null;
  }

  function startLegacyFallback() {
    schedule(() => {
      if (hookActivated) return null;
      return ensureActivated().catch(error => {
        logger?.error?.(`${LOG_PREFIX} failed to activate legacy extension fallback`, error);
        return null;
      });
    });
  }

  return {
    activateFromHook,
    captureGenerationInput,
    ensureActivated,
    getController: () => controller,
    hasHookActivated: () => hookActivated,
    startLegacyFallback,
  };
}
