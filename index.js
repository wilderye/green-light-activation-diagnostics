import {
  chat,
  eventSource,
  event_types,
  extension_prompts,
  getCharacterCardFields,
  saveChatConditional,
  saveSettingsDebounced,
  syncMesToSwipe,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { parseRegexFromString, world_info_logic, world_info_position } from '../../../world-info.js';

const nativeDeps = {
  chat,
  eventSource,
  event_types,
  extension_prompts,
  getCharacterCardFields,
  saveChatConditional,
  saveSettingsDebounced,
  syncMesToSwipe,
  extension_settings,
  parseRegexFromString,
  world_info_logic,
  world_info_position,
};

let controller;

export async function activateGreenLightActivationDiagnostics() {
  const { createExtensionController } = await import('./src/controller.js');
  controller = createExtensionController(nativeDeps);
  controller.activate();
}

globalThis.greenLightActivationDiagnostics_captureGenerationInput = async (coreChat, contextSize, abort, type) => {
  controller?.captureGenerationInput(coreChat, contextSize, abort, type);
};
