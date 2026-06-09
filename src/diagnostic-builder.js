import { SCHEMA_VERSION } from './constants.js';
import { classifyNativeOutcome, getEntryDisplayName, isGreenLightEntry } from './entry-utils.js';
import { getI18n } from './i18n.js';
import { entryKey } from './scan-collector.js';

const WORLD_INFO_SCAN_STATE_RECURSION = 2;
const WORLD_INFO_SCAN_STATE_NONE = 0;

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
    recursionAttribution: explanation.recursionAttribution ?? null,
    recursionSources: (explanation.recursionSources ?? []).map(source => ({
      world: source.world ?? '',
      uid: source.uid,
      name: source.name ?? '',
      key: source.key ?? '',
    })),
    delayedUntilRecursion: explanation.delayedUntilRecursion
      ? {
        level: explanation.delayedUntilRecursion.level ?? null,
        sourceType: explanation.delayedUntilRecursion.sourceType ?? null,
        sourceMessageIndex: explanation.delayedUntilRecursion.sourceMessageIndex ?? null,
        key: explanation.delayedUntilRecursion.key ?? '',
      }
      : null,
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

function isRecursiveLoop(loop) {
  return loop?.stateCurrent === WORLD_INFO_SCAN_STATE_RECURSION;
}

function shouldCarrySourcesToNextLoop(loop) {
  return Boolean(loop?.stateNext && loop.stateNext !== WORLD_INFO_SCAN_STATE_NONE);
}

function getRecursionDelayLevel(entry, loop) {
  const currentLevel = Number(loop?.recursionDelay?.currentLevel);
  if (Number.isFinite(currentLevel) && currentLevel > 0) return currentLevel;
  if (entry?.delayUntilRecursion === true) return 1;

  const entryLevel = Number(entry?.delayUntilRecursion);
  return Number.isFinite(entryLevel) && entryLevel > 0 ? entryLevel : null;
}

function createRecursionSource(entry) {
  const text = String(entry?.content ?? '');
  if (!text.trim()) return null;

  return {
    key: entryKey(entry),
    world: entry?.world ?? '',
    uid: entry?.uid,
    name: getEntryDisplayName(entry),
    text,
  };
}

function addRecursionSourcesFromLoop(sourcePool, seenSources, loop) {
  if (!shouldCarrySourcesToNextLoop(loop)) return;

  for (const entry of loop?.newSuccessful ?? []) {
    if (entry?.preventRecursion) continue;

    const source = createRecursionSource(entry);
    if (!source || seenSources.has(source.key)) continue;

    seenSources.add(source.key);
    sourcePool.push(source);
  }
}

function findRecursionSources(entry, sourcePool, matcher, session, settings) {
  const results = [];
  const seen = new Set();

  for (const source of sourcePool) {
    const matches = matcher.findPrimaryMatches?.(
      entry,
      [{ sourceType: 'recursion', text: source.text }],
      session,
      settings,
    ) ?? [];

    for (const match of matches) {
      const key = String(match.key ?? '');
      const dedupeKey = `${source.key}.${key}`;
      if (!key || seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      results.push({
        world: source.world,
        uid: source.uid,
        name: source.name,
        key,
      });
    }
  }

  return results;
}

function findDelayedUntilRecursionSource(entry, loop, matcher, session, settings) {
  if (!entry?.delayUntilRecursion) return null;

  const explanation = matcher.explainEntry(entry, session, [], settings);
  const match = explanation.primaryMatches?.find(item => item.sourceType !== 'recursion');
  if (!match) return null;

  return {
    level: getRecursionDelayLevel(entry, loop),
    sourceType: match.sourceType ?? explanation.sourceType ?? null,
    sourceMessageIndex: match.sourceMessageIndex ?? explanation.sourceMessageIndex ?? null,
    key: match.key ?? '',
  };
}

function createDelayedUntilRecursionMarker(entry, loop, source) {
  if (!entry?.delayUntilRecursion) return null;

  return source ?? {
    level: getRecursionDelayLevel(entry, loop),
    sourceType: null,
    sourceMessageIndex: null,
    key: '',
  };
}

function buildRecursionAttributions({ collected, matcher, settings }) {
  const attributions = new Map();
  const sourcePool = [];
  const seenSources = new Set();
  const session = collected?.session ?? {};

  for (const loop of collected?.loops ?? []) {
    if (isRecursiveLoop(loop)) {
      for (const entry of loop.newSuccessful ?? []) {
        const recursionSources = findRecursionSources(entry, sourcePool, matcher, session, settings);
        const delayedSource = findDelayedUntilRecursionSource(entry, loop, matcher, session, settings);
        const delayedUntilRecursion = createDelayedUntilRecursionMarker(entry, loop, delayedSource);
        const recursionAttribution = recursionSources.length
          ? 'sources'
          : delayedSource
            ? 'delayed_source'
            : 'missing_source';

        attributions.set(entryKey(entry), {
          recursionAttribution,
          recursionSources,
          delayedUntilRecursion,
        });
      }
    }

    addRecursionSourcesFromLoop(sourcePool, seenSources, loop);
  }

  return attributions;
}

function applyRecursionAttribution(entry, explanation, attribution) {
  if (!attribution) return explanation;

  const next = {
    ...explanation,
    recursionAttribution: attribution.recursionAttribution,
    recursionSources: attribution.recursionSources ?? [],
    delayedUntilRecursion: attribution.delayedUntilRecursion ?? null,
  };

  if (attribution.recursionAttribution === 'sources') {
    next.reasonType = next.reasonType === 'unexplained' ? 'keyword' : next.reasonType;
    next.sourceType = 'recursion';
    next.matchCount = Math.max(next.matchCount ?? 0, attribution.recursionSources?.length ?? 0);
    if (!next.primaryMatches?.length && attribution.recursionSources?.length) {
      next.primaryMatches = [{
        key: attribution.recursionSources[0].key,
        sourceType: 'recursion',
        sourceMessageIndex: null,
        sourceDepth: null,
        snippet: '',
      }];
    }
  }

  if (attribution.recursionAttribution === 'missing_source') {
    next.sourceType = 'recursion';
  }

  if (attribution.recursionAttribution === 'delayed_source') {
    next.reasonType = next.reasonType === 'unexplained' ? 'keyword' : next.reasonType;
  }

  return next;
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
  const recursionAttributions = buildRecursionAttributions({ collected, matcher, settings });

  for (const loop of collected?.loops ?? []) {
    for (const entry of [...(loop.newAll ?? []), ...(loop.activatedEntries ?? [])]) {
      if (isGreenLightEntry(entry)) candidates.set(entryKey(entry), { entry });
    }
  }

  for (const entry of collected?.finalActivatedEntries ?? []) {
    if (isGreenLightEntry(entry)) candidates.set(entryKey(entry), { entry });
  }

  for (const loop of collected?.loops ?? []) {
    for (const entry of loop.sortedEntries ?? []) {
      const key = entryKey(entry);
      if (candidates.has(key) || !isGreenLightEntry(entry)) continue;

      const pluginExplanation = matcher.explainEntry(entry, session, [], settings);
      if (pluginExplanation.reasonType === 'unexplained') continue;
      if (!isKnownEarlyFilter(entry, collected, pluginExplanation)) continue;

      candidates.set(key, { entry, pluginExplanation });
    }
  }

  const items = [...candidates.values()].map(({ entry, pluginExplanation: precomputedExplanation }) => {
    const recursionAttribution = recursionAttributions.get(entryKey(entry));
    const pluginExplanation = compactExplanation(
      applyRecursionAttribution(
        entry,
        precomputedExplanation ?? matcher.explainEntry(entry, session, [], settings),
        recursionAttribution,
      ),
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
    recursion: countBy(items, item => item.pluginExplanation.sourceType === 'recursion' || item.pluginExplanation.recursionAttribution),
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
