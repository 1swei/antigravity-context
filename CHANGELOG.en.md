# Antigravity Context Changelog

[简体中文](CHANGELOG.md) · **English**

- **Plugin ID**: `antigravity-context` (Display name: `Antigravity Context`)
- **Current Version**: `1.0.1` (forked from the open-source `antigrative-dashboard` / `antigravity-pulse` `0.8.20` baseline)
- **Updated**: `2026-11-16`

---

## v1.0.1 (`2026-11-16`)

- **Compact Inline Speed Chip**: Hid the turns and steps prefix (`#rounds`) before `tok/s` on the inline composer bar, keeping only `tok/s` visible (turns & steps remain inside the hover details card).

---

## v1.0.0 (`2026-11-16`)

- **Auto Update Check & Online Install in Usage Modal**: Re-enabled `AppUpdater` in [main.mjs](sidecars/panel/main.mjs) with silent startup and 6-hour periodic GitHub Releases checks; added a top-right update button in the usage analytics modal with a red-dot notification badge, release notes, download progress bar, SHA-256 verified online install, and plugin reload; updated [update-worker.py](compat/update-worker.py) for `antigravity-context-{version}.zip` and added `.github/workflows/release.yml`.
- **Unified Plugin ID to `antigravity-context`**: Updated `plugin.json`, `sidecars/panel/package.json`, `main.mjs`, `history.mjs`, `compat/platform.mjs`, `compat/ipc-host.cjs`, `compat/update-worker.py`, `updater.mjs`, and unit tests to `antigravity-context` so users can clone directly into `~/.gemini/config/plugins/antigravity-context`.
- **Removed Right-Pane Auxiliary Dashboard**: Set `has_web_ui: false` and removed `ui_config` in `sidecars/panel/sidecar.json`; deleted right-pane frontend assets (`index.html`, `styles.css`, `app.js`, `panel-source.mjs`, `toolbar-preview.html`, `sdk.mjs` and their tests) and updated [main.mjs](sidecars/panel/main.mjs) to run purely as a headless background collector and inline CDP injector.
- **Branding & Versioning**: Renamed display name to **Antigravity Context**, bumped version to `1.0.0` across manifests, and redesigned [logo.svg](assets/logo.svg) with a segmented context-ring and pulse motif.
- **Open-Source Release Cleanup**: Removed unused `compat/update-ui.cjs`, added [LICENSE](LICENSE) (MIT with upstream attribution), bilingual [README.md](README.md) / [README.en.md](README.en.md), [.gitignore](.gitignore), and [LONG_CONVERSATIONS.md](docs/LONG_CONVERSATIONS.md), and replaced dead 404 upstream URLs and local machine paths.

---

## Prior Self-Maintained Iterations (`2026-11-14`)

### 1. Heatmap Simplification & Unified Date Filters
Files: [usage-ui.cjs](compat/usage-ui.cjs), [custom-ui.test.mjs](sidecars/panel/tests/custom-ui.test.mjs)

- **Streamlined Activity Heatmap**: Removed the weekly heatmap toggle (`#heat-controls`) and weekly grid view, keeping the yearly daily contribution heatmap and year selector (`#year`).
- **Streamlined Model Breakdown**: Removed the `By Model | By Composition` toggle (`#chart-mode-controls`), keeping the 9-column model breakdown table (Model, Share, Total, Uncached, Cache read, Cache write, Output, Requests, Hit rate).
- **Unified Segmented Filter (`#date-filter`)**: Added `Last 7 days` (`7d`), `Last 30 days` (`30d`), `YYYY-MM ▾` (`month`), `{year}` (`year`), and `Custom ▾` (`custom`) with an active range badge (`#range-display`).
- **Cross-Linked Drilldown**: Linked year selector `#year`, heatmap month headers/day cells, bar chart columns, and the model breakdown table.

### 2. Host Visual Integration & Cleanup
Files: [theme.cjs](compat/theme.cjs), [main.mjs](sidecars/panel/main.mjs), [inline-widget.cjs](compat/inline-widget.cjs), [i18n.cjs](compat/i18n.cjs)

- **Host Theme & Font Sync**: Adopted Antigravity `--background`, `--card`, `--foreground`, `--primary`, `--card-border`, `--secondary`, `--editor-font-family`, and `theme-light`/`theme-dark` classes; removed hardcoded `Microsoft YaHei`.
- **Disabled Self-Updater**: Passed `updater: null` to `RuntimeUi` and omitted `__agPulseUpdateFactory`.
- **UI Cleanup**: Removed quota-group UI blocks (`quota-group` / `quota-overview` / `five-details` / `week-details`) and the context-popover language switcher while retaining `zh-CN` / `en` / `zh-TW` switching in the usage modal.
- **Empty-Chat & Context Details**: Displayed `0` / `0%` on empty new conversations, responsive `compact -> tight -> icons-only` collapse on narrow composers, and segmented context bars (`ctx-seg-sys` / `ctx-seg-tools` / `ctx-seg-msg` / `ctx-seg-other`).

### 3. Metrics, Context & Transcript Calibration
Files: [metrics.mjs](sidecars/panel/metrics.mjs), [context.mjs](sidecars/panel/context.mjs), [usage.mjs](sidecars/panel/usage.mjs), [transcript.mjs](sidecars/panel/transcript.mjs)

- **Usage Ledger Calibration**: Bucketed by request time (falling back to planner timestamp), deduplicated across conversations, counted thinking tokens once, weighted cache hit rate by input tokens (excluding cache writes from hits), and isolated IDE vs desktop ledgers.
- **Context Occupancy & Capacity Calibration**: Used the latest request snapshot rather than cumulative usage, prioritized server-reported actual usage over `estimatedTokensUsed`, and normalized Antigravity 2.x/4.x model aliases.
- **Transcript Breakdown Parsing**: Excluded pre-compaction history, handled undo/revisions via explicit step indexes, and avoided reading or retaining tool arguments or media payloads.

---

### Verification Reference
```bash
node --check sidecars/panel/main.mjs
node --test sidecars/panel/tests/custom-ui.test.mjs sidecars/panel/tests/runtime-ui.test.mjs sidecars/panel/tests/startup.test.mjs sidecars/panel/tests/usage.test.mjs sidecars/panel/tests/i18n.test.mjs sidecars/panel/tests/context.test.mjs sidecars/panel/tests/transcript.test.mjs
```
> Note: `sidecars/panel/tests/entry-usage.test.mjs` includes an IDE entrypoint check (`ide/main.mjs`) that only runs when the IDE package is present alongside the desktop plugin; on Windows, 1 Unix socket probe test in `platform.test.mjs` is skipped.
