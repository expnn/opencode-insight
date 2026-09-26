## Context

当前实现是单一 v1 形状的 TUI 插件：入口 `{ id, tui(api, options, meta) }`，只使用 6 个 `TuiPluginApi` 成员（`slots.register`、`theme.current`、`client`、`renderer`、`keymap.intercept`、`mode.current()`，最后一个为死代码）。侧栏是 Solid 组件（`SidebarMonitor`），点击后由 `OverlayController` 用 `@opentui/core` 命令式构建全屏 overlay 挂到 `api.renderer.root`；数据来自 SDK v2 客户端的 `session.get / children / messages`，经 `sessionAggregator` 缓存聚合后由纯函数 derive。

本设计受以下已核实约束支配（证据见对话调研，来源为 v1.18.32 / v2.0.18 源码与 npm 包类型）：

- 两个 runtime 都解析 `exports["./tui"]`；v1 loader 只检查 `server`/`tui`，v2 loader 只检查 `id`/`setup`，且都会完整 `import()` 模块（顶层求值）。
- 宿主用 Bun loader 把插件对 `@opentui/core`、`@opentui/solid`、`solid-js`（含 `solid-js/store`）及 `@opentui/keymap*` 的导入重写到宿主自带副本；`@opencode/plugin/tui` 只有 v2 做了映射。
- v2 无 `session.children` 与 `keymap.intercept`；消息形状从 `{info, parts}` 变为 `SessionMessageInfo` 内联内容。
- v1 `borderSubtle` 在官方 `migrateV1()` 中无对应 token。

## Goals / Non-Goals

**Goals:**

- 同一包、同一 0.x 版本线，在 v1 与 v2 下都可加载并保持一致的对外行为（见 specs/plugin-runtime-compat）。
- v1 路径行为零回归：重构后 v1 的渲染、键盘、取数与选项语义与现状完全一致。
- 核心逻辑 host 无关：宿主差异集中在薄适配层，数据模型归一化后由现有 derive/panels 消费。
- 运行时零新增依赖；不要求 v1 用户安装任何 v2 包。

**Non-Goals:**

- 不新增功能、不改视觉设计（颜色映射以"等价呈现"为准，不做美化）。
- 不支持 v1 < 1.3.4（loader 对象入口的源码级下限；官方迁移文档称 1.18.29+，本插件实测与支持口径为 1.18.x）；不处理 v2 的 Node runtime 路径（发布二进制为 Bun，宿主重写机制以 Bun 为准）。
- 不追求 v1/v2 共享状态（测试环境刻意用独立 XDG 根目录隔离，规避 issue #47018）。
- 不把 overlay 迁移到 v2 的 `session.panel`（v1 无此 API，会导致 UI 代码分叉）。

## Decisions

### D1. 入口采用双形状 `{ id, tui, setup }`，全部宿主类型用 `import type`

- **做法**：`src/index.ts` 默认导出对象同时挂 `tui`（v1 入口）与 `setup`（v2 入口），`id` 保持非空；两套类型仅作 `import type`，运行时顶层只保留 `solid-js` / `@opentui/core` / `@opentui/solid`。
- **理由**：两个 loader 的源码已证实各自只读自己的键、忽略对方的键；类型擦除后 v1 下不需要解析 `@opencode/plugin`（v1 不映射该模块）。
- **备选**：拆两个包/两条版本线（用户明确要单包双支持，且 loader 只读 `./tui`，拆包无收益）；运行时探测宿主版本再分支（多余且不可靠）。
- **注意**：v1 的 `TuiPluginModule` 类型不含 `setup`，直接标注会触发 TS excess-property 检查；用自定义复合类型 + `satisfies` 规避。

### D2. 引入 HostAdapter 适配层，核心组件不再直接依赖 `TuiPluginApi`

- **做法**：定义内部接口 `HostAdapter { dataSource, theme, renderer, registerSidebar, closeKeys, options }`，分别实现 `v1Adapter(api, options)` 与 `v2Adapter(ctx)`；`SidebarMonitor` / `OverlayController` / panels 只依赖该接口。`closeKeys(handler) => dispose` 是关闭键的唯一挂接点：v1 实现注册 `keymap.intercept` 并返回 disposer（可在任意位置调用）；v2 实现内部创建 `keymap.layer`，因此**必须在 Solid 组件 owner 内调用**（由组件卸载自动释放，返回的 disposer 供显式释放）。（实现时删去了规划中的 `onCleanup` 成员：组件作用域清理 + slot disposer 已覆盖全部资源，无插件级资源需要释放。）
- **理由**：把 6 个接触点的差异（slot 名与 props、主题形状、client、keymap、options、cleanup）收敛到两个文件；核心组件保持单一实现。
- **备选**：在组件内 `if (isV2)` 就地分支（散落条件、类型不可穷尽）；两套组件树（重复 UI 逻辑，维护成本翻倍）。

### D3. 数据层：定义插件自有归一化模型，v1/v2 各写一个映射器

- **做法**：新增 `NormalizedMessage` / `NormalizedPart`（字段贴近现有 UI 消费语义），`sessionAggregator` 改为面向 `DataSource` 接口（`getTree(rootID)` / `fetchMessages(sessionID)`）。v1 映射器几乎恒等；v2 映射器处理字段差异。`apiDataSource` / `tokenHelpers` / panels 仅改类型导入。
- **理由**：v2 与 v1 SDK 的字段差异是实质性的（见下表），伪造 SDK 类型会引入假字段与类型体操；消费者只做结构化读取，自有权属模型最直接。
- **备选**：伪造 v1 SDK `Message`/`Part`（拒绝：需伪造 id/sessionID 等字段）；为 v2 复制一套 derive/panels（拒绝：重复逻辑）；直接改用 v2 响应式数据层 `ctx.data`（`session.list`/`family`/`cost`/`message.list`；拒绝：与 v1 的轮询+纯函数模型分叉，且子会话完整性依赖宿主同步状态，保持两端同构优先）。

**v1 → v2 取数与字段映射（已从 `@opencode/client@2.0.18` 类型核实）**

| 概念 | v1 SDK | v2 `@opencode/client` |
| --- | --- | --- |
| 取会话 | `session.get({sessionID})` → `{ data }` 包装 | 同名，但直接返回 `SessionInfo`（含 `time.updated` / `cost` / `tokens`）；适配层解包方式不同 |
| 取子会话 | `session.children({sessionID})` | `session.list({ parentID })` → `SessionsResponse`（无 children 端点，需按 cursor 翻页） |
| 取消息 | `session.messages({sessionID})`（无 limit） | `session.context({sessionID})` → `SessionMessageInfo[]`（内容内联） |
| 助手模型 | `providerID` + `modelID` 平铺 | `model: ModelRef` 嵌套 |
| token | `tokens.{input,output,reasoning,cache.read,cache.write,total}` | 同名字段但**无 `total`**；归一化公式 `total = input + output + reasoning + cache.read + cache.write`，并在 P6 对拍中核验 v1 服务端 `total` 口径，不一致则以 v1 为准修正 |
| 工具名/ID | `part.tool` / `part.callID`，part 自带 `sessionID`/`messageID` | `content[].name` / `content[].id`；v2 的 part 级 `sessionID`/`messageID` 需从外层消息补齐 |
| 工具状态 | `pending/running/completed/error` | `streaming/running/completed/error`（`streaming.input` 为未解析 JSON 字符串） |
| 工具输出 | `state.output: string` | `state.content: ToolContent[]`（text/file 数组，需拼接文本） |
| 工具错误 | `state.error: string` | `{ type, message, status? }` |
| 消息结构 | `{info, parts[]}` 分离 | 助手 `content[]` 内联；用户 `text`；`SessionMessageInfo` 共 11 种变体，user/assistant 之外的 9 种非对话变体需过滤 |

- **缓存口径不变**：仍以 `Session.time.updated` / `SessionInfo.time.updated` 作为新鲜度信号，未变化复用缓存。

### D4. 主题映射：以官方 `migrateV1()` 为基准，1 项无官方对应 + 3 项判断项

| v1 token | v2 ResolvedTheme 路径 | 依据 |
| --- | --- | --- |
| `text` / `textMuted` | `text.base` / `text.muted` | migrateV1 官方 |
| `background` / `backgroundPanel` / `backgroundElement` | `background.base` / `background.raised.base` / `background.raised.high` | migrateV1 官方 |
| `border` | `border.base` | migrateV1 官方 |
| `error` / `warning` / `success` / `info` | `text.feedback.<kind>.base` | migrateV1 官方 |
| `syntaxNumber` | `syntax.number` | migrateV1 官方 |
| `accent` | `hue.accent[200]` | 官方迁移把 v1 accent 颜色吸收为 `hue.accent` 标度（锚定 step 200）；宿主强调文字也用 `hue.accent[200]`（dialog-select 分类标题） |
| `borderActive` | `hue.neutral[500]` | 插件实际用法是选中导航项的**背景色**（SidebarPanel.ts:83,111）；官方迁移落到 `scrollbar.base`（滚动条色）语义不符；宿主 `background.action.primary.focused` 实测为桃色 `#fab283`，与 v1 默认主题的中性灰 `#606060` 角色不等价。改用中性标度：migrateV1 锚点（neutral.600=backgroundElement、neutral.400=textMuted）表明 neutral.500 是 v1 borderActive 的邻域，实测 v2 = `#4c4c4c`（最接近的中性档位），且保持 selected > hover(raised.high) 的对比关系 |
| `borderSubtle` | `border.base` | 唯一无官方对应项（migrateV1 静默丢弃）；宿主细分隔用 raised 表面、实际边框用 `border.base` |
| `secondary` | `categorical[0][200]` | 官方迁移把 v1 secondary 颜色吸收为 `categorical` 色相标度首位（categoricalTokens 第一项）；`text.action.secondary.base` 被官方定义为 `$text.muted`，不保留 v1 secondary 颜色，故不采用 |

- **理由**：v2 只暴露语义化 ResolvedTheme，映射表是唯一桥梁；以官方迁移函数与宿主自身用法为依据，避免拍脑袋。
- **备选**：读取 v1 主题 JSON 自行解析（v2 不向插件暴露）；硬编码颜色（违背主题契约）。

### D5. keymap：v2 用 `keymap.layer`，在 overlay 组件内创建（作用域即打开窗口）

- **做法**：`FullscreenOverlay`（Solid 组件，`<Show>` 控制挂载）内调用 `ctx.keymap.layer(() => ({ mode: "global", priority: 100, commands: [{ id, bind: "escape", run }, { id, bind: "q", run }] }))`；`run` 关闭 overlay 并消费按键。v1 保持 `keymap.intercept("key")`。
- **理由**：v2 无 `intercept`；layer 由调用组件的 Solid owner 持有，组件卸载即释放，天然只在 overlay 打开期间生效（宿主自己的 feature-plugin 同款用法）；裸字符绑定默认 `preventDefault`，关闭后不存在吞键。
- **备选**：直接监听 `renderer.keyInput`（v1 已验证会被宿主 keymap 吞掉）；常驻 layer + `enabled` 谓词（可行但把全局键作用域扩大，不如组件作用域干净）；`target: () => overlay` 焦点作用域（备选优化，P4 视验证结果采用）。

### D6. 打包：opentui/solid-js 转 peerDependencies，宿主类型包转 devDependencies

- **做法**：`@opentui/core`、`@opentui/solid`、`solid-js` → peerDependencies（`>=0.4.5`）；`@opencode-ai/plugin`、`@opencode-ai/sdk`、`@opencode/plugin`（其类型引用 `@opencode/theme`，一并加入）→ devDependencies（仅类型）；`dependencies` 清空。
- **理由**：宿主 Bun loader 会把这三个运行时模块重写为宿主自带副本，插件自带副本在 Bun 下被绕过——声明 dependency 只会造成第二份模块身份的隐患；`@opencode/plugin` 在 v1 不被映射，必须只作类型使用。peer 范围 `>=0.4.5` 覆盖两侧宿主实际版本（v1 宿主 0.4.x、v2 宿主 0.5.12），运行时兼容由 P0 冒烟与 P6 E2E 验证。
- **备选**：保留 dependencies 并放宽范围（Node 回退路径下会加载插件自带副本，版本错配风险）；bundle opentui（与宿主 renderer 实例不同源，更危险）。

### D7. 配置与文档：不改代码，README 补 v2 写法

- v1：`tui.json` 的 `plugin` 数组（`[spec, options]` 元组）；v2：`cli.json` 的 `plugins`（`{ package, options }`）。v2 会自动把 v1 `tui.json` 迁移到 `cli.json`（`ConfigMigration.run` 每次读配置执行），无需用户手工改名。
- **备选**：自行实现迁移逻辑（宿主已内建，重复且会打架）。

### D8. overlay 继续命令式挂在 renderer.root（不迁 v2 `session.panel`）

- **理由**：v1 没有 panel API；单实现双 runtime 优先。`ctx.renderer` 与 v1 的 `api.renderer` 同源（宿主重写 opentui 导入），命令式渲染代码可复用。
- **代价**：v2 下不享受宿主对 panel 的尺寸/焦点/全屏托管；记为未来增强，不属于本次范围。

## Risks / Trade-offs

- [OpenTUI 0.4.5 → 0.5.12 类型兼容已证、运行时行为未证] → P0 冒烟 + P6 E2E；代码只用两版交集 API；若发现差异，把 0.5-only 调用收敛到适配层并按宿主版本分支。
- [v2 数据归一化漏字段导致读数不一致] → 归一化写成纯函数并单测；P6 用等价会话做 v1/v2 数字对拍（成本、token、缓存命中率必须一致）。
- [v1 服务端 `tokens.total` 口径未验证] → 归一化公式 `total = input + output + reasoning + cache.read + cache.write`；P6 取若干 v1 消息核验该公式与 v1 `tokens.total` 一致，不一致则以 v1 口径为准修正。
- [`session.context` 是否仅含本会话消息未验证（若含父链/摘要会双重计数）] → P3/P4 用已知会话核对消息条数与 v1 `messages` 一致；若含父链，改为仅对叶子会话取数或去重。
- [顶层导入在 v1 下求值失败] → 只允许 `import type` 引用宿主包；构建后检查 dist 的静态 import 清单（应只有 `solid-js`、`solid-js/store`、`@opentui/*`）。
- [v2 裸字符绑定 `q` 影响输入] → layer 生命周期 = overlay 打开窗口；E2E 验证关闭后 prompt 输入不受影响。
- [overlay 打开期间宿主在上层打开 modal 时，`mode: "global"` layer 仍会吞 `q`/Escape] → 缓解：`enabled: () => overlay 为当前最上层`（可用 `currentFocusedRenderable` 判断），或改用 `target: () => overlay` 焦点作用域（P4 视验证结果采用）。
- [v2 slot render 需返回 JSX（社区 issue #42338 报告返回纯字符串会崩溃；该 issue 为 web 调研，未在本地证据中复核）] → 我们的 render 返回 Solid JSX（与宿主 feature-plugin 同款），P0/P6 验证。
- [v1/v2 并存的状态冲突（issue #47018）] → 测试环境用独立 XDG 根目录隔离（已完成：`~/tools/ocv2/opencode2`）。
- [`session.list({parentID})` 分页行为未实测] → 实现按 cursor 翻页并在 P3 验证子会话计数与 v1 `children` 一致。
- [v2 下 overlay 点击命中/层叠可能与 v1 不同（v1 曾有 zIndex 9999 才可点击的历史）] → P6 E2E 显式验证 overlay 内控件（关闭按钮/分类切换）命中不被宿主 UI 抢占。

## Migration Plan

1. P0 双形状 spike：最小模块 + 两个 runtime 各加载一次（先于一切重构，验证前提）。
2. P1 适配层与入口重构：v1 行为保持，跑 v1 回归。
3. P2 主题映射；P3 数据归一化（最大工作量）；P4 keymap；P5 依赖/打包/README。
4. P6 双 runtime E2E 验收矩阵（specs 的 Scenario 即验收项）。
5. 发布：同一 0.x 版本线发布双形状包；v1 用户升级无感（入口形状向后兼容）。
6. 回滚：包为增量变更，回滚即发布回退版本；无数据迁移，无宿主状态写入。

## Open Questions

- 原生 v2 主题（非 migrateV1 迁移而来）下 `hue.accent` 的惯用 step 是否仍取 `[200]`：默认按宿主惯例取 200，P6 视觉检查后再定；不影响 specs 与任务拆分。
- `secondary` 取 `categorical[0][200]`（官方迁移口径）在原生 v2 主题下的观感：P6 视觉确认，必要时回退 `text.muted`。
- 是否在未来把 overlay 迁移到 v2 `session.panel`（享受宿主全屏托管）：本次非目标，记录备查。
