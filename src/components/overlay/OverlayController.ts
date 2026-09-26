import { BoxRenderable, Renderable, TextAttributes, TextRenderable } from "@opentui/core";
import type { HostAdapter } from "../../host/types";

import { TimelinePanel } from "./panels/TimelinePanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { SidebarPanel } from "./panels/SidebarPanel";

import type { SidebarCategory, View } from "./types";
import type { AggregatedData } from "../../lib/apiDataSource";

interface OverlayControllerProps {
  adapter: HostAdapter;
  sessionId: string;
  close: () => void;
}

export class OverlayController {
  private renderer;
  private root;

  // Renderable refs
  private overlay!: BoxRenderable;
  private sidebar!: BoxRenderable;
  private viewPanel!: BoxRenderable;
  private contentArea!: BoxRenderable;
  private previous: { focus: Renderable | null } | null = null;

  // State
  private currentSidebarCategory: SidebarCategory = "Overview";
  private currentView: View = "list";
  private fetchError: string | null = null;
  private renderGeneration = 0;
  private cleanedUp = false;

  // Polling timer
  private updateData: ReturnType<typeof setTimeout> | null = null;

  // 键盘关闭：通过 opencode 的 keymap 拦截（而非 renderer.keyInput.on）。
  // opencode 的 @opentui/keymap 用 prependListener("keypress") 在 renderer.keyInput
  // 之前消费按键，匹配绑定后 stopPropagation，导致插件用 renderer.keyInput.on
  // 注册的常规监听器永远收不到 Escape/q。keymap.intercept("key") 在绑定派发前拦截，
  // ctx.consume() 可截断事件，是插件接收键盘的正确通道。
  private keyDispose: (() => void) | null = null;

  private readonly sidebarCategories: SidebarCategory[] = ["Overview", "Timeline"];

  // Live data cache
  private timelinePanel: TimelinePanel;
  private overviewPanel: OverviewPanel;
  private aggregatedData: AggregatedData | null = null;

  constructor(private props: OverlayControllerProps) {
    this.renderer = props.adapter.renderer;
    this.root = this.renderer.root;

    this.timelinePanel = new TimelinePanel(this.renderer, props.adapter.theme);
    this.overviewPanel = new OverviewPanel(this.renderer, props.adapter.theme);

    this.buildOverlay();
    new SidebarPanel({
      theme: this.props.adapter.theme,
      renderer: this.renderer,
      sidebarContainer: this.sidebar,
      sidebarCategories: this.sidebarCategories,
      selectCategoryCallback: async (cat: SidebarCategory) => {
        this.selectSidebar(cat);
        await this.renderViewPanel();
      },
    });
  }

  private get theme() {
    return this.props.adapter.theme;
  }

  // ── Data loading ──────────────────────────────────────────
  private async loadRealData(): Promise<boolean> {
    let changed = false;
    try {
      // Fetch aggregated data once (session tree + all messages)
      this.aggregatedData = await this.props.adapter.dataSource.aggregate(this.props.sessionId);

      const timelineChanged = this.timelinePanel.loadData(this.aggregatedData);
      if (timelineChanged) changed = true;

      if (this.fetchError) {
        this.fetchError = null;
        changed = true;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (this.fetchError !== errorMsg) {
        this.fetchError = errorMsg;
        changed = true;
      }
    }
    return changed;
  }

  // ── Public lifecycle ──────────────────────────────────────

  mount() {
    this.previous = this.stash();
    this.root.add(this.overlay);
    // 关闭键路径由 host 适配器提供：v1 走 keymap.intercept，v2 走 keymap.layer。
    this.keyDispose = this.props.adapter.closeKeys(() => this.props.close());

    const interval = this.props.adapter.options.overlayRefreshIntervalMs;
    const poll = async () => {
      if (this.cleanedUp) return;
      const changed = await this.loadRealData();
      if (changed) {
        await this.renderViewPanel();
      }
      this.updateData = setTimeout(poll, interval);
    };
    this.renderViewPanel();
    poll();

    setTimeout(() => this.overlay.focus(), 0);
  }

  cleanup() {
    // 幂等守卫：close() 会直接调用 cleanup()，onCleanup 兜底可能再调一次。
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.keyDispose?.();
    this.keyDispose = null;
    if (this.updateData) {
      clearTimeout(this.updateData);
      this.updateData = null;
    }
    // Invalidate aggregation cache so next mount starts fresh
    this.props.adapter.dataSource.invalidate(this.props.sessionId);
    // 关键：用 destroyRecursively() 而非 root.remove(overlay.id)。
    // opencode 运行时捆绑的 @opentui/core (v0.4.x) 的 remove 要求传入 Renderable 对象，
    // 传字符串 id 会 throw "remove expects a renderable child object"，导致 overlay 永不移除。
    // destroyRecursively() 是 Renderable 自带方法，内部以对象方式从 parent 移除并销毁全部子元素，
    // 跨 opentui 版本都安全。
    this.overlay.destroyRecursively();
    if (this.previous && this.previous.focus) {
      this.previous.focus.focus();
    }
  }

  private stash(): { focus: Renderable | null } {
    return {
      focus: this.renderer.currentFocusedRenderable,
    };
  }

  // ── Overlay root (build once) ─────────────────────────────

  private buildOverlay() {
    const t = this.theme;

    this.overlay = new BoxRenderable(this.renderer, {
      id: "fullscreen-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: this.renderer.terminalWidth,
      height: this.renderer.terminalHeight,
      backgroundColor: t.background,
      border: true,
      borderColor: t.border,
      flexDirection: "row",
      focusable: true,
      // opencode 自身的 dialog 用 zIndex 3000；不设 zIndex（默认 0）时，插件直接加到
      // renderer.root 的 overlay 会被 opencode SolidJS 树在命中网格中压在底下，
      // 点击落到 opencode 主 UI 而非 overlay 内的关闭按钮。设为 9999 确保命中优先。
      zIndex: 9999,
    });
    const sidebarWidth = this.props.adapter.options.overlayNavPct;
    this.sidebar = new BoxRenderable(this.renderer, {
      width: `${sidebarWidth}%`,
      flexDirection: "column",
      border: true,
    });
    this.viewPanel = new BoxRenderable(this.renderer, {
      width: `${100 - sidebarWidth}%`,
      flexDirection: "column",
      border: true,
    });
    // 顶部栏：右对齐放置关闭按钮。
    // 注意：早期版本用 marginTop: -1 把按钮压到 viewPanel 的 border 行上，
    // 但 opentui 命中测试中 border 行归属于 viewPanel 自身（先注册进 hit grid），
    // 子元素骑在 border 上的命中区域不可靠，导致 onMouseUp 永远不触发。
    // 改为正常流式布局 + 显式 focusable，确保点击可靠命中。
    const topBar = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      justifyContent: "flex-end",
      height: 1,
      marginRight: 1,
    });
    const closeBtn: TextRenderable = new TextRenderable(this.renderer, {
      content: "[X] Close  (Esc / q)",
      fg: t.error,
      bg: t.background,
      onMouseUp: () => this.props.close(),
      onMouseOver: () => (closeBtn.bg = t.backgroundElement),
      onMouseOut: () => (closeBtn.bg = t.background),
    });
    closeBtn.focusable = true;
    topBar.add(closeBtn);

    this.overlay.add(this.sidebar);
    this.overlay.add(this.viewPanel);
    this.viewPanel.add(topBar);
  }

  private selectSidebar(cat: SidebarCategory) {
    this.currentView = "list";
    this.currentSidebarCategory = cat;
  }

  // ── View panel (render many) ──────────────────────────────

  private async renderViewPanel() {
    // Increment generation to invalidate any in-progress renders
    this.renderGeneration++;
    const currentGeneration = this.renderGeneration;
    const isValid = () => currentGeneration === this.renderGeneration;

    if (this.contentArea) this.contentArea.destroyRecursively();
    this.contentArea = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      height: "90%",
      marginRight: 1,
    });
    this.viewPanel.add(this.contentArea);

    if (this.fetchError) {
      this.renderErrorState();
      return;
    }

    switch (this.currentSidebarCategory) {
      case "Overview":
        if (this.aggregatedData) {
          this.overviewPanel.render(this.contentArea, this.aggregatedData);
        }
        break;
      case "Timeline":
        await this.timelinePanel.render(
          this.contentArea,
          this.currentView,
          async () => {
            this.currentView = "detail";
            await this.renderViewPanel();
          },
          async () => {
            this.currentView = "list";
            await this.renderViewPanel();
          },
          isValid,
        );
        break;
    }
  }

  // ── Shared render helpers ─────────────────────────────────

  private renderErrorState() {
    const t = this.theme;

    const errorContainer = new BoxRenderable(this.renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    });

    const errorBox = new BoxRenderable(this.renderer, {
      border: true,
      borderColor: t.error,
      flexDirection: "column",
      alignItems: "center",
      width: "80%",
      paddingTop: 2,
      paddingBottom: 2,
      paddingLeft: 4,
      paddingRight: 4,
      backgroundColor: t.backgroundPanel,
    });

    errorBox.add(
      new TextRenderable(this.renderer, {
        content: "! Data Load Error",
        fg: t.error,
        attributes: TextAttributes.BOLD,
        marginBottom: 1,
      }),
    );

    errorBox.add(
      new TextRenderable(this.renderer, {
        content: this.fetchError || "An unknown error occurred while fetching data.",
        fg: t.textMuted,
        wrapMode: "word",
        marginBottom: 1,
      }),
    );

    const retryBtn = new TextRenderable(this.renderer, {
      content: "⟳ Retry Now",
      fg: t.accent,
      attributes: TextAttributes.BOLD,
    });
    retryBtn.focusable = true;
    retryBtn.onMouseDown = async () => {
      this.fetchError = null;
      await this.renderViewPanel();
    };
    errorBox.add(retryBtn);

    errorContainer.add(errorBox);
    this.contentArea.add(errorContainer);
  }
}
