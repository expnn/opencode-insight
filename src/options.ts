import type { PluginOptions } from "./host/types";

/** 解析正数毫秒间隔，非法时回退默认值。 */
function parseIntervalMs(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 0 ? value : fallback;
}

/** 解析侧栏宽度百分比，夹取到 [10, 40]。 */
function parseWidthPct(value: unknown, fallback: number): number {
  const n = typeof value === "number" && value > 0 ? value : fallback;
  return Math.min(40, Math.max(10, n));
}

/** 解析两个 runtime 共用的插件选项（v1 第三参 / v2 `ctx.options`）。 */
export function parseOptions(raw: Record<string, unknown> | undefined): PluginOptions {
  const o = raw ?? {};
  return {
    sidebarRefreshIntervalMs: parseIntervalMs(o.sidebarRefreshIntervalMs, 20000),
    overlayRefreshIntervalMs: parseIntervalMs(o.overlayRefreshIntervalMs, 2000),
    overlayNavPct: parseWidthPct(o.overlayNavPct, 20),
  };
}
