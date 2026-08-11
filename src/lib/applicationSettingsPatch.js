export function createApplicationSettingsPatch(settings) {
  const patch = {
    entryMethod: settings?.entryMethod,
    mode: settings?.mode,
    touchIdlePromptTexts: {
      ...(settings?.touchIdlePromptTexts || {}),
    },
    touchIdlePromptFontSize: settings?.touchIdlePromptFontSize,
  };
  if (settings && Object.prototype.hasOwnProperty.call(settings, "memberPlatformHost")) {
    patch.memberPlatformHost = settings.memberPlatformHost;
  }
  if (settings && Object.prototype.hasOwnProperty.call(settings, "memberPlatformPort")) {
    patch.memberPlatformPort = settings.memberPlatformPort;
  }
  return patch;
}
