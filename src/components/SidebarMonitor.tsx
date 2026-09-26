import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { HostAdapter } from "../host/types";
import FullscreenOverlay from "./FullscreenOverlay";
import { getSidebarStats } from "../lib/apiDataSource";

interface SidebarMonitorProps {
  adapter: HostAdapter;
  sessionId: string;
}

export default function SidebarMonitor(props: SidebarMonitorProps) {
  const [showOverlay, setShowOverlay] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);
  const [stats, setStats] = createSignal<{ cost: number; cacheHitPct: string } | null>(null);
  const t = () => props.adapter.theme;
  const interval = () => props.adapter.options.sidebarRefreshIntervalMs;

  const refresh = async () => {
    try {
      const data = await props.adapter.dataSource.aggregate(props.sessionId);
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
          adapter={props.adapter}
          sessionId={props.sessionId}
          close={() => setShowOverlay(false)}
        />
      </Show>
    </box>
  );
}
