import { getI18n } from './i18n.js';

const FILTER_IDS = Object.freeze(['joined', 'matched_not_joined']);
let popupDepsPromise = null;

async function loadPopupDeps() {
  popupDepsPromise ??= import('../../../../popup.js');
  return popupDepsPromise;
}

function getViewportWidth(viewportWidth) {
  if (Number.isFinite(Number(viewportWidth))) return Number(viewportWidth);
  return globalThis.window?.innerWidth ?? 800;
}

function getPrimaryKey(item) {
  return item.pluginExplanation?.primaryMatches?.[0]?.key ?? '';
}

function getRecursionSourceList(item, i18n) {
  return (item.pluginExplanation?.recursionSources ?? []).map(source => ({
    name: source.name || `UID ${source.uid ?? '?'}`,
    key: source.key ?? '',
    entryLabel: i18n.sourceEntryLabel,
    keywordLabel: i18n.sourceKeywordLabel,
  }));
}

function getFilters(i18n) {
  return FILTER_IDS.map(id => ({ id, label: i18n.filters[id] }));
}

function getReasonText(item, i18n) {
  const nativeReason = item.nativeConfirmation?.reasonType;
  if (nativeReason && nativeReason !== 'native_joined') {
    return i18n.reasons[nativeReason] ?? i18n.fallbackBlockedReason;
  }

  const explanation = item.pluginExplanation ?? {};
  const recursionSources = getRecursionSourceList(item, i18n);
  if (explanation.recursionAttribution === 'sources' && recursionSources.length === 1) {
    const parts = i18n.recursionSingleSource(recursionSources[0]);
    return explanation.delayedUntilRecursion ? [...parts, ` · ${i18n.delayedRecursionHint}`] : parts;
  }
  if (explanation.recursionAttribution === 'sources' && recursionSources.length > 1) {
    const text = i18n.recursionMultipleSources(recursionSources.length);
    return explanation.delayedUntilRecursion ? `${text} · ${i18n.delayedRecursionHint}` : text;
  }
  if (explanation.recursionAttribution === 'missing_source') {
    return i18n.recursionMissingSource;
  }
  if (explanation.recursionAttribution === 'delayed_source' && explanation.delayedUntilRecursion) {
    const delayed = explanation.delayedUntilRecursion;
    if (delayed.sourceType === 'chat' && delayed.sourceMessageIndex != null) {
      return i18n.delayedChatMatch({ messageIndex: delayed.sourceMessageIndex, key: delayed.key });
    }
    return i18n.delayedNonChatMatch({ sourceType: delayed.sourceType ?? i18n.unknown, key: delayed.key });
  }

  const key = getPrimaryKey(item);
  if (explanation.sourceType === 'chat' && explanation.sourceMessageIndex != null) {
    return i18n.chatMatch({ messageIndex: explanation.sourceMessageIndex, key });
  }
  if (explanation.sourceType === 'recursion') return i18n.recursion;
  if (explanation.sourceType) return i18n.nonChatSource(explanation.sourceType);
  return i18n.noExplainableSource;
}

function toItemModel(item, i18n) {
  return {
    ...item,
    statusLabel: i18n.status[item.nativeConfirmation?.status] ?? i18n.unknown,
    reasonText: getReasonText(item, i18n),
    primaryKey: getPrimaryKey(item),
    recursionSourceList: getRecursionSourceList(item, i18n),
  };
}

function filterItems(items, filter) {
  if (filter === 'joined') {
    return items.filter(item => item.nativeConfirmation?.status === 'joined');
  }
  if (filter === 'matched_not_joined') {
    return items.filter(item => item.nativeConfirmation?.status === 'matched_not_joined');
  }
  return items;
}

export function createPanelModel(record, {
  messageId,
  filter = 'joined',
  viewportWidth,
  locale,
} = {}) {
  const i18n = getI18n(locale).panel;
  const subtitle = i18n.subtitle(messageId);

  if (!record) {
    return {
      title: i18n.title,
      subtitle,
      noRecord: true,
      message: i18n.noRecord,
      filters: getFilters(i18n),
      activeFilter: filter,
      items: [],
      joinedCount: 0,
      notJoinedCount: 0,
    };
  }

  const allItems = (record.items ?? []).map(item => toItemModel(item, i18n));
  const items = filterItems(allItems, filter);
  const joinedCount = allItems.filter(item => item.nativeConfirmation?.status === 'joined').length;
  const notJoinedCount = allItems.filter(item => item.nativeConfirmation?.status === 'matched_not_joined').length;

  return {
    title: i18n.title,
    subtitle,
    noRecord: false,
    joinedCount,
    notJoinedCount,
    filters: getFilters(i18n),
    activeFilter: filter,
    filterNote: i18n.filterNotes[filter] ?? '',
    items,
  };
}

function element(document, tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function renderReasonContent(document, reasonData) {
  const container = element(document, 'div', 'green-light-diagnostics-item-reason');
  if (!Array.isArray(reasonData)) {
    container.textContent = String(reasonData ?? '');
    return container;
  }
  for (const part of reasonData) {
    if (typeof part === 'string') {
      const lines = part.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) container.append(document.createElement('br'));
        if (line) container.append(document.createTextNode(line));
      });
    } else if (part?.type === 'value') {
      container.append(element(document, 'span', 'green-light-diagnostics-source-value', part.text));
    }
  }
  return container;
}

function renderItem(document, item) {
  const card = element(document, 'details', 'green-light-diagnostics-item');
  const summary = element(document, 'summary', 'green-light-diagnostics-item-summary');
  
  const header = element(document, 'div', 'green-light-diagnostics-item-header');
  
  const isJoined = item.nativeConfirmation?.status === 'joined';
  const icon = element(document, 'div', 'green-light-diagnostics-status-icon');
  icon.dataset.status = isJoined ? 'joined' : 'not_joined';
  
  const titleText = element(document, 'div', 'green-light-diagnostics-item-title', item.name);
  const worldText = element(document, 'div', 'green-light-diagnostics-item-world', item.world);
  
  header.append(icon, titleText, worldText);
  summary.append(header);

  const detailBody = element(document, 'div', 'green-light-diagnostics-item-details');
  if (item.recursionSourceList?.length > 1) {
    const sourceDetails = element(document, 'details', 'green-light-diagnostics-recursion-sources');
    const sourceSummary = element(document, 'summary', 'green-light-diagnostics-item-reason', item.reasonText);
    const sourceList = element(document, 'ol', 'green-light-diagnostics-recursion-source-list');
    item.recursionSourceList.forEach(source => {
      const sourceItem = element(document, 'li', 'green-light-diagnostics-recursion-source-item');
      sourceItem.append(
        element(document, 'span', '', `${source.entryLabel} `),
        element(document, 'span', 'green-light-diagnostics-source-value', source.name),
        document.createElement('br'),
        element(document, 'span', '', `${source.keywordLabel} `),
        element(document, 'span', 'green-light-diagnostics-source-value', source.key),
      );
      sourceList.append(sourceItem);
    });
    sourceDetails.append(sourceSummary, sourceList);
    detailBody.append(sourceDetails);
  } else {
    detailBody.append(renderReasonContent(document, item.reasonText));
  }

  if (item.pluginExplanation?.snippet) {
    const snippet = element(document, 'blockquote', 'green-light-diagnostics-snippet', item.pluginExplanation.snippet);
    detailBody.append(snippet);
  }

  card.append(summary, detailBody);
  return card;
}

function buildPanelContent({
  record,
  messageId,
  document = globalThis.document,
  activeFilter = 'joined',
  onFilterChange,
  onClose,
  locale,
} = {}) {
  const i18n = getI18n(locale).panel;
  const model = createPanelModel(record, { messageId, filter: activeFilter, locale });
  const container = element(document, 'section', 'green-light-diagnostics-panel-content');
  
  const header = element(document, 'header', 'green-light-diagnostics-header');
  const titleBlock = element(document, 'div', 'green-light-diagnostics-title-block');
  titleBlock.append(
    element(document, 'h2', '', model.title),
    element(document, 'div', 'green-light-diagnostics-subtitle', model.subtitle),
  );

  const close = element(document, 'button', 'green-light-diagnostics-close');
  close.title = i18n.close;
  close.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  close.addEventListener('click', () => onClose?.());
  header.append(titleBlock, close);
  
  const body = element(document, 'div', 'green-light-diagnostics-body');
  if (model.noRecord) {
    body.append(element(document, 'div', 'green-light-diagnostics-empty', model.message));
  } else {
    const overview = element(document, 'div', 'green-light-diagnostics-overview');
    
    const joinedStat = element(document, 'div', 'green-light-diagnostics-stat');
    joinedStat.append(
      element(document, 'div', 'green-light-diagnostics-stat-value', model.joinedCount),
      element(document, 'div', 'green-light-diagnostics-stat-label', i18n.statJoined)
    );
    
    const notJoinedStat = element(document, 'div', 'green-light-diagnostics-stat');
    notJoinedStat.append(
      element(document, 'div', 'green-light-diagnostics-stat-value', model.notJoinedCount),
      element(document, 'div', 'green-light-diagnostics-stat-label', i18n.statBlocked)
    );
    
    overview.append(joinedStat, notJoinedStat);

    const filters = element(document, 'div', 'green-light-diagnostics-filters');
    for (const filter of model.filters) {
      const tab = element(document, 'span', 'green-light-diagnostics-filter-tab', filter.label);
      tab.dataset.active = filter.id === model.activeFilter ? 'true' : 'false';
      tab.addEventListener('click', () => {
        onFilterChange?.(filter.id);
      });
      filters.append(tab);
    }

    const filterNote = model.filterNote
      ? element(document, 'div', 'green-light-diagnostics-filter-note', model.filterNote)
      : null;
    
    const list = element(document, 'div', 'green-light-diagnostics-list');
    list.append(...model.items.map(item => renderItem(document, item)));

    body.append(overview, filters);
    if (filterNote) body.append(filterNote);
    body.append(list);
  }

  container.append(header, body);
  return container;
}

export function openDiagnosticsPanel({
  record,
  messageId,
  document = globalThis.document,
  activeFilter = 'joined',
  locale,
  popupDeps,
} = {}) {
  let currentFilter = activeFilter;
  let currentPopup = null;
  const popupDepsLoader = popupDeps ? Promise.resolve(popupDeps) : loadPopupDeps();

  async function showWithFilter(filter) {
    currentFilter = filter;
    const { Popup, POPUP_TYPE } = await popupDepsLoader;
    
    const content = buildPanelContent({
      record,
      messageId,
      document,
      activeFilter: currentFilter,
      locale,
      onFilterChange: (newFilter) => {
        if (currentPopup) {
          currentPopup.completeCancelled();
        }
        void showWithFilter(newFilter);
      },
      onClose: () => {
        if (currentPopup) {
          currentPopup.completeCancelled();
        }
      }
    });

    currentPopup = new Popup(content, POPUP_TYPE.DISPLAY, '', {
      transparent: true,
      large: false,
      allowVerticalScrolling: true,
      animation: 'fast',
    });

    // Add a marker class to the dialog wrapper so we can style the <dialog> itself
    if (currentPopup.dlg) {
      currentPopup.dlg.classList.add('green-light-diagnostics-popup-wrapper');
    }

    currentPopup.show();
    return currentPopup;
  }

  return showWithFilter(currentFilter);
}
