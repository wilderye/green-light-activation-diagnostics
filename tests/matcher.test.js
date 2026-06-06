import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatcher,
  getEligibleSourcesForEntry,
} from '../src/matcher.js';

const worldInfoLogic = {
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
};

function parseRegexFromString(input) {
  const match = String(input).match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
  if (!match) return null;
  try {
    return new RegExp(match[1].replace('\\/', '/'), match[2]);
  } catch {
    return null;
  }
}

function makeMatcher() {
  return createMatcher({
    parseRegexFromString,
    world_info_logic: worldInfoLogic,
  });
}

const session = {
  chatMessages: [
    { sourceType: 'chat', messageIndex: 1, depth: 1, text: 'old lamp' },
    { sourceType: 'chat', messageIndex: 2, depth: 0, text: 'new Lamp and brass' },
  ],
  fieldSources: [
    { sourceType: 'persona', text: 'persona needle' },
    { sourceType: 'characterDescription', text: 'description clue' },
  ],
  injectionSources: [
    { sourceType: 'injection', key: 'scan', depth: 0, text: 'injected clue' },
  ],
};

test('getEligibleSourcesForEntry includes chat, enabled fields, injections, and recursion', () => {
  const sources = getEligibleSourcesForEntry(
    { matchPersonaDescription: true, matchCharacterDescription: false },
    session,
    ['recursive clue'],
  );

  assert.deepEqual(sources.map(source => source.sourceType), [
    'chat',
    'chat',
    'persona',
    'injection',
    'recursion',
  ]);
});

test('matcher finds plaintext keys case-insensitively by default', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'] },
    session,
    [],
    { includeSnippets: true, snippetRadius: 12 },
  );

  assert.equal(explanation.reasonType, 'keyword');
  assert.equal(explanation.primaryMatches[0].key, 'lamp');
  assert.equal(explanation.sourceMessageIndex, 2);
  assert.match(explanation.snippet, /Lamp/);
});

test('matcher respects case-sensitive entries', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'], caseSensitive: true },
    { ...session, chatMessages: [{ sourceType: 'chat', messageIndex: 1, depth: 0, text: 'LAMP' }] },
    [],
    {},
  );

  assert.equal(explanation.reasonType, 'unexplained');
  assert.equal(explanation.primaryMatches.length, 0);
});

test('matcher respects whole-word matching for single words', () => {
  const matcher = makeMatcher();
  const miss = matcher.explainEntry(
    { key: ['cat'], matchWholeWords: true },
    { chatMessages: [{ sourceType: 'chat', messageIndex: 1, depth: 0, text: 'concatenate' }] },
    [],
    {},
  );
  const hit = matcher.explainEntry(
    { key: ['cat'], matchWholeWords: true },
    { chatMessages: [{ sourceType: 'chat', messageIndex: 1, depth: 0, text: 'a cat!' }] },
    [],
    {},
  );

  assert.equal(miss.reasonType, 'unexplained');
  assert.equal(hit.reasonType, 'keyword');
  assert.equal(hit.primaryMatches[0].match, 'cat');
});

test('matcher uses native regex parser when a key is regex-shaped', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['/silver\\s+key/i'] },
    { chatMessages: [{ sourceType: 'chat', messageIndex: 1, depth: 0, text: 'The Silver key turns.' }] },
    [],
    {},
  );

  assert.equal(explanation.reasonType, 'keyword');
  assert.equal(explanation.primaryMatches[0].match, 'Silver key');
});

test('matcher prefers the closest chat source when the same key appears multiple times', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'] },
    session,
    [],
    {},
  );

  assert.equal(explanation.sourceType, 'chat');
  assert.equal(explanation.sourceMessageIndex, 2);
  assert.equal(explanation.matchCount, 2);
  assert.equal(explanation.hasMultipleMatches, true);
});

test('matcher handles AND ANY secondary logic', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'], selective: true, keysecondary: ['brass', 'missing'], selectiveLogic: worldInfoLogic.AND_ANY },
    session,
    [],
    {},
  );

  assert.equal(explanation.reasonType, 'keyword');
  assert.equal(explanation.secondaryLogicSatisfied, true);
  assert.deepEqual(explanation.secondaryMatches.map(match => match.key), ['brass']);
});

test('matcher handles AND ALL secondary logic', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'], selective: true, keysecondary: ['new', 'brass'], selectiveLogic: worldInfoLogic.AND_ALL },
    session,
    [],
    {},
  );

  assert.equal(explanation.reasonType, 'keyword');
  assert.equal(explanation.secondaryLogicSatisfied, true);
  assert.deepEqual(explanation.secondaryMatches.map(match => match.key), ['new', 'brass']);
});

test('matcher explains NOT ANY as missing secondary keys, not fake hits', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'], selective: true, keysecondary: ['violet', 'silver'], selectiveLogic: worldInfoLogic.NOT_ANY },
    session,
    [],
    {},
  );

  assert.equal(explanation.reasonType, 'keyword');
  assert.equal(explanation.secondaryLogicSatisfied, true);
  assert.deepEqual(explanation.secondaryMatches, []);
  assert.deepEqual(explanation.missingSecondaryKeys, ['violet', 'silver']);
});

test('matcher explains NOT ALL with real positive matches and missing keys separated', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'], selective: true, keysecondary: ['brass', 'silver'], selectiveLogic: worldInfoLogic.NOT_ALL },
    session,
    [],
    {},
  );

  assert.equal(explanation.reasonType, 'keyword');
  assert.equal(explanation.secondaryLogicSatisfied, true);
  assert.deepEqual(explanation.secondaryMatches.map(match => match.key), ['brass']);
  assert.deepEqual(explanation.missingSecondaryKeys, ['silver']);
});

test('matcher marks secondary logic as unsatisfied when AND ALL is missing a key', () => {
  const explanation = makeMatcher().explainEntry(
    { key: ['lamp'], selective: true, keysecondary: ['brass', 'silver'], selectiveLogic: worldInfoLogic.AND_ALL },
    session,
    [],
    {},
  );

  assert.equal(explanation.reasonType, 'secondary_not_satisfied');
  assert.equal(explanation.secondaryLogicSatisfied, false);
  assert.deepEqual(explanation.missingSecondaryKeys, ['silver']);
});
