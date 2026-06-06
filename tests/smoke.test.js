import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionController } from '../src/controller.js';

test('controller exposes activation and interceptor methods', () => {
  const controller = createExtensionController({});
  assert.equal(typeof controller.activate, 'function');
  assert.equal(typeof controller.captureGenerationInput, 'function');
});
