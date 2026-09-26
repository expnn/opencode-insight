import { describe, expect, test } from "bun:test";
import type { ResolvedTheme } from "@opencode/theme/tui";
import type { RGBA } from "@opentui/core";
import { createV2ThemeView } from "./theme";

/** 用可区分的哨兵对象代替真实 RGBA，便于断言映射路径。 */
function sentinel(id: string): RGBA {
  return { __id: id } as unknown as RGBA;
}

function idOf(value: RGBA): string {
  return (value as unknown as { __id: string }).__id;
}

/** 模拟 v2 `StatefulColor`：base + 各状态键 + state() accessor。 */
function stateful(id: string): Record<string, unknown> {
  return {
    base: sentinel(`${id}.base`),
    disabled: sentinel(`${id}.disabled`),
    pressed: sentinel(`${id}.pressed`),
    focused: sentinel(`${id}.focused`),
    selected: sentinel(`${id}.selected`),
    hovered: sentinel(`${id}.hovered`),
    state: () => sentinel(`${id}.state`),
  };
}

function makeTheme(): ResolvedTheme {
  const feedback = (kind: string) => ({
    base: sentinel(`feedback.${kind}.base`),
    muted: sentinel(`feedback.${kind}.muted`),
  });
  return {
    text: {
      base: sentinel("text.base"),
      muted: sentinel("text.muted"),
      action: {
        primary: stateful("text.action.primary"),
        secondary: stateful("text.action.secondary"),
        destructive: stateful("text.action.destructive"),
      },
      formfield: stateful("text.formfield"),
      feedback: {
        error: feedback("error"),
        warning: feedback("warning"),
        success: feedback("success"),
        info: feedback("info"),
      },
    },
    background: {
      base: sentinel("background.base"),
      raised: {
        base: sentinel("background.raised.base"),
        high: sentinel("background.raised.high"),
        max: sentinel("background.raised.max"),
      },
      action: {
        primary: stateful("background.action.primary"),
        secondary: stateful("background.action.secondary"),
        destructive: stateful("background.action.destructive"),
      },
      formfield: stateful("background.formfield"),
      feedback: {
        error: { base: sentinel("background.feedback.error") },
        warning: { base: sentinel("background.feedback.warning") },
        success: { base: sentinel("background.feedback.success") },
        info: { base: sentinel("background.feedback.info") },
      },
    },
    border: { base: sentinel("border.base") },
    scrollbar: { base: sentinel("scrollbar.base") },
    hue: {
      accent: { 200: sentinel("hue.accent.200") },
      interactive: { 200: sentinel("hue.interactive.200") },
      neutral: { 200: sentinel("hue.neutral.200"), 500: sentinel("hue.neutral.500") },
    },
    categorical: [{ 200: sentinel("categorical.0.200") }],
    syntax: { number: sentinel("syntax.number") },
    surface: () => ({}) as ResolvedTheme,
  } as unknown as ResolvedTheme;
}

describe("createV2ThemeView", () => {
  test("maps every v1 token to the documented v2 path", () => {
    const view = createV2ThemeView(makeTheme());

    expect(idOf(view.text)).toBe("text.base");
    expect(idOf(view.textMuted)).toBe("text.muted");
    expect(idOf(view.background)).toBe("background.base");
    expect(idOf(view.backgroundElement)).toBe("background.raised.high");
    expect(idOf(view.backgroundPanel)).toBe("background.raised.base");
    expect(idOf(view.border)).toBe("border.base");
    expect(idOf(view.borderSubtle)).toBe("border.base");
    expect(idOf(view.error)).toBe("feedback.error.base");
    expect(idOf(view.warning)).toBe("feedback.warning.base");
    expect(idOf(view.success)).toBe("feedback.success.base");
    expect(idOf(view.info)).toBe("feedback.info.base");
    expect(idOf(view.accent)).toBe("hue.accent.200");
    expect(idOf(view.secondary)).toBe("categorical.0.200");
    expect(idOf(view.syntaxNumber)).toBe("syntax.number");
    expect(idOf(view.borderActive)).toBe("hue.neutral.500");
  });

  test("is live: reads reflect later theme mutations", () => {
    const theme = makeTheme() as unknown as { text: { muted: RGBA } };
    const view = createV2ThemeView(theme as unknown as ResolvedTheme);
    expect(idOf(view.textMuted)).toBe("text.muted");
    theme.text.muted = sentinel("text.muted.updated");
    expect(idOf(view.textMuted)).toBe("text.muted.updated");
  });

  test("falls back to text.muted when categorical is empty", () => {
    const theme = makeTheme() as unknown as { categorical: unknown[] };
    theme.categorical = [];
    const view = createV2ThemeView(theme as unknown as ResolvedTheme);
    expect(idOf(view.secondary)).toBe("text.muted");
  });
});
