# Media preview, object merge, and localization

## Media library audio preview

The media library classifies audio through the existing Electron media API and
uses the restricted `led-media://` preview URL. The renderer does not receive a
filesystem path or Node access.

- Supported media classifications include MP3, WAV, OGG, M4A, AAC, and FLAC.
- Selecting audio renders native controls with `preload="metadata"`; playback
  never starts automatically.
- Audio uses a wide, low horizontal preview stage with the filename and native
  controls arranged side by side instead of the square image/video stage.
- Selecting another file, refreshing the tree, or leaving the view pauses the
  old player and releases its source.
- Decode errors stay inside the preview panel and do not disable the media tree.

## Simple object merge

The Simple editor can merge two or more objects when their normalized colors
match. Single-cell and multi-cell objects use the same operation.

1. The first selected object's `x/y` remains the merged anchor.
2. Every source point is converted to an absolute matrix coordinate.
3. Duplicate absolute cells are removed without clipping panorama coordinates.
4. The union is converted back to relative `points` with a stable order.
5. Source objects are removed and the new object is appended to the frame.

The saved document still uses the existing `id/x/y/color/points` structure.
Mixed colors and stale selections fail without changing the frame. Display and
input continue to use the Simple green-priority overlap policy.

## Application language

The Language tab supports `zh-CN`, `en-US`, `ru-RU`, `ko-KR`, and `ja-JP`.
Each option displays a country flag, the language's own name, and its locale.
`zh-CN` is both the default and fallback locale. A change is applied immediately
and does not recreate views or clear editor, runtime, or media state.

Electron main owns the preference in
`userData/settings/language.json`, validates the locale allowlist, writes it
atomically, and broadcasts successful changes to every live window. Renderers
only use the preload `get/set/onChanged` API. Browser-only development falls
back to protected local storage and a `BroadcastChannel`.

Localized content covers application-owned headings, controls, status text,
tooltips, titles, and accessibility labels. Game and level names, object IDs,
media paths, user input, database content, and backend free-text messages remain
verbatim.

## Verification

Run:

```bash
pnpm test
pnpm build
pnpm run portable:dir
openspec validate enhance-media-merge-and-localization --strict
```

The localization tests require both catalogs to expose identical keys and scan
Vue/JavaScript UI sources for Han interface text outside the locale catalog.
