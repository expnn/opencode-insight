import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Plugin } from "@opencode/plugin/tui";
import SidebarMonitor from "./components/SidebarMonitor";
import { createV1Adapter } from "./host/v1";
import { createV2Adapter } from "./host/v2";
import { parseOptions } from "./options";

const PLUGIN_ID = "expnn-opencode-insight";

/** v1 入口：opencode v1 runtime 调用 `tui(api, options, meta)`。 */
async function tuiMonitorPlugin(
  api: TuiPluginApi,
  options: Record<string, unknown> | undefined,
  _meta: unknown,
): Promise<void> {
  const adapter = createV1Adapter(api, parseOptions(options));
  adapter.registerSidebar(
    (sessionId) => <SidebarMonitor adapter={adapter} sessionId={sessionId} />,
  );
}

/** v2 入口：opencode v2 runtime 调用 `setup(ctx)`，返回值作为插件清理函数。 */
async function setupMonitorPlugin(ctx: Plugin.Context): Promise<() => void> {
  const adapter = createV2Adapter(ctx, parseOptions(ctx.options));
  const disposers: Array<() => void> = [];
  disposers.push(
    adapter.registerSidebar(
      (sessionId) => <SidebarMonitor adapter={adapter} sessionId={sessionId} />,
    ),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}

/**
 * 双形状入口：v1 loader 只读 `tui`，v2 loader 只读 `id` + `setup`，
 * 两个 runtime 都解析 `exports["./tui"]`（已实证，见 evidence/p0-dual-entry-spike.md）。
 */
const plugin = {
  id: PLUGIN_ID,
  tui: tuiMonitorPlugin,
  setup: setupMonitorPlugin,
};

export default plugin;
