# Antigravity Context 变更日志

**简体中文** · [English](CHANGELOG.en.md)

- **插件标识**：`antigravity-context`（展示名：`Antigravity Context`）
- **当前版本**：`1.0.0`（基于原 `antigrative-dashboard` / `antigravity-pulse` `0.8.20` 开源分支二次开发）
- **更新时间**：`2026-11-16`

---

## v1.0.0（`2026-11-16`）

- **统一插件标识为 `antigravity-context`**：`plugin.json`、`sidecars/panel/package.json`、`main.mjs`、`history.mjs`、`compat/platform.mjs`、`compat/ipc-host.cjs`、`compat/update-worker.py`、`updater.mjs` 与相关测试全部统一使用 `antigravity-context`，支持直接克隆至 `~/.gemini/config/plugins/antigravity-context`。

- **移除右侧辅助栏看板**：`sidecars/panel/sidecar.json` 设为 `has_web_ui: false` 并移除 `ui_config`；删除右侧看板前端文件（`index.html`、`styles.css`、`app.js`、`panel-source.mjs`、`toolbar-preview.html`、`sdk.mjs` 及对应单测），并更新 [main.mjs](sidecars/panel/main.mjs) 以无头 Sidecar 模式运行内联状态栏注入与用量采集。
- **品牌与版本规范化**：展示名称调整为 **Antigravity Context**，版本号统一升至 `1.0.0`（[plugin.json](plugin.json)、[sidecars/panel/package.json](sidecars/panel/package.json)），重绘上下文环形与脉冲主题矢量图标 [logo.svg](assets/logo.svg)。
- **开源发布清理**：移除未使用的更新弹窗脚本 `compat/update-ui.cjs`，补充 MIT 协议 [LICENSE](LICENSE)、[README.md](README.md)、[.gitignore](.gitignore) 与 [LONG_CONVERSATIONS.md](docs/LONG_CONVERSATIONS.md)，清理原 404 上游仓库链接与本地路径引用。

---

## 前期自维护迭代汇总（`2026-11-14`）

### 1. 热力图精简与全页统一日期筛选
涉及文件：[usage-ui.cjs](compat/usage-ui.cjs)、[custom-ui.test.mjs](sidecars/panel/tests/custom-ui.test.mjs)

- **精简活跃度热力图**：移除按周热力图切换控件（`#heat-controls`）及按周网格视图，仅保留年度每日贡献热力图与年份下拉选择（`#year`）。
- **精简模型明细模式**：移除`按模型 | 按构成`切换控件（`#chart-mode-controls`），聚焦各模型用量柱状对比；表头保留 9 列核心明细（模型、占比、总计、未缓存、缓存读、缓存写、输出、请求、命中率）。
- **统一分段筛选栏（`#date-filter`）**：支持 `近7天`（`7d`）、`近30天`（`30d`）、`YYYY-MM ▾`（`month`）、`{year}年`（`year`）与 `自定义 ▾`（`custom`），并在`模型明细`标题旁展示生效区间徽标（`#range-display`）。
- **全页双向联动**：顶部年份 `#year`、年度热力图月份/日期格与下方柱状图、模型明细表实现联动下钻。

### 2. 宿主视觉融合与功能精简
涉及文件：[theme.cjs](compat/theme.cjs)、[main.mjs](sidecars/panel/main.mjs)、[inline-widget.cjs](compat/inline-widget.cjs)、[i18n.cjs](compat/i18n.cjs)

- **主题与字体跟随宿主**：读取 Antigravity `--background`、`--card`、`--foreground`、`--primary`、`--card-border`、`--secondary`、`--editor-font-family` 与 `theme-light`/`theme-dark` 状态，清理硬编码 `Microsoft YaHei`。
- **停用检查更新**：`main.mjs` 向 `RuntimeUi` 传入 `updater: null` 且不注入 `__agPulseUpdateFactory`。
- **界面精简**：移除额度组区块（`quota-group` / `quota-overview` / `five-details` / `week-details`）及上下文浮层中的语言切换器（保留用量统计弹窗与 `i18n.cjs` 三语切换）。
- **空会话与上下文详情**：新空会话状态显示 `0` / `0%`，窄屏按 `compact -> tight -> icons-only` 阶梯收敛；上下文浮层展示系统提示词、工具调用、对话消息与其他分段条（`ctx-seg-sys` / `ctx-seg-tools` / `ctx-seg-msg` / `ctx-seg-other`）。

### 3. 统计口径、上下文与记录解析校准
涉及文件：[metrics.mjs](sidecars/panel/metrics.mjs)、[context.mjs](sidecars/panel/context.mjs)、[usage.mjs](sidecars/panel/usage.mjs)、[transcript.mjs](sidecars/panel/transcript.mjs)

- **用量统计与账本校准**：按请求时间归档并跨会话去重，思考 Token 仅计入一次，缓存命中率按输入 Token 加权计算（写缓存不计入命中），隔离 IDE 与桌面端账本。
- **上下文占比与上限校准**：以最新请求快照为依据而非累计消耗，服务端实际返回用量优先覆盖 `estimatedTokensUsed`，兼容 Antigravity 2.x/4.x 模型别名。
- **Transcript 构成解析**：排除压缩前历史，基于显式步数索引识别撤销（undo）与同索引修订，结合宿主 App 整秒时间戳与 `GENERIC` 工具行做增量估算，不读取或保留工具参数/多媒体原文。

---

### 验证命令参考
```bash
node --check sidecars/panel/main.mjs
node --test sidecars/panel/tests/custom-ui.test.mjs sidecars/panel/tests/runtime-ui.test.mjs sidecars/panel/tests/startup.test.mjs sidecars/panel/tests/usage.test.mjs sidecars/panel/tests/i18n.test.mjs sidecars/panel/tests/context.test.mjs sidecars/panel/tests/transcript.test.mjs
```
> 注：独立桌面端插件包不包含 `ide/main.mjs`，运行 `entry-usage.test.mjs` 时其中 1 条 IDE 入口用例会因缺少该文件失败，Windows 平台还会跳过 1 条 Unix 端口探测用例，其余用例均通过。
