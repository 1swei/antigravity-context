# Antigravity Context 变更日志

**简体中文** · [English](CHANGELOG.en.md)

- **插件标识**：`antigravity-context`（展示名：`Antigravity Context`）
- **当前版本**：`1.0.9`（基于原 `antigrative-dashboard` / `antigravity-pulse` `0.8.20` 开源分支二次开发）
- **更新时间**：`2026-11-18`

---

## v1.0.9（`2026-11-18`）

- **更新重载原位接替（全程不关窗、零闪烁）**：优化方案为原位占位无缝切换——插件触发更新重载时若用量统计弹窗（及更新菜单）处于打开状态，旧实例停止轮询但保留弹窗原位占位（支持随时手动关闭取消），待新版注入挂载后在同一同步帧内直接替换成新版用量看板，彻底消除“先关闭消失 1~2 秒再强行弹出”的割裂感。
- **更新状态收敛至更新弹窗本身**：移除占用顶部空间的横幅条，重载完成后直接在右上角更新小弹窗 `#update-menu` 内展示绿色「更新成功，插件已自动重载」与「已切换至最新版本」状态，界面更克制紧凑。

---

## v1.0.8（`2026-11-18`）

- **更新自动重载后保留用量弹窗并提示成功**：在用量统计弹窗内执行在线更新并触发重载后，新版挂载时自动无缝复开用量弹窗（不再突然关闭让人误以为崩溃），并在标题栏下方展示绿色提示横幅「更新成功，插件已自动重载 · 当前版本 vX.Y.Z」（支持三语切换与「知道了」一键收起，更新前若已手动关窗则不误弹）。
- **重绘正圆 SVG 上下文进度环**：将内联状态栏 `#context-ring` 从 CSS `conic-gradient + mask` 重构为 SVG 双圆环（`15px × 15px`、`overflow: visible`、`r="5.6"` / `stroke-width: 2.7`、`pathLength="100"`），彻底消除 12 点钟方向接缝撕裂缺口与四边视口裁切发平现象，同时精准维持原有直径与环宽。
- **同会话无感快照接力与冷启动骨架**：重启/更新重载首帧通过 `window.__agPulseHandover` + `sessionStorage` 10 分钟 LRU 快照原地回显真实指标（瞬态断连保留上次有效值），仅在全无历史快照冷启动时展示 3 颗轻柔等高胶囊骨架。
- **重绘无黑底透明轮廓 Logo**：[logo.svg](assets/logo.svg) 去掉暗色圆角方框，改用双层蓝紫叠卡视窗 + 白色 `tok/s` 脉冲波形 + 三色分段上下文占用条，适配 Plugins 列表浅色与深色背景。

---

## v1.0.7（`2026-11-18`）

- **原生上下文构成拆解与三层平滑降级**：新增只读 SQLite 解码模块 [context-breakdown.mjs](sidecars/panel/context-breakdown.mjs)，读取本地对话 `contextWindowMetadata.breakdown` 精准呈现「内置指令与工具集」「规则、技能与 MCP」「工具调用结果」「对话与思考」4 组占比并对齐总占用；刚压缩尚无新响应时自动显示待刷新提示，无原生明细时平滑降级为本地日志估算或纯色占比条。
- **分组悬停高亮联动与面板精简**：悬停上下文浮层内任意分组时，行背景实时高亮、顶部进度条聚焦对应分段，并在卡片底部单行展示该组通俗说明（悬停不重算弹窗定位，消除边缘闪屏）；新会话与历史会话统一固定展示 4 组结构，压缩上下文卡片底部留白，并去掉 `tok/s` 浮层底部冗余的计算方式提示。
- **更新安装无感自动重载**：在线更新验证写入新版本后自动进入重载态并在 `800ms` 内兜底热重启，移除多余的“重新加载插件”按钮，并在安装完成后熄灭红点提醒。
- **双语文档与双主题实机截图刷新**：同步更新 [README.md](README.md) / [README.en.md](README.en.md) 功能说明与全部浅色 / 深色主题真实界面截图。

---

## v1.0.6（`2026-11-16`）

- **用量弹窗头部/底栏精简与版本显示**：在用量统计标题旁增加等宽当前版本标签，移除“本机 Antigravity”与底栏右侧“本机存储 / 导入数据中…”冗余状态；语言切换按钮统一为无常驻灰底风格（仅悬停/点击亮起），并将打开弹窗初始焦点移至页面容器，解决首开即高亮语言按钮并误弹提示的问题。
- **进度条连续推进与关窗重开复位**：优化未知总数及慢会话场景的进度插值策略（避免冲顶 `78%` 后卡死），首开检测同步期即刻开启 `250ms` 高频轮询；关闭与重新打开用量弹窗时彻底复位进度条状态并剥离过期缓存同步标记，修复后台早已完成后重开仍续播残影动画的问题。
- **刷新按钮即时释放与合成悬停抑制**：移除同步结束后的 `600ms` 旋转解锁延迟及 `refreshManually` 的 `250ms` 阻塞等待，刷新完成即刻亮起解锁；屏蔽按钮禁用/启用切换时 Chromium 原地补发的合成 `pointerleave` / `pointerenter`，鼠标停在原位等待刷完不再误弹“刷新”提示或残留悬停底色。

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
