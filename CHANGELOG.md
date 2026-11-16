# Antigravity Context 变更日志

**简体中文** · [English](CHANGELOG.en.md)

- **插件标识**：`antigravity-context`（展示名：`Antigravity Context`）
- **当前版本**：`1.0.5`（基于原 `antigrative-dashboard` / `antigravity-pulse` `0.8.20` 开源分支二次开发）
- **更新时间**：`2026-11-16`

---

## v1.0.5（`2026-11-16`）

- **智能后台同步与统一刷新逻辑**：打开用量看板与手动点击刷新统一交由后台自动判断模式（首次无台账时自动全量导入，已有台账后仅增量核验），既保证数据准确又避免每次重扫全部历史会话。
- **顶部齐平真实进度条与全程旋转反馈**：在看板卡片最顶边新增随主题色同步的 60fps 线性真实进度条，刷新按钮在真实导入期间保持连续旋转直至完成；去掉“增量/全量”技术术语与 `Asia/Shanghai · ` 时区前缀，统一显示 `导入数据中…` / `本机存储`。
- **修复永久误报与闪动提示**：分离历史单字段缺失（`partialRequests`）与真实读取失败告警，消除常驻的“部分记录暂不可读取”提示；屏蔽实时对话落盘导致的底栏 2 秒闪动，并去除活跃度副标题冗余文案。
- **性能优化与快速首屏**：纯 JSON 账本汇总增加文件级缓存避免活跃轮询重读全量历史；新会话首次查询放宽列表缓存冷却；内联状态条增加 `mount()` 快路径减少全 DOM 扫描，同时支持本机系统时区自动适配。

---

## v1.0.4（`2026-11-16`）

- **点击更新按钮强制实时检查最新**：展开右上角更新弹窗时（即使此前已检测到旧版更新），自动向 GitHub 重新拉取最新版本号，避免显示过期缓存版本。
- **更新完成后自动清理历史备份**：在校验新版本安装提交成功后，除了自动删除下载的 `.zip` 与暂存事务目录外，同步清理 `updates/backup-*` 历史备份目录，避免占用磁盘空间。
- **补充全页面亮色 / 深色主题截图**：更新 [README.md](README.md) 与 [README.en.md](README.en.md)，覆盖内联状态栏、上下文拆解、Token 明细、用量统计弹窗与更新弹窗的明暗双主题实机预览。

---

## v1.0.3（`2026-11-16`）

- **自动更新周期恢复为 6 小时**：后台静默检查保持启动后及每 6 小时检查一次，移除打开用量统计弹窗时的额外检查。
- **用量统计弹窗悬停提示融合主题**：右上角「语言 / 检查更新 / 刷新 / 关闭」按钮与顶部汇总卡片改用随宿主主题配色与字体同步的自绘悬浮提示，替换浏览器默认 `title` 弹窗。
- **修复插件说明页排版与清单元数据**：移除 `README` 中会被宿主插件页放大的外链徽章图片，并在 `plugin.json` 中补全 `displayName`、`author`、`license` 与仓库地址。

---

## v1.0.2（`2026-11-16`）

- **优化自动检查更新频率**：后台静默检查周期由 6 小时缩短至 30 分钟，并在打开用量统计弹窗时自动触发静默检查，及时点亮红点提醒。
- **修复更新弹窗文本与日志渲染**：清理更新日志中的 Markdown 标记与 `Full Changelog` 对比链接；移除更新弹窗底部的「保留当前设置与统计数据」提示文案。
- **完善 GitHub Release 自动说明**：发版工作流自动提取 `CHANGELOG.md` 对应版本条目作为 Release 发布说明。

---

## v1.0.1（`2026-11-16`）

- **精简输入框内联速度条**：隐藏 `tok/s` 前的轮次与步骤数（`#rounds`），仅保留 `tok/s` 速率展示（悬停详情弹窗内仍保留轮次与步骤统计）。

---

## v1.0.0（`2026-11-16`）

- **开启自动更新与弹窗内在线更新安装**：[main.mjs](sidecars/panel/main.mjs) 重新接入 `AppUpdater`，支持启动后及每 6 小时自动静默检查 GitHub Releases；在用量统计弹窗右上角新增「检查更新」按钮（有新版本时显示红点提醒），支持弹窗内查看版本说明、实时进度条、SHA-256 校验在线安装与重载插件；更新 [update-worker.py](compat/update-worker.py) 为 `antigravity-context-{version}.zip` 并新增 `.github/workflows/release.yml` 自动发版打包工作流。
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
