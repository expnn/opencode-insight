import type { CliRenderer, RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import type { AggregatedData } from "../lib/sessionAggregator";

/** 两个 runtime 共用的解析后插件选项。 */
export interface PluginOptions {
  sidebarRefreshIntervalMs: number;
  overlayRefreshIntervalMs: number;
  overlayNavPct: number;
}

/** v1 扁平主题 token 名；由各 host 适配器解析成具体颜色。 */
export interface ThemeView {
  readonly accent: RGBA;
  readonly warning: RGBA;
  readonly error: RGBA;
  readonly success: RGBA;
  readonly info: RGBA;
  readonly secondary: RGBA;
  readonly text: RGBA;
  readonly textMuted: RGBA;
  readonly background: RGBA;
  readonly backgroundElement: RGBA;
  readonly backgroundPanel: RGBA;
  readonly border: RGBA;
  readonly borderActive: RGBA;
  readonly borderSubtle: RGBA;
  readonly syntaxNumber: RGBA;
}

/**
 * 聚合门面：核心 UI 只调用 `aggregate` / `invalidate`；
 * 具体取数（`getTree` / `fetchMessages`）由各 host 的 lib `DataSource` 实现，
 * 缓存与编排由 `aggregateSessionData` 统一处理。
 */
export interface DataAggregator {
  aggregate(rootSessionID: string): Promise<AggregatedData>;
  invalidate(rootSessionID: string): void;
}

export type SidebarRender = (sessionId: string) => JSX.Element;

/** 核心 UI 与宿主之间的唯一接口。 */
export interface HostAdapter {
  readonly renderer: CliRenderer;
  readonly theme: ThemeView;
  readonly options: PluginOptions;
  readonly dataSource: DataAggregator;
  /** 注册侧栏入口；返回释放函数。 */
  registerSidebar(render: SidebarRender): () => void;
  /** 安装 overlay 关闭键（Escape / q）；返回释放函数。 */
  closeKeys(handler: () => void): () => void;
}
