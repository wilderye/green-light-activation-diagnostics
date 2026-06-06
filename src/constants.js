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
