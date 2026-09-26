import type { Plugin } from "@opencode/plugin/tui";
import type { HostAdapter, PluginOptions, SidebarRender } from "./types";
import { createV2ThemeView } from "./theme";
import { aggregateSessionData, invalidateAggregationCache } from "../lib/sessionAggregator";
import { createV2DataSource } from "../lib/v2DataSource";

const PLUGIN_ID = "expnn-opencode-insight";

/**
 * opencode v2 适配器：把 `Plugin.Context` 收敛为 `HostAdapter`。
 *
 * - 侧栏：`ctx.ui.slot({ prepend: "sidebar.content" })`（v1 的 `sidebar_content`
 *   + `{session_id}` 在 v2 为 `sidebar.content` + `{sessionID}`）
 * - 主题：`ctx.theme`（ResolvedTheme）→ v1 扁平 token 的映射（见 theme.ts）
 * - 数据：`ctx.client`（OpenCodeClient）→ 归一化会话树/消息
 * - 关闭键：`ctx.keymap.layer`，**必须在 Solid 组件 owner 内调用**
 *   （overlay 组件挂载时），layer 随组件卸载自动释放
 */
export function createV2Adapter(ctx: Plugin.Context, options: PluginOptions): HostAdapter {
  const source = createV2DataSource(ctx.client);

  return {
    renderer: ctx.renderer,
    theme: createV2ThemeView(ctx.theme),
    options,
    dataSource: {
      aggregate: (rootSessionID) => aggregateSessionData(source, rootSessionID),
      invalidate: (rootSessionID) => invalidateAggregationCache(rootSessionID),
    },
    registerSidebar(render: SidebarRender) {
      return ctx.ui.slot({
        prepend: "sidebar.content",
        render: ({ sessionID }) => render(sessionID),
      });
    },
    closeKeys(handler: () => void) {
      ctx.keymap.layer(() => ({
        mode: "global",
        priority: 100,
        commands: [
          {
            id: `${PLUGIN_ID}.overlay.close.escape`,
            title: "Close Insight overlay",
            bind: "escape",
            run: () => {
              handler();
            },
          },
          {
            id: `${PLUGIN_ID}.overlay.close.q`,
            title: "Close Insight overlay",
            bind: "q",
            run: () => {
              handler();
            },
          },
        ],
      }));
      // layer 由调用组件的 Solid owner 持有，组件卸载即释放。
      return () => {};
    },
  };
}
