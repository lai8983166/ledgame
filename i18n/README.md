# Localization workflow

Vue source uses stable `t("domain.key")` references. English is the source catalog. Runtime catalogs merge explicit locale translations over English, while reports inspect authored catalogs before fallback.

- `npm run i18n:report` prints explicit translation coverage and existing unmarked Vue copy.
- `npm run i18n:extract` writes only missing entries to `translation-queue.json`, preserving drafts already entered there.
- Fill queue `translation` fields and run `npm run i18n:import`; completed values are persisted in `src/i18n/generated-translations.js` and the queue is regenerated.
- `npm run i18n:check` validates all flags, source keys, interpolation variables, critical language-selector copy, and prevents new unmarked Vue literals.

The unmarked baseline is legacy migration debt, not an allowlist for new copy. New interface text must use a stable translation key.
