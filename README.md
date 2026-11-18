<div align="center">

<img src="assets/logo.svg" width="64" height="64" alt="Antigravity Context Logo" />

# Antigravity Context

**简体中文** · [English](README.en.md)

轻量、本地优先的 Antigravity 插件：在对话输入框内直接展示实时上下文占用、分段构成、生成速度、缓存命中率，并提供交互式 Token 用量统计弹窗。

[MIT License](LICENSE) · 版本 `v1.0.8` · [更新日志](CHANGELOG.md)

</div>

---

## 界面预览（浅色 / 深色主题）

### 1. 输入框内联状态栏
直接在对话输入框底部嵌入紧凑指标条，实时展示 **生成速度（tok/s）、会话 Token 与缓存命中率、上下文占用环形进度**：

**浅色主题 (Light)**
![输入框内联状态栏（浅色）](assets/screenshot-inline-bar-light.png)

**深色主题 (Dark)**
![输入框内联状态栏（深色）](assets/screenshot-inline-bar-dark.png)

### 2. 上下文占比与分段构成拆解
悬停或点击上下文百分比，即可查看当前窗口总容量及原生构成拆解（**内置指令与工具集、规则/技能与 MCP、工具调用结果、对话与思考**，并在无原生明细时平滑降级；悬停任意分组即可在卡片底部查看对应说明）：

**浅色主题 (Light)**
![上下文分段构成拆解（浅色）](assets/screenshot-context-breakdown-light.png)

**深色主题 (Dark)**
![上下文分段构成拆解（深色）](assets/screenshot-context-breakdown-dark.png)

### 3. Token 与缓存明细浮层
悬停或点击 Token 指标条，查看本次会话缓存命中率、未缓存输入、缓存读取、输出及 **今日 / 本月用量**（有新版本时入口旁同步显示红点提醒）：

**浅色主题 (Light)**
![Token 与缓存明细浮层（浅色）](assets/screenshot-token-popover-light.png)

**深色主题 (Dark)**
![Token 与缓存明细浮层（深色）](assets/screenshot-token-popover-dark.png)

### 4. 用量统计弹窗（年度热力图 + 模型明细）
点击「查看用量统计」打开独立统计弹窗，支持 **近7天 / 近30天 / 按月 / 按年 / 自定义区间** 统一筛选，并与年度贡献热力图、堆叠柱状图和模型明细表双向联动下钻：

| 浅色主题 (Light) | 深色主题 (Dark) |
| --- | --- |
| ![用量统计弹窗（浅色）](assets/screenshot-usage-modal-light.png) | ![用量统计弹窗（深色）](assets/screenshot-usage-modal-dark.png) |

### 5. 在线检查更新与安装弹窗
点击右上角检查更新按钮（有新版本时显示红点），自动向 GitHub 校验最新版本、展示发布说明并支持一键在线校验安装与重载：

| 浅色主题 (Light) | 深色主题 (Dark) |
| --- | --- |
| ![在线更新弹窗（浅色）](assets/screenshot-update-popover-light.png) | ![在线更新弹窗（深色）](assets/screenshot-update-popover-dark.png) |

---

## 核心特性

- **内联上下文条与原生构成拆解**：实时展示上下文窗口占用（新空会话固定显示 4 组与 `0` / `0%`），优先读取 Antigravity 原生 `contextBreakdown` 拆解 **内置指令与工具集、规则/技能与 MCP、工具调用结果、对话与思考**（无原生数据时平滑降级），悬停分组行即可联动高亮分段条并查看单行通俗说明，支持压缩后容量重算与超限提示。
- **单页全联动用量统计**：汇总本地桌面端历史用量并跨会话去重，支持年度贡献热力图、模型对比柱状图与 9 列模型明细表（总计、未缓存、缓存读、缓存写、输出、请求、命中率），支持按月份/日期格子直接联动筛选。
- **无头后台运行**：已移除右侧辅助栏冗余 Web 看板（`has_web_ui: false`），后台仅通过受控本地 CDP 通道完成指标采集与状态栏注入。
- **自动更新检查与无感重载**：启动及后台每 6 小时自动静默检查 GitHub Releases 新版本；有新版本时在用量统计弹窗右上角「检查更新」按钮与统计入口处显示**红点提醒**，支持点击在线下载校验、原子替换安装并自动无感重载生效，重载后自动恢复用量弹窗并提示更新成功（需 Python 3.10+）。
- **宿主视觉融合 & 多语言**：自动跟随 Antigravity 浅色/深色主题变量与字体；内置 **简体中文 / 繁體中文 / English** 三语即时切换。
- **跨平台支持**：支持 Windows、macOS 与 Linux。

---

## 安装方式

将本仓库直接克隆到 Antigravity 的插件目录（目录名统一为 `antigravity-context`）：

```bash
git clone https://github.com/1swei/antigravity-context.git ~/.gemini/config/plugins/antigravity-context
```

Windows PowerShell：

```powershell
git clone https://github.com/1swei/antigravity-context.git "$env:USERPROFILE\.gemini\config\plugins\antigravity-context"
```

克隆完成后，在 Antigravity 插件管理中启用 **Antigravity Context**（或重新加载窗口）即可生效。

---

## 本地测试

需要 Node.js >= 20：

```bash
node --check sidecars/panel/main.mjs
node --test sidecars/panel/tests/*.test.mjs
```

---

## 项目来源与开源协议

本项目基于原作者 `YOU-SHOULD-KNOW-ME` 发布的 MIT 开源项目 `antigrative-dashboard`（`antigravity-pulse` v0.8.20 基线）进行二次开发与自维护。原上游 GitHub 仓库（`https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard`）目前已失效（HTTP 404）。

本项目采用 [MIT License](LICENSE) 开源，完整变更记录见 [更新日志 (中文)](CHANGELOG.md) · [Changelog (English)](CHANGELOG.en.md)。
