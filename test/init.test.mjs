import test from 'node:test';
import assert from 'node:assert/strict';
import { formatExtensionStatus } from '../src/init.mjs';

test('formatExtensionStatus reports installed ImageAssistant extension', () => {
  assert.equal(
    formatExtensionStatus({ extensionPath: '/chrome/ImageAssistant/1.70.7_0', degraded: false }),
    'ImageAssistant: /chrome/ImageAssistant/1.70.7_0'
  );
});
