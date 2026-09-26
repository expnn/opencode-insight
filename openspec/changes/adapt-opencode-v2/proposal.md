## Why

opencode v2（`@opencode/cli` 2.0.18）更换了 TUI 插件的入口契约与宿主 API：入口从 `{ id, tui() }` 变为 `{ id, setup() }`，slot 名、主题 token、keymap、数据客户端全面换代。本插件当前只实现 v1 形状，在 v2 下会被 loader 直接拒绝（`Invalid V2 TUI plugin module`）。需要让同一份包在 v1 与 v2 下都可用，且 v1 行为零回归。

## What Changes

- 入口改为双形状 `export default { id, tui, setup }`：v1 runtime 调 `tui()`，v2 runtime 调 `setup()`（两个 loader 的源码已证实各自只检查自己的键、忽略对方的键，且都解析 `exports["./tui"]`）。
- 新增 host 适配层：把 v1 `TuiPluginApi` 与 v2 `Plugin.Context` 归一为同一套内部接口（data client / theme / renderer / sidebar slot / close-key handler / options / cleanup）。
- 数据层归一化：v2 用 `client.session.get` + `client.session.list({ parentID })` + `client.session.context({ sessionID })` 替代 v1 SDK 的 `get / children / messages`，并把 `SessionMessageInfo` 归一为内部消息模型（工具名/ID/状态/输出/错误的字段差异逐项映射）。
- 主题映射：15 个 v1 扁平 token 映射到 v2 语义化 `ResolvedTheme`，以 `@opencode/theme` 官方 `migrateV1()` 的对应关系为基准；其中 `borderSubtle` 是唯一无官方对应项（被静默丢弃），按宿主惯例取 `border.base`；`borderActive` 的官方对应 `scrollbar.base` 与插件实际用法（选中项背景）语义不符，改按宿主选中态背景惯例取值；`accent` 官方仅吸收为 `hue.accent` 标度，step 按宿主强调文字惯例取 `[200]`。
- keymap 迁移：v1 `keymap.intercept("key")` → v2 `keymap.layer(() => ({ mode: "global", ... }))`；layer 在 overlay 组件内创建，随组件卸载自动释放。
- 打包调整：`@opentui/core`、`@opentui/solid`、`solid-js` 改为 peerDependencies（宿主 Bun loader 会把这些导入重写到宿主自带副本；声明范围 `>=0.4.5` 覆盖两侧宿主实际版本，运行时兼容由 P0 冒烟与 P6 E2E 验证）；`@opencode/plugin` 仅作类型 devDependency（v2 宿主才映射该模块，v1 下不映射，必须避免运行时导入）。
- 文档更新：README 增加 v2 安装方式（`cli.json` 的 `plugins` object 形式；v1 `tui.json` 的 `plugin` 数组会被 v2 自动迁移到 `cli.json`）。
- 不做：不新增功能、不改 UI 视觉设计、不放弃 v1、不拆分为两个包或两条版本线。

## Capabilities

### New Capabilities
- `plugin-runtime-compat`: 定义本插件在 opencode v1 与 v2 双 runtime 下必须保持一致的对外行为契约：加载方式、侧栏统计入口、全屏 overlay 交互、主题呈现、键盘关闭路径、会话数据聚合口径与配置方式。

### Modified Capabilities
<!-- 项目此前没有 spec（openspec list --specs 为空），本变更不修改既有 capability。 -->

## Impact

- 代码：`src/index.ts`、`src/plugin.tsx`（入口重构）；新增 `src/host/*`（适配层）与 `src/lib/normalize.ts`；`src/lib/sessionAggregator.ts`、`src/lib/apiDataSource.ts`、`src/lib/tokenHelpers.ts` 改为消费归一化类型；`OverlayController.ts` / panels / `SidebarMonitor.tsx` 改接适配层（主题与 keymap 路径）。
- 依赖：`@opentui/core`、`@opentui/solid`、`solid-js` → peerDependencies（`>=0.4.5`）；`@opencode/plugin` 新增为 devDependency（仅 `import type`；其类型引用 `@opencode/theme`，需同时加入 devDependencies）；`@opencode-ai/plugin`、`@opencode-ai/sdk` 降为类型依赖。运行时零新增依赖。
- 发布：同一包、同一 0.x 版本线，双形状随包发布；无需拆包或分版本。
- 文档：README 安装/配置章节（v1 `tui.json` 与 v2 `cli.json` 两种写法）。
- 验证：本机 v1 1.18.32 与隔离安装的 v2 2.0.18（`~/tools/ocv2/opencode2`）双 runtime E2E 验收矩阵；两边的成本、token 与缓存命中率读数必须一致。
