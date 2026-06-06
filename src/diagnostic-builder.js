import { SCHEMA_VERSION } from './constants.js';
import { classifyNativeOutcome, getEntryDisplayName, isGreenLightEntry } from './entry-utils.js';
import { entryKey } from './scan-collector.js';

function compactMatch(match = {}) {
  return {
    key: match.key,
    match: match.match,
    sourceType: match.sourceType,
    sourceMessageIndex: match.sourceMessageIndex ?? null,
    sourceDepth: match.sourceDepth ?? null,
    snippet: match.snippet ?? '',
  };
}

function compactExplanation(explanation = {}) {
  return {
    confidence: explanation.confidence ?? 'plugin_explanation',
    reasonType: explanation.reasonType ?? 'unexplained',
    sourceType: explanation.sourceType ?? null,
    sourceMessageIndex: explanation.sourceMessageIndex ?? null,
    sourceDepth: explanation.sourceDepth ?? null,
    snippet: explanation.snippet ?? '',
    matchCount: explanation.matchCount ?? 0,
    hasMultipleMatches: Boolean(explanation.hasMultipleMatches),
    primaryMatches: (explanation.primaryMatches ?? []).map(compactMatch),
    secondaryMatches: (explanation.secondaryMatches ?? []).map(compactMatch),
    secondaryLogic: explanation.secondaryLogic ?? null,
    secondaryLogicSatisfied: explanation.secondaryLogicSatisfied ?? null,
    missingSecondaryKeys: explanation.missingSecondaryKeys ?? [],
  };
}

function countBy(items, predicate) {
  return items.filter(predicate).length;
}

function buildSummaryText(summary) {
  const joinedParts = [
    `关键词触发 ${summary.keywordTriggered} 条`,
    `递归 ${summary.recursion} 条`,
    `黏性延续 ${summary.sticky} 条`,
  ];
  const blockedParts = [
    `概率失败 ${summary.probabilityFailed} 条`,
    `预算挡下 ${summary.budgetBlocked} 条`,
    `分组落选 ${summary.groupLoser} 条`,
  ];

  return [
    `实际加入 ${summary.joined} 条：${joinedParts.join(' · ')}`,
    `命中未加入 ${summary.matchedNotJoined} 条：${blockedParts.join(' · ')}`,
  ].join('\n');
}

export function buildDiagnosticRecord({ collected, matcher, settings, messageId, swipeId }) {
  const session = collected?.session ?? {};
  const seen = new Map();

  for (const loop of collected?.loops ?? []) {
    for (const entry of [...(loop.newAll ?? []), ...(loop.activatedEntries ?? [])]) {
      if (isGreenLightEntry(entry)) seen.set(entryKey(entry), entry);
    }
  }

  for (const entry of collected?.finalActivatedEntries ?? []) {
    if (isGreenLightEntry(entry)) seen.set(entryKey(entry), entry);
  }

  const recursionTexts = (collected?.loops ?? [])
    .map(loop => loop.activatedText)
    .filter(Boolean);

  const items = [...seen.values()].map(entry => {
    const nativeConfirmation = classifyNativeOutcome(entry, collected);
    const pluginExplanation = compactExplanation(
      matcher.explainEntry(entry, session, recursionTexts, settings),
    );

    return {
      entryKey: entryKey(entry),
      world: entry.world ?? '',
      uid: entry.uid,
      name: getEntryDisplayName(entry),
      nativeConfirmation,
      pluginExplanation,
      position: entry.position ?? null,
      depth: entry.depth ?? null,
      order: entry.order ?? null,
      probability: entry.probability ?? null,
      group: entry.group ?? '',
      sticky: entry.sticky ?? null,
      cooldown: entry.cooldown ?? null,
      delay: entry.delay ?? null,
    };
  });

  const summary = {
    joined: countBy(items, item => item.nativeConfirmation.status === 'joined'),
    matchedNotJoined: countBy(items, item => item.nativeConfirmation.status === 'matched_not_joined'),
    keywordTriggered: countBy(items, item => item.pluginExplanation.reasonType === 'keyword'),
    recursion: countBy(items, item => item.pluginExplanation.sourceType === 'recursion'),
    sticky: countBy(items, item => item.nativeConfirmation.reasonType === 'sticky'),
    nonChatSource: countBy(items, item => item.pluginExplanation.sourceType && !['chat', 'recursion'].includes(item.pluginExplanation.sourceType)),
    probabilityFailed: countBy(items, item => item.nativeConfirmation.reasonType === 'probability_failed'),
    budgetBlocked: countBy(items, item => item.nativeConfirmation.reasonType === 'budget_blocked'),
    groupLoser: countBy(items, item => item.nativeConfirmation.reasonType === 'group_loser'),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    messageId,
    swipeId,
    generationType: session.generationType ?? 'normal',
    summary,
    summaryText: buildSummaryText(summary),
    items,
  };
}
