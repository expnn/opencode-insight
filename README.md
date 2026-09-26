# OpenCode Insight

A monitoring plugin for [OpenCode](https://github.com/anomalyco/opencode) that provides real-time observability into your AI coding sessions.

## Features

- **Overview Dashboard** — 6 metric cards + token distribution + model usage + cache efficiency
- **Timeline View** — Scrollable list of messages and tool calls with inline detail expansion
- **Real-time Updates** — The fullscreen overlay auto-refreshes every 2 seconds (configurable via `overlayRefreshIntervalMs`)
- **Sidebar Stats** — Shows total cost (incl. subagents) and cache hit rate directly in the sidebar, below the entry button
- **Theme Aware** — Integrates with OpenCode's current theme

## Installation

Works on **both opencode v1 (≥ 1.3.4, 1.18.x tested) and opencode v2 (2.0.x)** from a single package: the module exposes a dual entrypoint (`tui()` for v1, `setup()` for v2).

### opencode v1

Add to your `tui.json` (or `tui.jsonc`):

```json
{
  "plugin": ["@expnn/opencode-insight"]
}
```

> The `plugin` field is an **array**. Each entry is either a string spec or a `[spec, options]` tuple — **not** an object. See [Configuration](#configuration).

### opencode v2

Add to your `cli.json` (CLI-only plugins):

```json
{
  "plugins": [
    {
      "package": "@expnn/opencode-insight",
      "options": {
        "sidebarRefreshIntervalMs": 20000,
        "overlayRefreshIntervalMs": 2000,
        "overlayNavPct": 15
      }
    }
  ]
}
```

> v2 uses `plugins` with the **object form** `{ "package", "options" }`. If you already configured the plugin in v1's `tui.json`, v2 migrates that `plugin` array into `cli.json`'s `plugins` automatically on first run — no manual rename needed.

### Running v1 and v2 side by side

The official v2 installer writes to `$HOME/.opencode/bin/opencode`, **overwriting a v1 install in the same directory**, and `npm i -g @opencode/cli` adds an `opencode` bin that can shadow v1 depending on `PATH`. Both versions also share `~/.config/opencode`, `~/.cache/opencode` and `~/.local/share/opencode` by default, a known source of conflicts when both run against the same state ([anomalyco/opencode#47018](https://github.com/anomalyco/opencode/issues/47018)).

To keep both installed, extract the v2 standalone binary into its own directory and run it with isolated XDG roots:

```bash
mkdir -p ~/tools/ocv2 && cd ~/tools/ocv2
curl -fsSL -o ocv2.tgz https://opencode.ai/files/bin/2.0.18/opencode-linux-x64.tar.gz
tar xzf ocv2.tgz
cat > opencode2 <<'EOF'
#!/usr/bin/env bash
export XDG_DATA_HOME="$HOME/.local/share/ocv2"
export XDG_CACHE_HOME="$HOME/.cache/ocv2"
export XDG_CONFIG_HOME="$HOME/.config/ocv2"
export XDG_STATE_HOME="$HOME/.local/state/ocv2"
exec "$HOME/tools/ocv2/opencode" "$@"
EOF
chmod +x opencode2
```

Then configure the plugin in `~/.config/ocv2/opencode/cli.json` and run `~/tools/ocv2/opencode2`. v1 stays untouched at `~/.opencode/bin/opencode`.

## Configuration

Pass options using the **tuple form** `[spec, options]` inside the `plugin` array. An object form like `{ "spec": { options } }` is **invalid** — opencode will reject the whole `tui.json` and skip every plugin.

```json
{
  "plugin": [
    ["@expnn/opencode-insight", {
      "sidebarRefreshIntervalMs": 20000,
      "overlayRefreshIntervalMs": 2000,
      "overlayNavPct": 15
    }]
  ]
}
```

For a local dev build, use a `file://` spec instead of the package name:

```json
{
  "plugin": [
    ["file:///absolute/path/to/opencode-insight/dist/index.js", {
      "sidebarRefreshIntervalMs": 20000,
      "overlayRefreshIntervalMs": 2000,
      "overlayNavPct": 15
    }]
  ]
}
```

There are **two independent refresh intervals** — don't confuse them:

| Option | Type | Default | Applies to | Description |
|--------|------|---------|------------|-------------|
| `sidebarRefreshIntervalMs` | number (ms) | `20000` | **Sidebar stat line** | How often the compact sidebar line (total cost + cache hit rate) polls for fresh data. Aggregation reuses a per-session cache and only refetches changed sessions, so a higher interval costs almost nothing. |
| `overlayRefreshIntervalMs` | number (ms) | `2000` | **Fullscreen overlay** | How often the overlay re-renders while open. Lower = more live, higher = less API traffic. |
| `overlayNavPct` | number (%) | `20` | **Fullscreen overlay** | Width of the overlay's left navigation bar as a % of terminal width. The right main panel takes the remaining `100 - overlayNavPct`. Clamped to `[10, 40]`. Lower it on narrow screens to give the main panel more room. |

Both must be positive numbers; otherwise the default applies.

## Usage

Click **"🤖 Opencode Insight"** in the sidebar to open the fullscreen overlay. The sidebar also shows a compact line — **total cost (including subagents) and cache hit rate** — that updates on the `sidebarRefreshIntervalMs` cadence.

To **close** the overlay:

- Press `Esc` or `q`, or
- Click the **`[X] Close`** button at the top-right of the overlay.

### Overview Panel

| Card | Shows |
|------|-------|
| **Total Tokens** | All tokens consumed |
| **Cost** | Total USD |
| **Input** | Input tokens + cached |
| **Output** | Output tokens + cached |
| **Cache** | Cache read + write |
| **Tool Calls** | Total tool call count |

### Timeline Panel

Scrollable table of every message and tool call. Click any row to expand inline details — message content, reasoning, token breakdown, or tool I/O.

## Screenshots

![Overview Panel](img/Overview.png)

## Troubleshooting

If the plugin doesn't load or shows stale code after reinstalling:

```bash
rm ~/.cache/opencode/packages/@expnn/opencode-insight@latest -rf
```

Then restart OpenCode.

## Requirements

- opencode v1 **≥ 1.3.4** (TUI plugin API; 1.18.x tested) or opencode v2 **2.0.x**
- The host provides `@opentui/core`, `@opentui/solid` and `solid-js` (declared as optional peer dependencies)

## License

MIT
