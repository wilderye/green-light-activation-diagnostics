import { DEFAULT_SETTINGS, EXTENSION_ID } from './constants.js';
import { getI18n } from './i18n.js';
import { TEMPORARY_RECORD_LIMIT, TEMPORARY_RECORD_MAX_AGE_MS } from './storage.js';

const TEMPORARY_RECORD_MAX_AGE_DAYS = Math.round(TEMPORARY_RECORD_MAX_AGE_MS / 24 / 60 / 60 / 1000);

export function getSettings(extensionSettings) {
  extensionSettings[EXTENSION_ID] ??= { ...DEFAULT_SETTINGS };
  extensionSettings[EXTENSION_ID] = {
    ...DEFAULT_SETTINGS,
    ...extensionSettings[EXTENSION_ID],
  };
  return extensionSettings[EXTENSION_ID];
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function updateSetting(settings, key, value, saveSettingsDebounced) {
  settings[key] = value;
  saveSettingsDebounced?.();
  return settings;
}

export function createSettingsModel(_settings, stats = {}, { locale } = {}) {
  const i18n = getI18n(locale).settings;
  const recordCount = stats.recordCount ?? 0;
  const totalBytes = stats.totalBytes ?? 0;
  const averageBytes = stats.averageBytes ?? 0;

  return {
    title: i18n.title,
    storageNotice: i18n.storageNotice({
      days: TEMPORARY_RECORD_MAX_AGE_DAYS,
      limit: TEMPORARY_RECORD_LIMIT,
    }),
    recordCount,
    totalBytes,
    averageBytes,
    recordCountLabel: i18n.recordCountLabel(recordCount),
    totalBytesLabel: formatBytes(totalBytes),
    averageBytesLabel: formatBytes(averageBytes),
  };
}

export async function confirmAndClearDiagnostics({
  confirm = globalThis.confirm,
  clearDiagnostics,
  locale,
} = {}) {
  const accepted = confirm?.(getI18n(locale).settings.clearConfirm);
  if (!accepted) return 0;
  return await clearDiagnostics?.() ?? 0;
}

function element(document, tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function appendCheckbox({ document, panel, label, settings, key, onChange }) {
  const row = element(document, 'label', 'checkbox_label');
  const input = element(document, 'input');
  input.type = 'checkbox';
  input.checked = Boolean(settings[key]);
  input.addEventListener('change', () => onChange?.(key, input.checked));
  row.append(input, element(document, 'span', '', label));
  panel.append(row);
}

export function renderSettingsPanel({
  document = globalThis.document,
  settings,
  stats,
  onChange,
  onClear,
  locale,
} = {}) {
  const container = document.querySelector?.('#extensions_settings2')
    ?? document.querySelector?.('#extensions_settings');
  if (!container) return null;

  const i18n = getI18n(locale).settings;
  const model = createSettingsModel(settings, stats, { locale });
  
  const wrapper = element(document, 'div', 'inline-drawer');
  
  const header = element(document, 'div', 'inline-drawer-toggle inline-drawer-header');
  header.append(
    element(document, 'b', '', model.title),
    element(document, 'div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down')
  );

  const panel = element(document, 'div', 'inline-drawer-content');
  const innerSettings = element(document, 'div', 'green-light-diagnostics-settings');

  appendCheckbox({ document, panel: innerSettings, label: i18n.enableDiagnostics, settings, key: 'saveDiagnostics', onChange });
  appendCheckbox({ document, panel: innerSettings, label: i18n.includeBlocked, settings, key: 'includeMatchedNotJoined', onChange });
  appendCheckbox({ document, panel: innerSettings, label: i18n.includeSnippets, settings, key: 'includeSnippets', onChange });

  const snippetRow = element(document, 'label', 'green-light-diagnostics-setting-row');
  const snippetInput = element(document, 'input', 'text_pole');
  snippetInput.type = 'number';
  snippetInput.min = '10';
  snippetInput.max = '500';
  snippetInput.value = String(settings.snippetRadius);
  snippetInput.addEventListener('change', () => onChange?.('snippetRadius', Number(snippetInput.value)));
  snippetRow.append(element(document, 'span', '', i18n.snippetLengthLabel), snippetInput);
  innerSettings.append(snippetRow);

  innerSettings.append(element(document, 'hr'));

  innerSettings.append(element(document, 'div', 'green-light-diagnostics-settings-note', model.storageNotice));

  const statsBlock = element(document, 'div', 'green-light-diagnostics-settings-stats');
  statsBlock.append(
    element(document, 'div', '', i18n.temporaryRecords(model.recordCountLabel)),
    element(document, 'div', '', i18n.storageUsed(model.totalBytesLabel)),
    element(document, 'div', '', i18n.averageRecord(model.averageBytesLabel))
  );
  innerSettings.append(statsBlock);

  const clearButton = element(document, 'div', 'menu_button', i18n.clearButton);
  clearButton.style.marginTop = '10px';
  clearButton.style.width = 'fit-content';
  clearButton.style.padding = '0 15px';
  clearButton.addEventListener('click', () => onClear?.());
  innerSettings.append(clearButton);

  panel.append(innerSettings);
  wrapper.append(header, panel);

  container.appendChild(wrapper);
  return wrapper;
}
