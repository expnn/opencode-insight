import type { ResolvedTheme } from "@opencode/theme/tui";
import type { RGBA } from "@opentui/core";
import type { ThemeView } from "./types";

/**
 * v1 扁平 token → v2 语义化 `ResolvedTheme` 的映射。
 *
 * 依据（见 design.md D4）：
 * - 13 项来自 `@opencode/theme` 官方 `migrateV1()` 的对应关系；
 * - `borderSubtle` 是唯一无官方对应项（migrateV1 静默丢弃），取 `border.base`；
 * - `accent` 官方吸收为 `hue.accent` 标度（锚定 step 200），宿主强调文字也用 200；
 * - `borderActive` 官方落到 `scrollbar.base`（滚动条色）语义不符；插件实际用法是
 *   选中导航项的背景色（SidebarPanel），故取宿主选中项背景惯例
 *   `background.action.primary.focused`；
 * - `secondary` 官方吸收为 `categorical` 色相标度首位（v1-migrate 的 categoricalTokens
 *   第一项），故取 `categorical[0][200]`；`text.action.secondary.base` 被官方定义为
 *   `$text.muted`，不保留 v1 secondary 的颜色，故不采用。
 *
 * 返回实时代理：每次读取都从当前 `ResolvedTheme` 取值，主题切换后无需重建。
 */
export function createV2ThemeView(theme: ResolvedTheme): ThemeView {
  const resolve: Record<keyof ThemeView, () => RGBA> = {
    text: () => theme.text.base,
    textMuted: () => theme.text.muted,
    background: () => theme.background.base,
    backgroundElement: () => theme.background.raised.high,
    backgroundPanel: () => theme.background.raised.base,
    border: () => theme.border.base,
    borderActive: () => theme.hue.neutral[500],
    borderSubtle: () => theme.border.base,
    error: () => theme.text.feedback.error.base,
    warning: () => theme.text.feedback.warning.base,
    success: () => theme.text.feedback.success.base,
    info: () => theme.text.feedback.info.base,
    accent: () => theme.hue.accent[200],
    secondary: () => theme.categorical[0]?.[200] ?? theme.text.muted,
    syntaxNumber: () => theme.syntax.number,
  };

  return new Proxy({} as ThemeView, {
    get: (_target, prop) =>
      typeof prop === "string" && prop in resolve
        ? resolve[prop as keyof ThemeView]()
        : undefined,
  });
}
