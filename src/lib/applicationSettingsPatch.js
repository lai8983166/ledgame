export function createApplicationSettingsPatch(settings) {
  const patch = {
    entryMethod: settings?.entryMethod,
    mode: 'game',
    touchIdlePromptTexts: {
      ...(settings?.touchIdlePromptTexts || {}),
    },
    touchIdlePromptFontSize: settings?.touchIdlePromptFontSize,
  };
  if (settings && Object.prototype.hasOwnProperty.call(settings, "secondaryIdlePromptText")) {
    patch.secondaryIdlePromptText = settings.secondaryIdlePromptText;
  }
  if (settings && Object.hasOwn(settings, 'secondaryIdleSubtitleText')) patch.secondaryIdleSubtitleText = settings.secondaryIdleSubtitleText;
  if (settings && Object.hasOwn(settings, 'secondaryIdleSubtitleFontSize')) patch.secondaryIdleSubtitleFontSize = settings.secondaryIdleSubtitleFontSize;
  if (settings && Object.hasOwn(settings, 'touchPreparationTimeoutSeconds')) patch.touchPreparationTimeoutSeconds = settings.touchPreparationTimeoutSeconds;
  if (settings && Object.hasOwn(settings, 'coinCount')) patch.coinCount = settings.coinCount;
  if (settings && Object.prototype.hasOwnProperty.call(settings, "secondaryIdlePromptFontSize")) {
    patch.secondaryIdlePromptFontSize = settings.secondaryIdlePromptFontSize;
  }
  if (settings && Object.prototype.hasOwnProperty.call(settings, "applicationTitle")) {
    patch.applicationTitle = settings.applicationTitle;
  }
  if (settings && Object.prototype.hasOwnProperty.call(settings, "secondaryDisplayBackgroundPath")) {
    patch.secondaryDisplayBackgroundPath = settings.secondaryDisplayBackgroundPath || null;
  }
  if (settings && Object.prototype.hasOwnProperty.call(settings, "secondaryIdleMediaPath")) {
    patch.secondaryIdleMediaPath = settings.secondaryIdleMediaPath || null;
  }
  if (settings && Object.prototype.hasOwnProperty.call(settings, "memberPlatformHost")) {
    patch.memberPlatformHost = settings.memberPlatformHost;
  }
  if (settings && Object.prototype.hasOwnProperty.call(settings, "memberPlatformPort")) {
    patch.memberPlatformPort = settings.memberPlatformPort;
  }
  if (settings?.touchExitPassword) patch.touchExitPassword = settings.touchExitPassword;
  return patch;
}
