import { entryKey } from './scan-collector.js';

function getGroups(entry) {
  return String(entry?.group ?? '')
    .split(',')
    .map(group => group.trim())
    .filter(Boolean);
}

export function isGreenLightEntry(entry) {
  return Boolean(
    entry
      && !entry.disable
      && !entry.constant
      && Array.isArray(entry.key)
      && entry.key.some(key => String(key ?? '').trim())
  );
}

export function getEntryDisplayName(entry) {
  return entry?.comment?.trim?.() || `UID ${entry?.uid ?? '?'}`;
}

function hasTimedEffect(entry, collected, type) {
  const key = entryKey(entry);
  return (collected.loops ?? []).some(loop => (
    loop.timedEffectEntries?.[type]?.some(item => entryKey(item) === key)
  ));
}

function hasGenerationTypeMismatch(entry, collected) {
  const generationType = collected?.session?.generationType;
  return Array.isArray(entry?.triggers)
    && entry.triggers.length > 0
    && generationType != null
    && !entry.triggers.includes(generationType);
}

export function classifyNativeOutcome(entry, collected = {}, pluginExplanation = {}) {
  const key = entryKey(entry);
  const finalActivatedEntries = collected.finalActivatedEntries ?? [];
  const finalKeys = new Set(finalActivatedEntries.map(entryKey));
  if (finalKeys.has(key)) {
    return {
      status: 'joined',
      reasonType: hasTimedEffect(entry, collected, 'sticky') ? 'sticky' : 'native_joined',
    };
  }

  if (pluginExplanation.reasonType === 'secondary_not_satisfied') {
    return { status: 'matched_not_joined', reasonType: 'secondary_not_satisfied' };
  }

  const probabilityFailed = collected.loops?.some(loop => (
    loop.probabilityFailed?.some(item => entryKey(item) === key)
  ));
  if (probabilityFailed) {
    return { status: 'matched_not_joined', reasonType: 'probability_failed' };
  }

  if (hasTimedEffect(entry, collected, 'cooldown')) {
    return { status: 'matched_not_joined', reasonType: 'cooldown_active' };
  }

  if (hasTimedEffect(entry, collected, 'delay')) {
    return { status: 'matched_not_joined', reasonType: 'delay_active' };
  }

  const entryGroups = getGroups(entry);
  const sameGroupWinner = entryGroups.length > 0 && finalActivatedEntries.some(item => {
    if (entryKey(item) === key) return false;
    const itemGroups = new Set(getGroups(item));
    return entryGroups.some(group => itemGroups.has(group));
  });
  if (sameGroupWinner) {
    return { status: 'matched_not_joined', reasonType: 'group_loser' };
  }

  const budgetOverflowed = collected.loops?.some(loop => loop.budget?.overflowed);
  if (budgetOverflowed) {
    return { status: 'matched_not_joined', reasonType: 'budget_blocked' };
  }

  if (hasGenerationTypeMismatch(entry, collected)) {
    return { status: 'matched_not_joined', reasonType: 'generation_type_filtered' };
  }

  return { status: 'matched_not_joined', reasonType: 'matched_not_joined_unknown' };
}
