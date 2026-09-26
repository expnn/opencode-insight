import { describe, expect, test } from "bun:test";
import { parseOptions } from "./options";

describe("parseOptions", () => {
  test("applies defaults for missing/invalid values", () => {
    expect(parseOptions(undefined)).toEqual({
      sidebarRefreshIntervalMs: 20000,
      overlayRefreshIntervalMs: 2000,
      overlayNavPct: 20,
    });
    expect(parseOptions({ sidebarRefreshIntervalMs: -5, overlayRefreshIntervalMs: 0 })).toEqual({
      sidebarRefreshIntervalMs: 20000,
      overlayRefreshIntervalMs: 2000,
      overlayNavPct: 20,
    });
  });

  test("accepts valid values and clamps overlayNavPct to [10, 40]", () => {
    expect(
      parseOptions({ sidebarRefreshIntervalMs: 5000, overlayRefreshIntervalMs: 500, overlayNavPct: 15 }),
    ).toEqual({ sidebarRefreshIntervalMs: 5000, overlayRefreshIntervalMs: 500, overlayNavPct: 15 });
    expect(parseOptions({ overlayNavPct: 5 }).overlayNavPct).toBe(10);
    expect(parseOptions({ overlayNavPct: 80 }).overlayNavPct).toBe(40);
  });
});
