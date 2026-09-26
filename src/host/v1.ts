import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { HostAdapter, PluginOptions, SidebarRender, ThemeView } from "./types";
import { aggregateSessionData, invalidateAggregationCache } from "../lib/sessionAggregator";
import { createV1DataSource } from "../lib/v1DataSource";

/**
 * opencode v1 适配器：把 `TuiPluginApi` 收敛为 `HostAdapter`。
 * 行为与改造前逐点对齐（slot 名 `sidebar_content`、`keymap.intercept`、
 * `theme.current` 实时读取、SDK 客户端聚合）。
 */
export function createV1Adapter(api: TuiPluginApi, options: PluginOptions): HostAdapter {
  // 实时代理：每次读取都取 `api.theme.current` 的当前值，与改造前逐次渲染读取一致。
  const theme = new Proxy({} as ThemeView, {
    get: (_target, prop) =>
      (api.theme.current as unknown as Record<string | symbol, unknown>)[prop],
  });

  const source = createV1DataSource(api.client);

  return {
    renderer: api.renderer,
    theme,
    options,
    dataSource: {
      aggregate: (rootSessionID) => aggregateSessionData(source, rootSessionID),
      invalidate: (rootSessionID) => invalidateAggregationCache(rootSessionID),
    },
    registerSidebar(render: SidebarRender) {
      api.slots.register({
        slots: {
          sidebar_content(_ctx, props: { session_id: string }) {
            return render(props.session_id);
          },
        },
      });
      // v1 的 slot 注册是插件作用域，宿主不暴露释放函数。
      return () => {};
    },
    closeKeys(handler: () => void) {
      const dispose = api.keymap.intercept(
        "key",
        (ctx: {
          event: { name: string; ctrl: boolean; meta: boolean; shift: boolean };
          consume: (o?: { preventDefault?: boolean; stopPropagation?: boolean }) => void;
        }) => {
          const key = ctx.event;
          const isEscape = key.name === "escape";
          const isQuit = key.name === "q" && !key.ctrl && !key.meta && !key.shift;
          if (isEscape || isQuit) {
            ctx.consume({ stopPropagation: true, preventDefault: true });
            handler();
          }
        },
      );
      return () => {
        dispose();
      };
    },
  };
}
