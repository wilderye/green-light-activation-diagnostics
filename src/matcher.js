const FALLBACK_WORLD_INFO_LOGIC = Object.freeze({
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimKey(key) {
  return String(key ?? '').trim();
}

function buildSnippet(text, index, length, settings = {}) {
  if (settings.includeSnippets === false || index < 0) return '';
  const radius = Number.isFinite(Number(settings.snippetRadius)) ? Number(settings.snippetRadius) : 48;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function getEffectiveMatchSettings(entry, session = {}) {
  const globalMatchSettings = session.worldInfoMatchSettings ?? {};
  return {
    caseSensitive: entry.caseSensitive ?? globalMatchSettings.caseSensitive ?? false,
    matchWholeWords: entry.matchWholeWords ?? globalMatchSettings.matchWholeWords ?? false,
  };
}

function sourceRank(source) {
  if (source.sourceType === 'chat') return 0;
  if (source.sourceType === 'persona') return 1;
  if (source.sourceType?.startsWith('character')) return 2;
  if (source.sourceType === 'scenario') return 3;
  if (source.sourceType === 'creatorNotes') return 4;
  if (source.sourceType === 'injection') return 5;
  if (source.sourceType === 'recursion') return 6;
  return 10;
}

function compareMatches(a, b) {
  const rankDelta = sourceRank(a) - sourceRank(b);
  if (rankDelta) return rankDelta;

  if (a.sourceType === 'chat' && b.sourceType === 'chat') {
    const depthDelta = (a.sourceDepth ?? Number.MAX_SAFE_INTEGER) - (b.sourceDepth ?? Number.MAX_SAFE_INTEGER);
    if (depthDelta) return depthDelta;
  }

  return a.sourceOrder - b.sourceOrder || a.index - b.index;
}

function makeMatch({ key, source, sourceOrder, index, length, text, settings }) {
  return {
    key,
    match: text.slice(index, index + length),
    sourceType: source.sourceType,
    sourceMessageIndex: source.messageIndex ?? null,
    sourceDepth: source.depth ?? null,
    sourceKey: source.key ?? null,
    sourceOrder,
    index,
    snippet: buildSnippet(text, index, length, settings),
  };
}

function findPlainTextMatches({ key, source, sourceOrder, entry, settings, matchSettings }) {
  const text = String(source.text ?? '');
  const caseSensitive = matchSettings?.caseSensitive ?? false;
  const matchWholeWords = matchSettings?.matchWholeWords ?? false;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? key : key.toLowerCase();

  if (!needle) return [];

  const matches = [];
  if (matchWholeWords) {
    const keyWords = needle.split(/\s+/);
    if (keyWords.length > 1) {
      const index = haystack.indexOf(needle);
      if (index >= 0) {
        matches.push(makeMatch({ key, source, sourceOrder, index, length: key.length, text, settings }));
      }
      return matches;
    }

    const regex = new RegExp(`(^|\\W)(${escapeRegExp(needle)})(?=$|\\W)`, 'g');
    for (const match of haystack.matchAll(regex)) {
      const prefixLength = match[1]?.length ?? 0;
      const index = match.index + prefixLength;
      matches.push(makeMatch({ key, source, sourceOrder, index, length: key.length, text, settings }));
    }
    return matches;
  }

  let index = haystack.indexOf(needle);
  while (index >= 0) {
    matches.push(makeMatch({ key, source, sourceOrder, index, length: key.length, text, settings }));
    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }
  return matches;
}

function findRegexMatches({ key, source, sourceOrder, regex, settings }) {
  const text = String(source.text ?? '');
  regex.lastIndex = 0;
  const match = regex.exec(text);
  if (!match) return [];

  return [
    makeMatch({
      key,
      source,
      sourceOrder,
      index: match.index,
      length: match[0].length,
      text,
      settings,
    }),
  ];
}

function findMatchesForKey({ key, sources, entry, settings, parseRegexFromString, matchSettings }) {
  const normalizedKey = trimKey(key);
  if (!normalizedKey) return [];

  const regex = parseRegexFromString?.(normalizedKey);
  const matches = sources.flatMap((source, sourceOrder) => {
    if (regex) {
      return findRegexMatches({ key: normalizedKey, source, sourceOrder, regex, settings });
    }
    return findPlainTextMatches({ key: normalizedKey, source, sourceOrder, entry, settings, matchSettings });
  });

  return matches.sort(compareMatches);
}

function baseExplanation(overrides = {}) {
  return {
    confidence: 'plugin_explanation',
    reasonType: 'unexplained',
    sourceType: null,
    sourceMessageIndex: null,
    sourceDepth: null,
    snippet: '',
    matchCount: 0,
    hasMultipleMatches: false,
    primaryMatches: [],
    secondaryMatches: [],
    secondaryLogic: null,
    secondaryLogicSatisfied: null,
    missingSecondaryKeys: [],
    ...overrides,
  };
}

export function getEligibleSourcesForEntry(entry, session = {}, recursionTexts = []) {
  const sources = [...(session.chatMessages ?? [])];

  if (entry.matchPersonaDescription) {
    sources.push(...(session.fieldSources ?? []).filter(source => source.sourceType === 'persona'));
  }
  if (entry.matchCharacterDescription) {
    sources.push(...(session.fieldSources ?? []).filter(source => source.sourceType === 'characterDescription'));
  }
  if (entry.matchCharacterPersonality) {
    sources.push(...(session.fieldSources ?? []).filter(source => source.sourceType === 'characterPersonality'));
  }
  if (entry.matchCharacterDepthPrompt) {
    sources.push(...(session.fieldSources ?? []).filter(source => source.sourceType === 'characterDepthPrompt'));
  }
  if (entry.matchScenario) {
    sources.push(...(session.fieldSources ?? []).filter(source => source.sourceType === 'scenario'));
  }
  if (entry.matchCreatorNotes) {
    sources.push(...(session.fieldSources ?? []).filter(source => source.sourceType === 'creatorNotes'));
  }

  sources.push(...(session.injectionSources ?? []));
  sources.push(...recursionTexts.map((text, index) => ({ sourceType: 'recursion', index, text })));

  return sources.filter(source => String(source.text ?? '').trim());
}

export function createMatcher({ parseRegexFromString, world_info_logic } = {}) {
  const logic = { ...FALLBACK_WORLD_INFO_LOGIC, ...(world_info_logic ?? {}) };

  function findMatchesForKeys(keys, sources, entry, settings, session) {
    const matchSettings = getEffectiveMatchSettings(entry, session);
    return (keys ?? []).flatMap(key => (
      findMatchesForKey({ key, sources, entry, settings, parseRegexFromString, matchSettings })
    )).sort(compareMatches);
  }

  function explainEntry(entry, session, recursionTexts = [], settings = {}) {
    const sources = getEligibleSourcesForEntry(entry, session, recursionTexts);
    const primaryMatches = findMatchesForKeys(entry.key, sources, entry, settings, session);
    if (!primaryMatches.length) {
      return baseExplanation();
    }

    const primaryMatch = primaryMatches[0];
    const explanationBase = {
      reasonType: 'keyword',
      sourceType: primaryMatch.sourceType,
      sourceMessageIndex: primaryMatch.sourceMessageIndex,
      sourceDepth: primaryMatch.sourceDepth,
      snippet: primaryMatch.snippet,
      matchCount: primaryMatches.length,
      hasMultipleMatches: primaryMatches.length > 1,
      primaryMatches,
    };

    const hasSecondaryKeywords = Boolean(
      entry.selective
        && Array.isArray(entry.keysecondary)
        && entry.keysecondary.some(key => trimKey(key))
    );

    if (!hasSecondaryKeywords) {
      return baseExplanation(explanationBase);
    }

    const secondaryKeys = entry.keysecondary.map(trimKey).filter(Boolean);
    const secondaryMatchesByKey = new Map();
    const missingSecondaryKeys = [];

    for (const key of secondaryKeys) {
      const matches = findMatchesForKey({
        key,
        sources,
        entry,
        settings,
        parseRegexFromString,
        matchSettings: getEffectiveMatchSettings(entry, session),
      });
      if (matches.length) {
        secondaryMatchesByKey.set(key, matches[0]);
      } else {
        missingSecondaryKeys.push(key);
      }
    }

    const secondaryMatches = secondaryKeys
      .filter(key => secondaryMatchesByKey.has(key))
      .map(key => secondaryMatchesByKey.get(key));
    const selectiveLogic = entry.selectiveLogic ?? logic.AND_ANY;
    const anyMatched = secondaryMatches.length > 0;
    const allMatched = missingSecondaryKeys.length === 0;

    let satisfied = false;
    if (selectiveLogic === logic.AND_ANY) satisfied = anyMatched;
    if (selectiveLogic === logic.AND_ALL) satisfied = allMatched;
    if (selectiveLogic === logic.NOT_ANY) satisfied = !anyMatched;
    if (selectiveLogic === logic.NOT_ALL) satisfied = !allMatched;

    return baseExplanation({
      ...explanationBase,
      reasonType: satisfied ? 'keyword' : 'secondary_not_satisfied',
      secondaryMatches,
      secondaryLogic: selectiveLogic,
      secondaryLogicSatisfied: satisfied,
      missingSecondaryKeys,
    });
  }

  return { explainEntry };
}
