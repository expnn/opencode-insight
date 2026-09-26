# P0 双形状 spike 证据

目标：验证同一模块 `export default { id, tui, setup }` 能被 opencode v1 与 v2 两个 runtime 分别加载并调用各自认识的入口函数。

## 构建

```bash
cd /tmp/opencode/oc-spike
bun build dual-entry.ts --outfile dist/index.js --target node --format esm
# dist 静态 import 清单：仅 `node:fs`（无任何宿主包）
```

## v1（1.18.32）

配置（隔离 XDG）：`/tmp/opencode/oc-spike/v1/config/opencode/tui.json`

```json
{ "plugin": ["file:///tmp/opencode/oc-spike/dist/index.js"] }
```

运行：

```bash
OC_SPIKE_LOG=/tmp/opencode/oc-spike/marker-v1.log \
XDG_CONFIG_HOME=/tmp/opencode/oc-spike/v1/config XDG_DATA_HOME=/tmp/opencode/oc-spike/v1/data \
XDG_CACHE_HOME=/tmp/opencode/oc-spike/v1/cache XDG_STATE_HOME=/tmp/opencode/oc-spike/v1/state \
timeout 12 script -qec "/home/cyc/.opencode/bin/opencode" /dev/null
```

结果（`marker-v1.log`）：

```
2026-09-26T12:25:04.489Z tui() called pid=3233969
```

→ v1 调用 `tui()`，未调用 `setup()`，无加载错误。

## v2（2.0.18）

配置（隔离 XDG）：`/tmp/opencode/oc-spike/v2/config/opencode/cli.json`

```json
{ "plugins": ["/tmp/opencode/oc-spike/v2-plugin"] }
```

插件目录：`/tmp/opencode/oc-spike/v2-plugin/tui.ts`（与 `dual-entry.ts` 相同内容）

运行：

```bash
OC_SPIKE_LOG=/tmp/opencode/oc-spike/marker-v2.log \
XDG_CONFIG_HOME=/tmp/opencode/oc-spike/v2/config XDG_DATA_HOME=/tmp/opencode/oc-spike/v2/data \
XDG_CACHE_HOME=/tmp/opencode/oc-spike/v2/cache XDG_STATE_HOME=/tmp/opencode/oc-spike/v2/state \
timeout 12 script -qec "/home/cyc/tools/ocv2/opencode" /dev/null
```

结果（`marker-v2.log`）：

```
2026-09-26T12:25:16.499Z setup() called pid=3234138
2026-09-26T12:25:27.279Z setup() cleanup pid=3234138
```

→ v2 调用 `setup(ctx)`，并在进程退出时执行 setup 返回的 cleanup；`$XDG_DATA_HOME/opencode/log/` 中无 `Invalid V2 TUI plugin module` 或插件加载错误。

## 结论

双形状入口在真实两个 runtime 下均成立（此前仅源码级推断，现已运行实证）。同一模块在 v1 下走 `tui()`、v2 下走 `setup()`，互不干扰。
