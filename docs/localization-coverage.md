# Frontend localization coverage

## Locales

- Default: `zh-CN`
- Fallback: `zh-CN`
- Supported locales: `zh-CN`, `en-US`, `ru-RU`, `ko-KR`, `ja-JP`

## Static UI coverage

- Shell and navigation: `App.vue`
- Runtime debug: `DemoView.vue`, debug branch in `App.vue`, `DebugLedCanvas.vue`
- Full game flow: `LedGameTouchView.vue`, `TouchMatrixCanvas.vue`
- Game browsing and editing: `GameListView.vue`, `SimpleGameEditorView.vue`, `SimpleGameCard.vue`
- Editor controls: `EditorInteractionModeSwitch.vue`, `SimpleMatrixCanvas.vue`, `GameGlobalConfigDialog.vue`
- Media: `MediaLibraryView.vue`, `MediaPickerDialog.vue`
- Spirits: `SpiritLibraryView.vue`, `SpiritPointEditorDialog.vue`

Translate headings, buttons, labels, tooltips, `title`, `aria-label`, loading/empty/error states, and frontend-owned status labels.

## Content kept verbatim

- Game and level names
- Object IDs and media filenames/relative paths
- User-entered text and database content
- Backend free-text messages
- Product and protocol identifiers such as `Demo`, `Game ID`, RGB, and LED where their spelling is language-independent

## Preference ownership

- Electron main validates and atomically stores the application locale.
- Main, Debug Panel, and LED Game Touch subscribe through the preload API.
- Changing language updates mounted views without clearing editor or runtime state.
- Browser-only development uses local storage and `BroadcastChannel` as a fallback.

## Regression checks

- Locale catalogs must contain identical message keys.
- Vue and JavaScript UI sources may not contain Han interface copy outside
  `src/i18n/messages.js`; comments and dynamic backend/user content are excluded.
