import { onCleanup, onMount } from "solid-js";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { OverlayController } from "./overlay/OverlayController";

interface FullscreenOverlayProps {
  api: TuiPluginApi;
  sessionId: string;
  close: () => void;
  /** Forwarded to OverlayController as its poll interval (ms). */
  overlayRefreshIntervalMs?: number;
  /** Forwarded to OverlayController as the sidebar (left nav) width %. */
  overlayNavPct?: number;
}

export default function FullscreenOverlay(props: FullscreenOverlayProps) {
  let controller: OverlayController | null = null;

  onMount(() => {
    controller = new OverlayController({
      api: props.api,
      sessionId: props.sessionId,
      refreshIntervalMs: props.overlayRefreshIntervalMs,
      overlayNavPct: props.overlayNavPct,
      // close 直接命令式拆除 overlay（destroyRecursively + 注销 keymap 拦截），
      // 不依赖 SolidJS <Show> 销毁 → onCleanup 这条链。
      close: () => {
        controller?.cleanup();
        controller = null;
        props.close();
      },
    });
    controller.mount();
    // 兜底：若组件被其他方式卸载，也确保清理。
    onCleanup(() => {
      controller?.cleanup();
      controller = null;
    });
  });

  return null;
}
