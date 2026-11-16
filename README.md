# Antigravity Context

**Antigravity Context** (plugin ID: `antigravity-pulse`) is a lightweight, local-first Antigravity plugin that injects an inline context window & telemetry bar into the chat composer and provides an interactive Token usage analytics modal.

- **Inline Context Bar**: Real-time context window occupancy (`0` / `0%` on empty conversations), segmented breakdown (`System prompt`, `Tool calls`, `Messages`, `Host overhead & other`), model generation speed (`tok/s` / TTFT), and cache hit rate.
- **Usage Analytics Modal**: Yearly activity heatmap, per-model breakdown bar chart and table, and unified date filters (`Last 7 days`, `Last 30 days`, `Month`, `Year`, `Custom`).
- **Host-Adaptive Theme & Multilingual UI**: Automatically follows Antigravity light/dark theme tokens and fonts; supports English, Simplified Chinese (`zh-CN`), and Traditional Chinese (`zh-TW`).
- **Local-First & Headless**: Runs as a headless background sidecar (`has_web_ui: false`, no right-pane tab), with in-app self-update checks disabled (`updater: null`).

---

## Installation

Place this directory at `~/.gemini/config/plugins/antigravity-pulse` (for example via `git clone`):

```bash
git clone https://github.com/1swei/antigravity-context.git ~/.gemini/config/plugins/antigravity-pulse
```

Then enable **Antigravity Context** in Antigravity's Plugin Manager (or reload the window).

> **Note**: Keep the plugin directory name as `antigravity-pulse` so it matches `plugin.json` (`"name": "antigravity-pulse"`), `config.json` enable/disable state, and local sidecar storage paths.

---

## Testing

Requires Node.js >= 20:

```bash
node --check sidecars/panel/main.mjs
node --test sidecars/panel/tests/custom-ui.test.mjs sidecars/panel/tests/runtime-ui.test.mjs sidecars/panel/tests/startup.test.mjs sidecars/panel/tests/usage.test.mjs sidecars/panel/tests/i18n.test.mjs sidecars/panel/tests/context.test.mjs sidecars/panel/tests/transcript.test.mjs
```

> Note: `sidecars/panel/tests/entry-usage.test.mjs` includes an IDE entrypoint check (`ide/main.mjs`) that only runs when the IDE package is present alongside the desktop plugin; the `app` and `preview` cases pass standalone.

---

## Origin & License

This project is a derivative fork based on the MIT-licensed `antigrative-dashboard` (`antigravity-pulse` v0.8.20 baseline) originally created by `YOU-SHOULD-KNOW-ME`. The original upstream GitHub repository (`https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard`) is no longer available (HTTP 404).

Major changes in `1.0.0`:
- Removed the right-side auxiliary pane web dashboard (`has_web_ui: false`, `ui_config` and panel web assets removed) and updated `sidecars/panel/main.mjs` to run as a headless background collector + inline CDP injector.
- Removed quota-group UI blocks and the in-app auto-updater trigger.
- Calibrated context window occupancy (latest request actual server usage priority), transcript parsing (post-compaction filtering, undo/revision handling), and usage ledger deduplication.
- Consolidated the Token usage modal onto a single page with unified date filters (`7d`, `30d`, `month`, `year`, `custom`) and cross-linked heatmap/chart drilldown.
- Adapted inline widget and modal themes dynamically to host Antigravity light/dark CSS variables and fonts.

Licensed under the [MIT License](LICENSE).
