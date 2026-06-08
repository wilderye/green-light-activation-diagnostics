import {
  chat,
  eventSource,
  event_types,
  extension_prompts,
  getCharacterCardFields,
  saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import {
  parseRegexFromString,
  world_info_case_sensitive,
  world_info_logic,
  world_info_match_whole_words,
  world_info_position,
} from '../../../world-info.js';
import { createActivationRuntime } from './src/activation.js';

function getWorldInfoMatchSettings() {
  return {
    caseSensitive: Boolean(world_info_case_sensitive),
    matchWholeWords: Boolean(world_info_match_whole_words),
  };
}

const nativeDeps = {
  chat,
  eventSource,
  event_types,
  extension_prompts,
  getCharacterCardFields,
  saveSettingsDebounced,
  extension_settings,
  parseRegexFromString,
  world_info_logic,
  world_info_position,
  getWorldInfoMatchSettings,
};

const activation = createActivationRuntime({
  nativeDeps,
  createController: async deps => {
    const { createExtensionController } = await import('./src/controller.js');
    return createExtensionController(deps);
  },
});

activation.startLegacyFallback();

export async function activateGreenLightActivationDiagnostics() {
  return activation.activateFromHook();
}

globalThis.greenLightActivationDiagnostics_captureGenerationInput = async (coreChat, contextSize, abort, type) => {
  return activation.captureGenerationInput(coreChat, contextSize, abort, type);
};
