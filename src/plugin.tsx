import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import SidebarMonitor from "./components/SidebarMonitor";

/** Parse a positive-ms interval option, falling back to a default. */
function parseIntervalMs(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 0 ? value : fallback;
}

/** Parse a sidebar width percentage, clamped to a sane [10, 40] range. */
function parseWidthPct(value: unknown, fallback: number): number {
  const n = typeof value === "number" && value > 0 ? value : fallback;
  return Math.min(40, Math.max(10, n));
}

async function tuiMonitorPlugin(
  api: TuiPluginApi,
  options: Record<string, unknown>,
  _meta: { name: string; version: string }
): Promise<void> {
  // Sidebar stat-line poll interval (ms). Defaults to 20s — cheap because
  // aggregation reuses the per-session cache and only refetches changed sessions.
  const sidebarRefreshIntervalMs = parseIntervalMs(options.sidebarRefreshIntervalMs, 20000);
  // Overlay poll interval (ms). Defaults to 2s for near-real-time updates.
  const overlayRefreshIntervalMs = parseIntervalMs(options.overlayRefreshIntervalMs, 2000);
  // Overlay sidebar (left nav) width as a % of terminal width. Defaults to 20.
  const overlayNavPct = parseWidthPct(options.overlayNavPct, 20);

  api.slots.register({
    slots: {
      sidebar_content(_ctx, props: { session_id: string }) {
        return (
          <SidebarMonitor
            api={api}
            session_id={props.session_id}
            sidebarRefreshIntervalMs={sidebarRefreshIntervalMs}
            overlayRefreshIntervalMs={overlayRefreshIntervalMs}
            overlayNavPct={overlayNavPct}
          />
        );
      },
    },
  });
}

export default {
  id: "expnn-opencode-insight",
  tui: tuiMonitorPlugin,
};
