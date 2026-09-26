## Purpose

定义本插件在 opencode v1 与 v2 双 runtime 下的对外行为契约：同一发布包在两个 runtime 都能被各自 loader 加载，并保持一致的用户可见行为（侧栏统计、全屏 overlay、主题呈现、键盘关闭、数据聚合口径与配置方式）。

## ADDED Requirements

### Requirement: Dual-runtime entrypoint loading

插件包 SHALL 通过 `exports["./tui"]` 暴露默认导出，且该默认导出 SHALL 同时满足 opencode v1 的 `{ id, tui() }` 与 v2 的 `{ id, setup() }` 入口形状；两个 runtime 各自调用自己认识的入口函数并忽略另一个键，任一 runtime 都不得因另一个键而拒绝加载。

#### Scenario: v1 runtime loads the plugin

- **WHEN** 插件安装在 opencode v1 下（loader 对象入口的源码级下限为 1.3.4；官方迁移文档称 1.18.29+；实测与支持口径为 1.18.x，如 1.18.32）并通过 `tui.json` 的 `plugin` 数组启用
- **THEN** v1 loader 解析 `exports["./tui"]`、调用 `tui()`，侧栏 slot 注册成功且无加载错误

#### Scenario: v2 runtime loads the plugin

- **WHEN** 插件安装在 opencode v2（实测 2.0.18）下并通过 `cli.json` 的 `plugins` 启用
- **THEN** v2 loader 解析 `exports["./tui"]`、校验默认导出含非空 `id` 与函数 `setup`、调用 `setup(ctx)`，slot claim 注册成功且不出现 `Invalid V2 TUI plugin module` 错误

#### Scenario: Module top-level imports are safe on both runtimes

- **WHEN** 模块被任一 runtime 完整 `import()`（顶层求值）
- **THEN** 顶层不得引用仅存在于单一 runtime 的模块（不得运行时导入 `@opencode/plugin`），所有 v1/v2 类型导入均为 `import type`

### Requirement: Sidebar stats line

插件 SHALL 在会话侧栏显示当前会话树（根会话 + 全部后代子会话）的总成本与缓存命中率，并 SHALL 按可配置间隔轮询刷新。

#### Scenario: Stats render with data

- **WHEN** 侧栏 slot 挂载且会话树数据可用
- **THEN** 显示总成本与缓存命中率（`cost $<total>` 与 `hit: <pct>%`），数值覆盖根会话与所有后代子会话

#### Scenario: Stats follow session switch

- **WHEN** 用户在插件入口存在期间切换当前会话
- **THEN** 侧栏统计与之后打开的 overlay 均针对新 sessionID 取数，不残留旧会话数据

#### Scenario: Transient fetch failure preserves last value

- **WHEN** 一次轮询取数失败（例如会话尚未就绪）
- **THEN** 侧栏保留上一次成功值，不显示错误、不崩溃

#### Scenario: Refresh interval is configurable

- **WHEN** 选项 `sidebarRefreshIntervalMs` 为正数
- **THEN** 轮询周期采用该值；缺省或非法时回退到 20000ms

### Requirement: Fullscreen overlay interaction

插件 SHALL 在用户点击侧栏入口时打开全屏 overlay，并 SHALL 支持 Escape 或 `q` 关闭 overlay 且恢复打开前的焦点。

#### Scenario: Open overlay by click

- **WHEN** 用户点击侧栏入口
- **THEN** overlay 挂载到宿主 renderer 根部并取得焦点，内容区按当前分类（Overview/Timeline）渲染，且 overlay 内控件（关闭按钮、分类切换）可被点击命中、不被宿主 UI 抢占

#### Scenario: Close overlay by Escape or q

- **WHEN** overlay 处于打开状态且用户按下 Escape（不检查修饰键，与 v1 实现一致）或 `q`（无 ctrl/meta/shift）
- **THEN** 该按键被消费、不传播给宿主其他监听者，overlay 被销毁，打开前的焦点被恢复

#### Scenario: Repeated open/close leaves no residue

- **WHEN** overlay 被反复打开与关闭
- **THEN** 每次关闭都释放键盘处理与轮询定时器、失效该会话的聚合缓存；再次打开不出现重复键盘响应或残留渲染

### Requirement: Host theme fidelity

插件 SHALL 使用宿主当前主题渲染 15 个语义 token 对应的颜色；在 v2 下 SHALL 使用语义化 token 的映射。既有例外不在本次改造范围：per-item 分类着色沿用现有 `itemColor` 调色板（`src/lib/uiHelpers.ts` 的硬编码 `VIVID_PALETTE`）。

#### Scenario: Theme colors resolve on v1

- **WHEN** 插件在 v1 渲染
- **THEN** 颜色取自 `api.theme.current` 的扁平 token（accent、warning、textMuted、background、backgroundElement、backgroundPanel、border、borderActive、borderSubtle、error、success、info、secondary、text、syntaxNumber 等）

#### Scenario: Theme colors resolve on v2

- **WHEN** 插件在 v2 渲染
- **THEN** 颜色取自 `ctx.theme`（ResolvedTheme）的语义 token 映射，至少覆盖：`text.base` / `text.muted`、`background.base` / `background.raised.*`、`border.base`、`text.feedback.<kind>.base`、`hue.accent[200]`、`syntax.number`、`hue.neutral[500]`（v1 `borderActive`）、`categorical[0][200]`（v1 `secondary`），且唯一无官方对应的 `borderSubtle` 使用宿主惯例替代值

### Requirement: Data aggregation parity

插件 SHALL 从会话树聚合消息数据（深度 ≤4），且对结构等价的会话，v1 与 v2 下 SHALL 得出相同的成本、token 与缓存命中率读数。

#### Scenario: v2 message fetch uses client APIs

- **WHEN** 插件在 v2 聚合某根会话
- **THEN** 通过 `client.session.get`、`client.session.list({ parentID })`、`client.session.context({ sessionID })` 取全量数据，并把 `SessionMessageInfo` 归一为内部消息模型（覆盖工具名/ID/状态/输入/输出/错误的字段差异与 token 字段）

#### Scenario: Numbers match across runtimes

- **WHEN** 在 v1 与 v2 下分别对结构等价的会话运行聚合
- **THEN** 总成本、总 token 与缓存命中率读数一致，差异只能来自会话数据本身

#### Scenario: Staleness detection by time.updated

- **WHEN** 某会话的 `time.updated` 自上次取数后未变化
- **THEN** 复用缓存的消息数据；仅新会话或 `time.updated` 变化的会话重新取数

### Requirement: Configuration compatibility

插件 SHALL 在两个 runtime 下接受同一组选项（`sidebarRefreshIntervalMs`、`overlayRefreshIntervalMs`、`overlayNavPct`），并 SHALL 在各自 runtime 的既有配置位置生效。

#### Scenario: v1 configuration via tui.json

- **WHEN** 用户在 v1 的 `tui.json` 中以 `[spec, options]` 元组形式配置插件
- **THEN** 选项按约定语义生效（`overlayNavPct` 夹取到 [10, 40]，间隔非法时回退默认值）

#### Scenario: v2 configuration via cli.json

- **WHEN** 用户在 v2 的 `cli.json` 的 `plugins` 中以 `{ package, options }` 形式配置插件
- **THEN** 同一组选项按相同语义生效

#### Scenario: v1 config is auto-migrated by v2

- **WHEN** 用户在 v2 下保留 v1 的 `tui.json` `plugin` 数组配置
- **THEN** v2 自动迁移为 `cli.json` 的 `plugins`，用户无需手工改名（该迁移由宿主提供；本插件负责在 README 中说明，不实现迁移逻辑）
