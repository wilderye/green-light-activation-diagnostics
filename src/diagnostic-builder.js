import { SCHEMA_VERSION } from './constants.js';
import { classifyNativeOutcome, getEntryDisplayName, isGreenLightEntry } from './entry-utils.js';
import { getI18n } from './i18n.js';
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

function formatSummaryParts(parts, i18n) {
  const visibleParts = parts.filter(([, count]) => count > 0);
  return (visibleParts.length ? visibleParts : parts)
    .map(([label, count]) => `${label} ${i18n.unit(count)}`)
    .join(' · ');
}

function getTimedEffectKeys(collected, type) {
  return new Set((collected?.loops ?? []).flatMap(loop => (
    loop.timedEffectEntries?.[type] ?? []
  )).map(entryKey));
}

function hasSameGroupWinner(entry, collected = {}) {
  const groups = String(entry?.group ?? '').split(',').map(group => group.trim()).filter(Boolean);
  if (!groups.length) return false;

  return (collected.finalActivatedEntries ?? []).some(item => {
    if (entryKey(item) === entryKey(entry)) return false;
    const itemGroups = new Set(String(item?.group ?? '').split(',').map(group => group.trim()).filter(Boolean));
    return groups.some(group => itemGroups.has(group));
  });
}

function isKnownEarlyFilter(entry, collected, pluginExplanation) {
  if (pluginExplanation.reasonType === 'secondary_not_satisfied') return true;
  if (hasSameGroupWinner(entry, collected)) return true;

  const key = entryKey(entry);
  if (getTimedEffectKeys(collected, 'cooldown').has(key)) return true;
  if (getTimedEffectKeys(collected, 'delay').has(key)) return true;

  const generationType = collected?.session?.generationType;
  if (Array.isArray(entry?.triggers) && entry.triggers.length > 0 && generationType != null) {
    return !entry.triggers.includes(generationType);
  }

  return false;
}

function buildSummaryText(summary, locale) {
  const i18n = getI18n(locale).summary;
  const labels = i18n.labels;
  const joinedParts = [
    [labels.keywordTriggered, summary.keywordTriggered],
    [labels.recursion, summary.recursion],
    [labels.sticky, summary.sticky],
  ];
  const blockedParts = [
    [labels.secondaryBlocked, summary.secondaryBlocked],
    [labels.probabilityFailed, summary.probabilityFailed],
    [labels.budgetBlocked, summary.budgetBlocked],
    [labels.groupLoser, summary.groupLoser],
    [labels.timedEffectBlocked, summary.timedEffectBlocked],
    [labels.generationTypeBlocked, summary.generationTypeBlocked],
  ];

  return [
    i18n.joinedLine({ count: summary.joined, parts: formatSummaryParts(joinedParts, i18n) }),
    i18n.blockedLine({ count: summary.matchedNotJoined, parts: formatSummaryParts(blockedParts, i18n) }),
  ].join('\n');
}

export function buildDiagnosticRecord({ collected, matcher, settings, messageId, swipeId, locale }) {
  const session = collected?.session ?? {};
  const candidates = new Map();

  for (const loop of collected?.loops ?? []) {
    for (const entry of [...(loop.newAll ?? []), ...(loop.activatedEntries ?? [])]) {
      if (isGreenLightEntry(entry)) candidates.set(entryKey(entry), { entry });
    }
  }

  for (const entry of collected?.finalActivatedEntries ?? []) {
    if (isGreenLightEntry(entry)) candidates.set(entryKey(entry), { entry });
  }

  const recursionTexts = (collected?.loops ?? [])
    .map(loop => loop.activatedText)
    .filter(Boolean);

  for (const loop of collected?.loops ?? []) {
    for (const entry of loop.sortedEntries ?? []) {
      const key = entryKey(entry);
      if (candidates.has(key) || !isGreenLightEntry(entry)) continue;

      const pluginExplanation = matcher.explainEntry(entry, session, recursionTexts, settings);
      if (pluginExplanation.reasonType === 'unexplained') continue;
      if (!isKnownEarlyFilter(entry, collected, pluginExplanation)) continue;

      candidates.set(key, { entry, pluginExplanation });
    }
  }

  const items = [...candidates.values()].map(({ entry, pluginExplanation: precomputedExplanation }) => {
    const pluginExplanation = compactExplanation(
      precomputedExplanation ?? matcher.explainEntry(entry, session, recursionTexts, settings),
    );
    const nativeConfirmation = classifyNativeOutcome(entry, collected, pluginExplanation);

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
    secondaryBlocked: countBy(items, item => item.nativeConfirmation.reasonType === 'secondary_not_satisfied'),
    timedEffectBlocked: countBy(items, item => ['cooldown_active', 'delay_active'].includes(item.nativeConfirmation.reasonType)),
    generationTypeBlocked: countBy(items, item => item.nativeConfirmation.reasonType === 'generation_type_filtered'),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    messageId,
    swipeId,
    generationType: session.generationType ?? 'normal',
    summary,
    summaryText: buildSummaryText(summary, locale),
    items,
  };
}
