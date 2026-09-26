## 1. P0 双形状 spike（前提验证）

- [x] 1.1 创建最小双形状测试模块（`export default { id, tui, setup }`，两个入口各写一条可观测标记），构建后检查 dist 顶层静态 import 清单只含 `solid-js`、`solid-js/store`、`@opentui/*`
- [x] 1.2 在 v1（1.18.32）下加载该模块（本地插件配置），验证 v1 调用 `tui()`、无加载错误
- [x] 1.3 在 v2（2.0.18，`~/tools/ocv2/opencode2` 隔离环境）下加载该模块，验证 v2 调用 `setup(ctx)` 且无 `Invalid V2 TUI plugin module`；任一步失败则暂停后续任务并回到 design 修订

## 2. 适配层与入口重构（v1 行为保持）

- [x] 2.1 定义 `HostAdapter` 接口与 `ThemeView` 类型（`src/host/types.ts`），验证 `bun run typecheck` 通过
- [x] 2.2 实现 `v1Adapter`（`slots.register` / `theme.current` / `keymap.intercept` / options），把 `src/plugin.tsx` 改为双形状入口，验证 v1 下插件可加载且侧栏行为与改造前一致
- [x] 2.3 改造 `SidebarMonitor` / `OverlayController` / panels 接收 `HostAdapter`（不再直接依赖 `TuiPluginApi`），验证 v1 回归：主题色、点击打开 overlay、Esc/q 关闭、焦点恢复
- [x] 2.4 记录 v1 基线读数（同一会话的成本、缓存命中率、消息/工具计数），作为后续对拍基线
- [x] 2.5 增加构建产物检查：dist 的静态 import 清单不得包含 `@opencode/plugin`、`@opencode-ai/plugin`、`@opencode-ai/sdk`，验证检查脚本通过
- [x] 2.6 顺带删除死代码（`src/theme.ts`、`types.ts` 的 `FocusRegion`、`mode` stash），验证 `bun run typecheck` 通过且 v1 回归不受影响

## 3. v2Adapter：主题映射与侧栏接线

- [x] 3.1 实现 v1→v2 主题映射表（15 token；官方基准 + `borderSubtle` 无对应 + `accent`/`borderActive`/`secondary` 三个判断项），单测覆盖每个 token 的解析路径
- [x] 3.2 实现 `v2Adapter` 的主题部分并接入渲染，验证 v2 下侧栏与 overlay 无缺色、无渲染异常
- [x] 3.3 v1/v2 视觉对照（同主题下核对标题、选中项、分隔线、状态色），验证关键区域呈现等价；记录 `accent` step 与 `secondary` 取值的最终选择
- [x] 3.4 实现 v2Adapter 的 slot 接线：`ctx.ui.slot` claim 目标 `sidebar.content`、`{ sessionID }` → 组件 props 映射、`setup()` 返回 Cleanup 释放 claim 与定时器；验证 v2 侧栏入口出现、切换会话后统计跟随新 sessionID

## 4. 数据层归一化（最大工作量）

- [x] 4.1 定义 `DataSource` 接口与归一化模型（`NormalizedMessage` / `NormalizedPart`），把 `tokenHelpers` / `apiDataSource` 迁移到归一化类型，验证 v1 取数读数与 2.4 基线完全一致
- [x] 4.2 实现 v2 DataSource 的会话树：`session.get` + `session.list({ parentID })`（含 cursor 翻页），验证子会话集合与 v1 `children` 的计数一致
- [x] 4.3 实现 `SessionMessageInfo` → 归一化映射：工具 `name`/`id`/`state.content`/`error`、`streaming` 状态归一为 `pending`（`streaming.input` 为未解析 JSON 字符串，折叠为空输入以与 v1 视觉一致）、token 分项求和（无 `total`，公式 `input+output+reasoning+cache.read+cache.write`）、过滤 user/assistant 之外的 9 种非对话变体（`SessionMessageInfo` 共 11 种变体），单测覆盖每种工具状态与用户/助手消息
- [x] 4.4 实现 v2 DataSource 的消息取数（`session.context`）并接入聚合缓存（`time.updated` 新鲜度）；先用已知会话核对 `context` 仅含本会话消息（条数与 v1 `messages` 一致，若含父链/摘要需去重或仅对叶子会话取数），再验证 v2 侧栏成本/缓存命中率与 v1 基线对拍一致

## 5. keymap（v2 关闭路径）

- [x] 5.1 在 `FullscreenOverlay` 组件内实现 v2 `keymap.layer`（`mode: "global"`、Escape/q 命令、消费按键），验证 v2 下 Esc/q 关闭 overlay 且不触发宿主其他行为
- [x] 5.2 验证 v2 关闭后 prompt 输入不受 `q` 绑定影响、重复开关 overlay 无重复键盘响应（E2E 手工）

## 6. 依赖与打包

- [x] 6.1 `package.json` 调整：`@opentui/core`、`@opentui/solid`、`solid-js` 转 peerDependencies（`>=0.4.5`），`@opencode-ai/plugin`、`@opencode-ai/sdk`、`@opencode/plugin` 转 devDependencies，并补 `@opencode/theme`（`@opencode/plugin` 的类型引用它，且它是 optional peer 不会传递安装）、显式 pin `@opencode/client`（避免类型随传递依赖漂移），清空 dependencies；验证 `bun install` + `bun run typecheck` + `bun run build` 全部通过
- [x] 6.2 验证构建产物：dist 可被 v1 与 v2 两个 loader 加载，dts 正确导出双形状类型（含 `setup` 的复合类型）

## 7. 文档

- [x] 7.1 更新 README：v1 安装（`tui.json` 的 `plugin` 元组）保留，新增 v2 安装（`cli.json` 的 `plugins` object 形式）、v1 配置自动迁移说明、本地开发调试方式；补充双 runtime 并存注意事项（官方 v2 安装脚本会覆盖 `~/.opencode/bin/opencode`、`npm i -g @opencode/cli` 会遮蔽 v1 bin、共享状态冲突 issue #47018、隔离安装参考）；验证按文档在 v2 隔离环境完成一次安装并可运行

## 8. 双 runtime E2E 验收

- [x] 8.1 建立验收清单（覆盖 specs 中 `plugin-runtime-compat` 的全部 Scenario，并显式包含：overlay 内控件点击命中不被宿主 UI 抢占、overlay 与宿主 dialog 层叠正常、切换会话后统计跟随），在 v1 1.18.32 下逐项执行并记录结果
- [x] 8.2 在 v2 2.0.18（隔离环境）下执行同一清单并记录结果
- [x] 8.3 数字对拍：结构等价会话的成本、总 token 与缓存命中率 v1 = v2；同时用 v1 消息核验 `total` 求和公式与服务端 `tokens.total` 口径一致；记录证据（截图/日志/读数）到 change 或 PR；任何不一致必须定位到数据映射或会话数据本身
