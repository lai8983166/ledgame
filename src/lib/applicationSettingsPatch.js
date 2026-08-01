export function createApplicationSettingsPatch(settings) {
  return {
    entryMethod: settings?.entryMethod,
    mode: settings?.mode,
    touchIdlePromptTexts: {
      ...(settings?.touchIdlePromptTexts || {}),
    },
    touchIdlePromptFontSize: settings?.touchIdlePromptFontSize,
  };
}
