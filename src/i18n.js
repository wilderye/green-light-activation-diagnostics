const SILLYTAVERN_LANGUAGE_KEY = 'language';

const TRANSLATIONS = Object.freeze({
  zh: Object.freeze({
    language: 'zh',
    settings: Object.freeze({
      title: '绿灯激活诊断器',
      storageNotice: ({ days, limit }) => `诊断仅临时保存在当前浏览器，不写入聊天文件；超过 ${days} 天或累计超过 ${limit} 条会自动清理。清缓存、换浏览器或迁移聊天时不会保留。`,
      recordCountLabel: count => `${count} 条`,
      clearConfirm: '清除当前聊天的临时诊断记录？此操作不会修改聊天文件。',
      enableDiagnostics: '启用诊断 (临时记录每次生成的绿灯触发情况)',
      includeBlocked: '包含「被拦截」条目 (便于排查失效干扰项)',
      includeSnippets: '保存原文节选 (在面板中展示触发文本片段)',
      snippetLengthLabel: '原文节选长度 (单侧截取字符数): ',
      temporaryRecords: recordCountLabel => `临时记录：${recordCountLabel}`,
      storageUsed: totalBytesLabel => `占用空间：${totalBytesLabel}`,
      averageRecord: averageBytesLabel => `单条平均：${averageBytesLabel}`,
      clearButton: '清除本聊天临时诊断',
    }),
    messageButton: Object.freeze({
      title: '绿灯激活诊断',
    }),
    panel: Object.freeze({
      title: '绿灯激活诊断',
      noRecord: '本条消息没有绿灯诊断记录',
      subtitle: messageId => (messageId == null ? '本次 AI 回复生成前' : `第 ${messageId} 楼 · 本次 AI 回复生成前`),
      close: '关闭',
      unknown: '未知',
      filters: Object.freeze({
        joined: '已生效',
        matched_not_joined: '被拦截',
      }),
      status: Object.freeze({
        joined: '已激活',
        matched_not_joined: '未激活',
      }),
      statJoined: '已生效',
      statBlocked: '被拦截',
      filterNotes: Object.freeze({
        matched_not_joined: '这里显示被酒馆列为候选、但最终没加入提示词的条目和插件推断出的早期筛选，例如二级条件未满足、同组落选、冷却/延迟、生成类型不适用。无法列出酒馆没有实际扫描到的条目，如递归设置导致的符合条件的条目未被扫描。',
      }),
      reasons: Object.freeze({
        native_joined: '原生确认已激活',
        sticky: '黏性延续生效',
        secondary_not_satisfied: '主关键词命中，但二级关键词条件不满足',
        probability_failed: '命中但概率拦截',
        group_loser: '同组竞争落选',
        budget_blocked: '被 Token 预算拦截',
        cooldown_active: '命中，但仍在冷却中',
        delay_active: '命中，但延迟条件还没到',
        generation_type_filtered: '关键词命中了，但这条不用于本次生成方式',
        matched_not_joined_unknown: '命中但未加入',
      }),
      fallbackBlockedReason: '命中未加入',
      chatMatch: ({ messageIndex, key }) => `第 ${messageIndex} 楼命中「${key}」`,
      recursion: '递归触发',
      recursionSingleSource: ({ name, key }) => `递归触发 条目 ${name} 关键词 ${key}`,
      recursionMultipleSources: count => `递归触发 可能由 ${count} 个条目触发`,
      recursionMissingSource: '递归触发 未检测到来源，请尝试关闭无关插件减少干扰',
      delayedChatMatch: ({ messageIndex, key }) => `延迟到递归轮 第 ${messageIndex} 楼命中「${key}」`,
      delayedNonChatMatch: ({ sourceType, key }) => `延迟到递归轮 非聊天来源：${sourceType} 命中「${key}」`,
      delayedRecursionHint: '延迟到递归轮',
      sourceEntryLabel: '条目',
      sourceKeywordLabel: '关键词',
      nonChatSource: sourceType => `非聊天来源：${sourceType}`,
      noExplainableSource: '暂无可解释来源',
    }),
    summary: Object.freeze({
      unit: count => `${count} 条`,
      labels: Object.freeze({
        keywordTriggered: '关键词触发',
        recursion: '递归',
        sticky: '黏性延续',
        secondaryBlocked: '二级条件未满足',
        probabilityFailed: '概率失败',
        budgetBlocked: '预算挡下',
        groupLoser: '分组落选',
        timedEffectBlocked: '冷却/延迟',
        generationTypeBlocked: '生成类型不适用',
      }),
      joinedLine: ({ count, parts }) => `实际加入 ${count} 条：${parts}`,
      blockedLine: ({ count, parts }) => `命中未加入 ${count} 条：${parts}`,
    }),
  }),
  en: Object.freeze({
    language: 'en',
    settings: Object.freeze({
      title: 'Green Light Activation Diagnostics',
      storageNotice: ({ days, limit }) => `Diagnostics are temporarily saved in this browser only and are not written to chat files. Records older than ${days} days or beyond ${limit} total records are cleaned up automatically. Clearing browser data, switching browsers, or moving chats will not keep them.`,
      recordCountLabel: count => `${count} ${count === 1 ? 'record' : 'records'}`,
      clearConfirm: 'Clear temporary diagnostics for the current chat? This will not modify chat files.',
      enableDiagnostics: 'Enable diagnostics (temporarily record green-light activation for each generation)',
      includeBlocked: 'Include "Blocked" entries (helps find entries that matched but did not activate)',
      includeSnippets: 'Save source excerpts (show matched text snippets in the panel)',
      snippetLengthLabel: 'Source excerpt length (characters on each side): ',
      temporaryRecords: recordCountLabel => `Temporary records: ${recordCountLabel}`,
      storageUsed: totalBytesLabel => `Storage used: ${totalBytesLabel}`,
      averageRecord: averageBytesLabel => `Average record: ${averageBytesLabel}`,
      clearButton: 'Clear temporary diagnostics for this chat',
    }),
    messageButton: Object.freeze({
      title: 'Green Light Activation Diagnostics',
    }),
    panel: Object.freeze({
      title: 'Green Light Activation Diagnostics',
      noRecord: 'No green-light diagnostics for this message',
      subtitle: messageId => (messageId == null ? 'Before this AI reply' : `Message ${messageId} · Before this AI reply`),
      close: 'Close',
      unknown: 'Unknown',
      filters: Object.freeze({
        joined: 'Active',
        matched_not_joined: 'Blocked',
      }),
      status: Object.freeze({
        joined: 'Activated',
        matched_not_joined: 'Not activated',
      }),
      statJoined: 'Active',
      statBlocked: 'Blocked',
      filterNotes: Object.freeze({
        matched_not_joined: 'This shows entries that SillyTavern listed as candidates but did not add to the final prompt, plus early filters inferred by the plugin, such as unmet secondary conditions, losing to another entry in the same group, cooldown/delay, or generation type filters. It cannot list entries SillyTavern did not actually scan, such as otherwise eligible entries that were not scanned because of recursion settings.',
      }),
      reasons: Object.freeze({
        native_joined: 'Confirmed activated by SillyTavern',
        sticky: 'Continued by sticky setting',
        secondary_not_satisfied: 'Primary keyword matched, but secondary keyword conditions were not met',
        probability_failed: 'Matched, but blocked by probability',
        group_loser: 'Lost to another entry in the same group',
        budget_blocked: 'Blocked by token budget',
        cooldown_active: 'Matched, but still on cooldown',
        delay_active: 'Matched, but the delay condition is not ready yet',
        generation_type_filtered: 'Keyword matched, but this entry is not used for this generation type',
        matched_not_joined_unknown: 'Matched, but did not activate',
      }),
      fallbackBlockedReason: 'Matched but not activated',
      chatMatch: ({ messageIndex, key }) => `Matched "${key}" in message ${messageIndex}`,
      recursion: 'Triggered by recursion',
      recursionSingleSource: ({ name, key }) => `Triggered by recursion: entry ${name}, keyword ${key}`,
      recursionMultipleSources: count => `Triggered by recursion, possibly by ${count} entries`,
      recursionMissingSource: 'Triggered by recursion. No source detected; try disabling unrelated extensions to reduce interference.',
      delayedChatMatch: ({ messageIndex, key }) => `Delayed until recursion; matched "${key}" in message ${messageIndex}`,
      delayedNonChatMatch: ({ sourceType, key }) => `Delayed until recursion; matched "${key}" from ${sourceType}`,
      delayedRecursionHint: 'Delayed until recursion',
      sourceEntryLabel: 'Entry',
      sourceKeywordLabel: 'Keyword',
      nonChatSource: sourceType => `Matched from ${sourceType}`,
      noExplainableSource: 'No clear source found',
    }),
    summary: Object.freeze({
      unit: count => `${count} ${count === 1 ? 'entry' : 'entries'}`,
      labels: Object.freeze({
        keywordTriggered: 'keyword matches',
        recursion: 'recursion',
        sticky: 'sticky continuation',
        secondaryBlocked: 'secondary conditions missing',
        probabilityFailed: 'probability blocked',
        budgetBlocked: 'budget blocked',
        groupLoser: 'group lost',
        timedEffectBlocked: 'cooldown/delay',
        generationTypeBlocked: 'generation type skipped',
      }),
      joinedLine: ({ count, parts }) => `Activated ${count === 1 ? '1 entry' : `${count} entries`}: ${parts}`,
      blockedLine: ({ count, parts }) => `Matched but not activated ${count === 1 ? '1 entry' : `${count} entries`}: ${parts}`,
    }),
  }),
});

export function normalizePluginLanguage(locale) {
  const code = String(locale ?? '').trim().toLowerCase();
  return code.startsWith('zh') ? 'zh' : 'en';
}

function safeGetStoredLanguage(localStorageRef) {
  try {
    return localStorageRef?.getItem?.(SILLYTAVERN_LANGUAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function detectPluginLanguage({
  document = globalThis.document,
  localStorage = globalThis.localStorage,
  navigator = globalThis.navigator,
} = {}) {
  const candidates = [
    safeGetStoredLanguage(localStorage),
    document?.documentElement?.lang,
    ...(Array.isArray(navigator?.languages) ? navigator.languages : []),
    navigator?.language,
    navigator?.userLanguage,
  ];
  const locale = candidates.find(candidate => String(candidate ?? '').trim());
  return normalizePluginLanguage(locale);
}

export function getI18n(locale) {
  const language = locale == null ? detectPluginLanguage() : normalizePluginLanguage(locale);
  return TRANSLATIONS[language] ?? TRANSLATIONS.en;
}
