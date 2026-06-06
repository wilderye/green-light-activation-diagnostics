import { DEFAULT_SETTINGS, EXTENSION_ID } from './constants.js';

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

export function createSettingsModel(settings, stats = {}) {
  const recordCount = stats.recordCount ?? 0;
  const totalBytes = stats.totalBytes ?? 0;
  const averageBytes = stats.averageBytes ?? 0;

  return {
    title: '绿灯激活诊断器',
    description: '查看 AI 回复生成前原生世界书绿灯条目的激活诊断。',
    recordCount,
    totalBytes,
    averageBytes,
    recordCountLabel: `${recordCount} 条记录`,
    totalBytesLabel: formatBytes(totalBytes),
    averageBytesLabel: formatBytes(averageBytes),
    totalSizeWarning: totalBytes > settings.warnTotalBytes,
    averageSizeWarning: averageBytes > settings.warnAverageBytes,
  };
}

export async function confirmAndClearDiagnostics({
  confirm = globalThis.confirm,
  clearChatDiagnostics,
  chat,
  syncMesToSwipe,
  saveChatConditional,
} = {}) {
  const accepted = confirm?.('清除当前聊天诊断记录？此操作不会删除聊天内容。');
  if (!accepted) return 0;
  return await clearChatDiagnostics?.({ chat, syncMesToSwipe, saveChatConditional }) ?? 0;
}

function element(document, tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function appendCheckbox({ document, panel, label, settings, key, onChange }) {
  const row = element(document, 'label', 'green-light-diagnostics-setting-row');
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
} = {}) {
  const container = document.querySelector?.('#extensions_settings2')
    ?? document.querySelector?.('#extensions_settings');
  if (!container) return null;

  const model = createSettingsModel(settings, stats);
  const panel = element(document, 'section', 'green-light-diagnostics-settings');
  panel.append(
    element(document, 'h3', '', model.title),
    element(document, 'p', 'green-light-diagnostics-settings-description', model.description),
  );

  appendCheckbox({ document, panel, label: '保存诊断记录', settings, key: 'saveDiagnostics', onChange });
  appendCheckbox({ document, panel, label: '记录命中未加入', settings, key: 'includeMatchedNotJoined', onChange });
  appendCheckbox({ document, panel, label: '保存短片段', settings, key: 'includeSnippets', onChange });

  const snippetRow = element(document, 'label', 'green-light-diagnostics-setting-row');
  const snippetInput = element(document, 'input');
  snippetInput.type = 'number';
  snippetInput.value = String(settings.snippetRadius);
  snippetInput.addEventListener('change', () => onChange?.('snippetRadius', Number(snippetInput.value)));
  snippetRow.append(snippetInput, element(document, 'span', '', '短片段半径'));
  panel.append(snippetRow);

  const statsBlock = element(document, 'div', 'green-light-diagnostics-settings-stats');
  statsBlock.append(
    element(document, 'div', '', `当前聊天：${model.recordCountLabel}`),
    element(document, 'div', '', `总大小：${model.totalBytesLabel}`),
    element(document, 'div', '', `平均：${model.averageBytesLabel}`),
  );
  if (model.totalSizeWarning || model.averageSizeWarning) {
    statsBlock.append(element(document, 'div', 'green-light-diagnostics-settings-warning', '诊断记录体积偏大，建议清理。'));
  }
  panel.append(statsBlock);

  const clearButton = element(document, 'button', 'green-light-diagnostics-clear', '清除当前聊天诊断记录');
  clearButton.addEventListener('click', () => onClear?.());
  panel.append(clearButton);

  container.appendChild(panel);
  return panel;
}
