const FILTERS = Object.freeze([
  { id: 'all', label: '全部' },
  { id: 'joined', label: '已加入' },
  { id: 'matched_not_joined', label: '命中未加入' },
  { id: 'non_chat_source', label: '非聊天来源' },
]);

const STATUS_LABELS = Object.freeze({
  joined: '已加入',
  matched_not_joined: '命中未加入',
});

const REASON_LABELS = Object.freeze({
  native_joined: '原生确认已加入',
  probability_failed: '命中但概率失败',
  group_loser: '命中但分组落选',
  budget_blocked: '命中但预算挡下',
  matched_not_joined_unknown: '命中未加入',
});

function getViewportWidth(viewportWidth) {
  if (Number.isFinite(Number(viewportWidth))) return Number(viewportWidth);
  return globalThis.window?.innerWidth ?? 800;
}

function getPrimaryKey(item) {
  return item.pluginExplanation?.primaryMatches?.[0]?.key ?? '';
}

function getReasonText(item) {
  const nativeReason = item.nativeConfirmation?.reasonType;
  if (nativeReason && nativeReason !== 'native_joined') {
    return REASON_LABELS[nativeReason] ?? '命中未加入';
  }

  const explanation = item.pluginExplanation ?? {};
  const key = getPrimaryKey(item);
  if (explanation.sourceType === 'chat' && explanation.sourceMessageIndex != null) {
    return `第 ${explanation.sourceMessageIndex} 楼命中「${key}」`;
  }
  if (explanation.sourceType === 'recursion') return '递归触发';
  if (explanation.sourceType) return `非聊天来源：${explanation.sourceType}`;
  return '暂无可解释来源';
}

function toItemModel(item) {
  return {
    ...item,
    statusLabel: STATUS_LABELS[item.nativeConfirmation?.status] ?? '未知',
    reasonText: getReasonText(item),
    primaryKey: getPrimaryKey(item),
    expanded: false,
  };
}

function filterItems(items, filter) {
  if (filter === 'joined') {
    return items.filter(item => item.nativeConfirmation?.status === 'joined');
  }
  if (filter === 'matched_not_joined') {
    return items.filter(item => item.nativeConfirmation?.status === 'matched_not_joined');
  }
  if (filter === 'non_chat_source') {
    return items.filter(item => {
      const sourceType = item.pluginExplanation?.sourceType;
      return sourceType && !['chat', 'recursion'].includes(sourceType);
    });
  }
  return items;
}

export function createPanelModel(record, {
  messageId,
  filter = 'all',
  viewportWidth,
  selectedEntryKey,
} = {}) {
  const width = getViewportWidth(viewportWidth);
  const layout = width <= 600 ? 'mobile' : 'desktop';
  const subtitle = messageId == null ? '本次 AI 回复生成前' : `第 ${messageId} 楼 · 本次 AI 回复生成前`;

  if (!record) {
    return {
      title: '绿灯激活诊断',
      subtitle,
      layout,
      noRecord: true,
      message: '本条消息没有绿灯诊断记录',
      filters: FILTERS,
      activeFilter: filter,
      items: [],
      selectedItem: null,
      cardsExpandable: layout === 'mobile',
    };
  }

  const items = filterItems((record.items ?? []).map(toItemModel), filter);
  const selectedItem = items.find(item => item.entryKey === selectedEntryKey) ?? items[0] ?? null;

  return {
    title: '绿灯激活诊断',
    subtitle,
    layout,
    noRecord: false,
    summaryText: record.summaryText ?? '',
    filters: FILTERS,
    activeFilter: filter,
    items,
    selectedItem,
    cardsExpandable: layout === 'mobile',
  };
}

function element(document, tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function renderItem(document, item, onJumpToMessage) {
  const card = element(document, 'article', 'green-light-diagnostics-item');
  const header = element(document, 'div', 'green-light-diagnostics-item-header');
  header.append(
    element(document, 'div', 'green-light-diagnostics-item-title', item.name),
    element(document, 'div', 'green-light-diagnostics-item-status', item.statusLabel),
  );

  const meta = element(document, 'div', 'green-light-diagnostics-item-meta');
  meta.append(
    element(document, 'span', '', item.world),
    element(document, 'span', '', `UID ${item.uid ?? '?'}`),
  );

  const reason = element(document, 'div', 'green-light-diagnostics-item-reason', item.reasonText);
  const snippet = element(document, 'div', 'green-light-diagnostics-snippet', item.pluginExplanation?.snippet ?? '');
  card.append(header, meta, reason, snippet);

  if (item.pluginExplanation?.sourceMessageIndex != null && onJumpToMessage) {
    const jump = element(document, 'button', 'green-light-diagnostics-jump', '跳到来源楼层');
    jump.addEventListener('click', () => onJumpToMessage(item.pluginExplanation.sourceMessageIndex));
    card.append(jump);
  }

  return card;
}

export function openDiagnosticsPanel({
  record,
  messageId,
  onJumpToMessage,
  document = globalThis.document,
} = {}) {
  const existing = document.querySelector?.('.green-light-diagnostics-panel');
  existing?.remove?.();

  const model = createPanelModel(record, { messageId });
  const panel = element(document, 'section', 'green-light-diagnostics-panel');
  const header = element(document, 'header', 'green-light-diagnostics-header');
  const titleBlock = element(document, 'div', 'green-light-diagnostics-title-block');
  titleBlock.append(
    element(document, 'h2', '', model.title),
    element(document, 'div', 'green-light-diagnostics-subtitle', model.subtitle),
  );

  const close = element(document, 'button', 'green-light-diagnostics-close', '关闭');
  close.addEventListener('click', () => panel.remove());
  header.append(titleBlock, close);

  const body = element(document, 'div', 'green-light-diagnostics-body');
  if (model.noRecord) {
    body.append(element(document, 'div', 'green-light-diagnostics-empty', model.message));
  } else {
    const list = element(document, 'div', 'green-light-diagnostics-list');
    const summary = element(document, 'pre', 'green-light-diagnostics-summary', model.summaryText);
    const filters = element(document, 'div', 'green-light-diagnostics-filters');
    for (const filter of model.filters) {
      const button = element(document, 'button', 'green-light-diagnostics-filter', filter.label);
      button.dataset.active = filter.id === model.activeFilter ? 'true' : 'false';
      filters.append(button);
    }
    list.append(summary, filters, ...model.items.map(item => renderItem(document, item, onJumpToMessage)));

    const detail = element(document, 'aside', 'green-light-diagnostics-detail');
    if (model.selectedItem) {
      detail.append(renderItem(document, model.selectedItem, onJumpToMessage));
    }
    body.append(list, detail);
  }

  panel.append(header, body);
  document.body.appendChild(panel);
  return panel;
}
