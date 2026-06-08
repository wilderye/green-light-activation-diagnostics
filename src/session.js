function snapshotWorldInfoMatchSettings(getWorldInfoMatchSettings) {
  try {
    const settings = getWorldInfoMatchSettings?.() ?? {};
    return {
      caseSensitive: Boolean(settings.caseSensitive),
      matchWholeWords: Boolean(settings.matchWholeWords),
    };
  } catch {
    return {
      caseSensitive: false,
      matchWholeWords: false,
    };
  }
}

export function createSessionStore({ getCharacterCardFields, extension_prompts, getWorldInfoMatchSettings } = {}) {
  let activeSession = null;
  let nextId = 1;

  function captureGenerationInput(coreChat = [], contextSize, abort, type = 'normal') {
    const chatMessages = coreChat.map((message, position) => ({
      sourceType: 'chat',
      messageIndex: message.index,
      depth: coreChat.length - position - 1,
      role: message.is_user ? 'user' : 'assistant',
      name: message.name ?? '',
      text: String(message.mes ?? ''),
    }));

    const fields = getCharacterCardFields?.() ?? {};
    const fieldSources = [
      ['persona', fields.persona],
      ['characterDescription', fields.description],
      ['characterPersonality', fields.personality],
      ['characterDepthPrompt', fields.charDepthPrompt],
      ['scenario', fields.scenario],
      ['creatorNotes', fields.creatorNotes],
    ]
      .filter(([, text]) => String(text ?? '').trim())
      .map(([sourceType, text]) => ({ sourceType, text: String(text) }));

    const injectionSources = Object.entries(extension_prompts ?? {})
      .filter(([, prompt]) => prompt?.scan && String(prompt.value ?? '').trim())
      .map(([key, prompt]) => ({
        sourceType: 'injection',
        key,
        depth: prompt.depth ?? 0,
        role: prompt.role ?? null,
        text: String(prompt.value),
      }));

    activeSession = {
      id: nextId++,
      generationType: type ?? 'normal',
      contextSize,
      createdAt: new Date().toISOString(),
      chatMessages,
      fieldSources,
      injectionSources,
      worldInfoMatchSettings: snapshotWorldInfoMatchSettings(getWorldInfoMatchSettings),
    };
    return activeSession;
  }

  function consumeActiveSession() {
    const session = activeSession;
    activeSession = null;
    return session;
  }

  return {
    captureGenerationInput,
    getActiveSession: () => activeSession,
    consumeActiveSession,
  };
}
