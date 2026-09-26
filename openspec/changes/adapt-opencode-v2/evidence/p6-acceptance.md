# P6 双 runtime E2E 验收记录

对应 `specs/plugin-runtime-compat` 的全部 Scenario。所有 v1/v2 运行均在隔离 XDG 根目录中进行（v1 数据与配置未被触碰）。

## 环境与工具

| 项 | v1 | v2 |
| --- | --- | --- |
| 版本 | 1.18.32（`~/.opencode/bin/opencode`） | 2.0.18（`/home/cyc/tools/ocv2/opencode`） |
| 隔离根 | `/tmp/opencode/oc-spike/v1/{config,data,cache,state}` | `/tmp/opencode/oc-spike/v2/{config,data,cache,state}` |
| 测试会话 | `ses_f224c8c35ffe4FQLRRqI5DknJ6`（免费模型 `opencode/space-bunny-free`） | `ses_f223a588effet4vTHaBy6OcaKo`（同模型） |
| 插件加载方式 | `tui.json` 的 `plugin` 元组 → `dist/index.js` | `cli.json` 的 `plugins` object → `v2-real/tui.ts` 转发 `dist/index.js` |

驱动工具（临时，位于 `/tmp/opencode/oc-spike/`）：`drive_tui.py`（pty + 定时输入注入）、`ansi_screen.py`（ANSI 屏幕还原）。

## 验收矩阵

### 1. Dual-runtime entrypoint loading

| Scenario | v1 | v2 | 证据 |
| --- | --- | --- | --- |
| v1 runtime loads the plugin | ✅ `tui()` 被调用；真实插件侧栏渲染 | — | `marker-v1.log`、`p6-v1-sidebar-and-close.txt` |
| v2 runtime loads the plugin | — | ✅ `setup()` 被调用且退出时执行 cleanup；真实插件侧栏渲染 | `marker-v2.log`、`p6-v2-sidebar.txt` |
| Module top-level imports safe | ✅ dist 静态 import 仅 `solid-js` / `@opentui/*` | ✅ 同左 | `scripts/check-dist-imports.mjs`（`bun run check:imports`） |

### 2. Sidebar stats line

| Scenario | 结果 | 证据 |
| --- | --- | --- |
| Stats render with data | ✅ v1 `cost $0.00 · hit: 18.6%`（脚本同源读数一致）；v2 `cost $0.00 · hit: 5.8%`（脚本读数一致） | 屏幕 txt + `baseline-v1.json` / `parity-v2.json` |
| Transient fetch failure preserves last value | ✅ 数据源取数失败降级为空结果（`src/lib/dataSource.test.ts` 覆盖），组件保留上次成功值（代码路径） | 单测 |
| Refresh interval is configurable | ✅ `parseOptions` 默认值/非法回退/`overlayNavPct` clamp | `src/options.test.ts` |

### 3. Fullscreen overlay interaction

| Scenario | v1 | v2 | 证据 |
| --- | --- | --- | --- |
| Open overlay by click | ✅ | ✅ | `p6-v1-overlay-open.txt`、`p6-v2-overlay-open.txt`（含 `[X] Close`、Overview/Timeline、指标卡） |
| Close by Escape or q | ✅（q 与 Escape 分别验证） | ✅（q 与 Escape 分别验证） | `p6-v2-overlay-closed-q.txt`、`p6-v2-overlay-closed-esc.txt`、`p1-v1-overlay-closed-*.txt` |
| Repeated open/close leaves no residue | ✅（多轮开合） | ✅（连续两次开合后侧栏正常、无残留） | `p6-v2-double-open-close.txt` |
| 关闭后 `q` 不被 keymap 吞掉（5.2） | ✅（v1 由 intercept 释放） | ✅（关闭后输入 `q` 正常进入 prompt） | 关闭后输入捕获（会话见下） |

### 4. Host theme fidelity

| Scenario | 结果 | 证据 |
| --- | --- | --- |
| v1 colors resolve | ✅ 全部颜色取自 `api.theme.current` | 屏幕 txt |
| v2 colors resolve | ✅ 映射后实测：`accent` 与 v1 **完全同 RGB**（`157;124;216`）；卡片标题色同 RGB（`92;156;245`）；`borderActive` 经实验改用 `hue.neutral[500]`（v1 `#606060` vs v2 `#4c4c4c`，替代方案 `background.action.primary.focused` 实测为桃色 `#fab283`，角色不符） | 视觉对照脚本输出（见下"视觉对照"） |

### 5. Data aggregation parity

| Scenario | 结果 | 证据 |
| --- | --- | --- |
| v2 message fetch uses client APIs | ✅ `session.get` + `session.list({parentID})`（含 cursor 翻页）+ `session.context`；`SessionMessageInfo` 四态工具/9 变体过滤/token 求和均有单测 | `src/lib/normalize.test.ts`、`src/lib/v2DataSource.ts` |
| Numbers match across runtimes | ✅ v1 重构前后读数**完全一致**（同数据同代码）；v1/v2 会话树在同一合成树上结果一致（含深度上限）；各自 runtime 的 UI 读数与脚本读数一致 | `baseline-v1.json` vs `after-p3-v1.json`；`src/lib/dataSource.test.ts`；`parity-v2.json` |
| Staleness detection by time.updated | ✅ 缓存键/失效路径与改造前一致（v1 生产已验证），`Session.time.updated` / `SessionInfo.time.updated` 字段两侧均存在 | 代码 + v1 读数一致性 |

**已知限制**：v2 不支持导入 v1 的 `session export`（schema 差异：v1 导出缺 `info.location`，消息结构亦不同），因此"同一条真实会话跨 runtime 直接对拍"不可行；等价性以"同一合成数据 + 同一归一化代码"的单测与各 runtime 的 UI/脚本一致作为证据。

### 6. Configuration compatibility

| Scenario | 结果 | 证据 |
| --- | --- | --- |
| v1 configuration via tui.json | ✅ 全部 v1 E2E 均以 `[spec, options]` 元组配置 | v1 隔离配置 |
| v2 configuration via cli.json | ✅ object 形式 `{package, options}`；`overlayNavPct: 15` 生效（导航栏由 24 列收窄到 18 列，标题截断为 "Opencode"） | `p6-v2-nav15.txt` |
| v1 config is auto-migrated by v2 | ✅ 全新隔离目录仅放 v1 `tui.json`，v2 启动后自动生成 `cli.json`（object 形式、options 保留，$schema 自动写入） | `p6-v2-migrated-cli.json` |

## 视觉对照（关键区域）

| 元素 | v1 实测 | v2 实测 | 判定 |
| --- | --- | --- | --- |
| 标题（accent） | `157;124;216` | `157;124;216` | 完全一致 |
| 卡片标题 | `92;156;245` | `92;156;245` | 完全一致 |
| 选中导航项背景（borderActive） | `96;96;96`（中性灰） | `76;76;76`（`hue.neutral[500]`，最接近的中性档位） | 角色等价（中性高亮；保持 selected > hover 对比） |

## 最终自动化检查

```
bun test            → 19 pass / 0 fail（4 个测试文件）
bun run typecheck   → 通过
bun run build       → dist/index.js 60.74 KB + dts（双形状类型）
bun run check:imports → dist 静态 import 仅 solid-js / @opentui/*
```

## 复现摘要

```bash
# v1（隔离）
env XDG_CONFIG_HOME=.../v1/config XDG_DATA_HOME=.../v1/data \
    XDG_CACHE_HOME=.../v1/cache XDG_STATE_HOME=.../v1/state \
    /home/cyc/.opencode/bin/opencode serve --port 41999 --hostname 127.0.0.1 &
bun run scripts/parity-readings.ts v1 http://127.0.0.1:41999 <sessionID>

# v2（隔离，服务密码见 state/opencode/service.json）
OPENCODE_SERVER_PASSWORD=<pw> bun run scripts/parity-readings.ts v2 <serviceUrl> <sessionID>

# TUI 行为（pty 驱动）
DRIVE_TOTAL_SECONDS=22 python3 drive_tui.py "<opencode cmd> -s <sessionID>" '<env json>' \
  '[[9.0,"18"],[0.6,"62"],[2.0,"<click-press>"],[0.2,"<click-release>"],[2.5,"71"]]' out.bin
python3 ansi_screen.py out.bin 40 120
```
