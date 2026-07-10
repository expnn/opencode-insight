import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import FullscreenOverlay from "./FullscreenOverlay";
import { aggregateSessionData, getSidebarStats } from "../lib/apiDataSource";

interface SidebarMonitorProps {
  api: TuiPluginApi;
  session_id: string;
  /** Sidebar stat-line poll interval in ms (default 20000). */
  sidebarRefreshIntervalMs?: number;
  /** Overlay poll interval in ms (default 2000), forwarded to the overlay. */
  overlayRefreshIntervalMs?: number;
  /** Overlay sidebar (left nav) width as % of terminal width (default 20), forwarded. */
  overlayNavPct?: number;
}

export default function SidebarMonitor(props: SidebarMonitorProps) {
  const [showOverlay, setShowOverlay] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);
  const [stats, setStats] = createSignal<{ cost: number; cacheHitPct: string } | null>(null);
  const t = () => props.api.theme.current;
  const interval = () => props.sidebarRefreshIntervalMs ?? 20000;

  const refresh = async () => {
    try {
      const data = await aggregateSessionData(props.api.client, props.session_id);
      setStats(getSidebarStats(data));
    } catch {
      // Aggregation can transiently fail (e.g. session not ready); keep last value.
    }
  };

  onMount(() => {
    void refresh();
    const id = setInterval(() => void refresh(), interval());
    onCleanup(() => clearInterval(id));
  });

  return (
    <box style={{ flexDirection: "column", padding: 0 }}>
      <box
        style={{ flexDirection: "row", alignItems: "center", paddingTop: 1, paddingBottom: 1 }}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        onMouseUp={() => setShowOverlay(true)}
      >
        <text style={{ fg: isHovered() ? t().warning : t().accent }}>🤖 Opencode Insight</text>
      </box>

      <text style={{ fg: t().textMuted }}>
        {stats()
          ? `cost $${stats()!.cost.toFixed(2)} · hit: ${stats()!.cacheHitPct}%`
          : "loading…"}
      </text>

      <Show when={showOverlay()}>
        <FullscreenOverlay
          api={props.api}
          sessionId={props.session_id}
          overlayRefreshIntervalMs={props.overlayRefreshIntervalMs}
          overlayNavPct={props.overlayNavPct}
          close={() => setShowOverlay(false)}
        />
      </Show>
    </box>
  );
}
