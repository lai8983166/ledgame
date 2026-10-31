import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationSettingsValidation } from '../src/lib/applicationSettingsValidation.js';

const valid = { applicationTitle: 'LED Game', touchExitPassword: '123456', entryMethod: 'touch', coinCount: 1, touchPreparationTimeoutSeconds: 20,
  touchIdlePromptFontSize: 72, secondaryIdlePromptFontSize: 96, secondaryIdleSubtitleFontSize: 48,
  secondaryIdlePromptText: 'Top', secondaryIdleSubtitleText: '', memberPlatformHost: '127.0.0.1', memberPlatformPort: 8090 };

test('settings preflight rejects invalid text, numbers and password without writing; blank password preserves the saved value', () => {
  assert.deepEqual(applicationSettingsValidation(valid), {});
  assert.deepEqual(applicationSettingsValidation({ ...valid, touchExitPassword: '' }), {});
  for (const [field, values] of Object.entries({
    applicationTitle: ['', 'x'.repeat(65)], touchExitPassword: ['abc1', '123', '1'.repeat(13)],
    coinCount: [0, 1.5, 1000, '1'], touchPreparationTimeoutSeconds: [0, 20.5, 3601],
    touchIdlePromptFontSize: [5, 72.5, 201], secondaryIdlePromptFontSize: [31, 200.1], secondaryIdleSubtitleFontSize: [31, 201],
    secondaryIdlePromptText: [' ', 'x'.repeat(65)], memberPlatformHost: ['', 'http://host'], memberPlatformPort: [0, 8090.5, 65536],
  })) for (const value of values) assert.ok(applicationSettingsValidation({ ...valid, [field]: value })[field], `${field}: ${value}`);
});
