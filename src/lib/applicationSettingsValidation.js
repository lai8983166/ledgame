const inRange = (value, min, max) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const length = value => Array.from(typeof value === 'string' ? value.trim() : '').length;

export function applicationSettingsValidation(settings) {
  const errors = {};
  if (length(settings.applicationTitle) < 1 || length(settings.applicationTitle) > 64) errors.applicationTitle = ['applicationSettings.validation.text', { min: 1, max: 64 }];
  // An empty password keeps the saved password, matching the existing patch contract.
  if (settings.touchExitPassword && !/^\d{4,12}$/.test(settings.touchExitPassword)) errors.touchExitPassword = ['applicationSettings.validation.password'];
  if (!['touch', 'coin', 'wristband'].includes(settings.entryMethod)) errors.entryMethod = ['applicationSettings.validation.required'];
  if (!inRange(settings.coinCount, 1, 999)) errors.coinCount = ['applicationSettings.validation.integer', { min: 1, max: 999 }];
  if (!inRange(settings.touchPreparationTimeoutSeconds, 1, 3600)) errors.touchPreparationTimeoutSeconds = ['applicationSettings.validation.integer', { min: 1, max: 3600 }];
  for (const field of ['touchIdlePromptFontSize', 'secondaryIdlePromptFontSize', 'secondaryIdleSubtitleFontSize']) {
    if (!inRange(settings[field], 32, 200)) errors[field] = ['applicationSettings.validation.integer', { min: 32, max: 200 }];
  }
  if (length(settings.secondaryIdlePromptText) < 1 || length(settings.secondaryIdlePromptText) > 64) errors.secondaryIdlePromptText = ['applicationSettings.validation.text', { min: 1, max: 64 }];
  if (length(settings.secondaryIdleSubtitleText) > 64) errors.secondaryIdleSubtitleText = ['applicationSettings.validation.text', { min: 0, max: 64 }];
  if (!settings.memberPlatformHost?.trim() || /[/:]/.test(settings.memberPlatformHost)) errors.memberPlatformHost = ['applicationSettings.memberPlatform.invalid'];
  if (!inRange(settings.memberPlatformPort, 1, 65535)) errors.memberPlatformPort = ['applicationSettings.memberPlatform.invalid'];
  return errors;
}
