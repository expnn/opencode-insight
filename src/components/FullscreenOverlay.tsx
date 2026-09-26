import { onCleanup, onMount } from "solid-js";
import type { HostAdapter } from "../host/types";
import { OverlayController } from "./overlay/OverlayController";

interface FullscreenOverlayProps {
  adapter: HostAdapter;
  sessionId: string;
  close: () => void;
}

export default function FullscreenOverlay(props: FullscreenOverlayProps) {
  let controller: OverlayController | null = null;

  onMount(() => {
    controller = new OverlayController({
      adapter: props.adapter,
      sessionId: props.sessionId,
      // close 直接命令式拆除 overlay（destroyRecursively + 注销键盘拦截），
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
