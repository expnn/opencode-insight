# OpenCode Insight — developer guide

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Build | `bun run build` | tsup ESM bundle (49 KB), emits `dist/` + DTS |
| Typecheck | `bun run typecheck` | `tsc --noEmit` |
| Publish to npm | `bun run build && npm publish` | NOT `bun publish` — npm publishes via OIDC |

## Architecture

```
src/index.ts → default export redirects to src/plugin.tsx
  plugin.tsx registers a sidebar_content slot with OpenCode's TuiPluginApi
    SidebarMonitor.tsx  — SolidJS component (sidebar entry, opens overlay)
      FullscreenOverlay.tsx — SolidJS mount → imperative OverlayController lifecycle
        OverlayController.ts — 2s poll loop, focus management, @opentui/core rendering
          panels/SidebarPanel.ts   — sidebar nav within the overlay
          panels/OverviewPanel.ts  — metric cards + lists (uses apiDataSource derive funcs)
          panels/TimelinePanel.ts  — scrollable message/tool list + detail
```

**Rendering**: The overlay uses `@opentui/core` imperative APIs (`BoxRenderable`, `TextRenderable`), NOT JSX. SolidJS is only used for the sidebar entry in `FullscreenOverlay.tsx`. Overlay cleanup uses `destroyRecursively()` — do NOT call `root.remove(overlay.id)` with a string (v0.4.x throws "remove expects a renderable child object").

**Framework imports**: Use `@opencode-ai/sdk/v2` for the v2 client (flat `{ sessionID }` params). `@opencode-ai/plugin/tui` provides `TuiPluginApi`. `@opentui/core` for renderable primitives. `@opentui/solid` as SolidJS renderer (configured in tsup via esbuild-plugin-solid with `generate: "universal", moduleName: "@opentui/solid"`).

## Data flow

All stats derive from `AggregatedMessage[]` (message + inline parts, unioned across the session tree).

**Do NOT use `api.state.session.messages(sessionId)` or `api.state.part(messageId)`** for child/unviewed sessions — those read from a reactive store that is only populated for sessions the user navigated to and is capped at 100 messages. For any session ID, use the SDK client:

```ts
import type { OpencodeClient, Session, Message, Part } from "@opencode-ai/sdk/v2";
// All messages with inline parts (no limit → server returns all in one call)
client.session.messages({ sessionID })
// Children of a session (recursive to walk the tree)
client.session.children({ sessionID })
// Get a single session
client.session.get({ sessionID })
```

The v2 `Session` type has `time.updated` (ticks on message add/completion) but **no `time.completed`**. Use `time.updated` as the per-session staleness signal.

### File responsibilities

| File | Role |
|------|------|
| `src/lib/sessionAggregator.ts` | Walk session tree (BFS via `session.children`, depth ≤ 4), fetch messages per session (no-limit), cache with `time.updated` freshness check |
| `src/lib/apiDataSource.ts` | Derive functions (`getTokenUsage`, `getTimelineData`, `getToolCalls`, etc.) taking `AggregatedMessage[]` with inline parts |
| `src/lib/tokenHelpers.ts` | `extractMessageTokens`, `isAssistantMessage`, `getDisplayModel` |
| `src/lib/uiHelpers.ts` | `truncate`, `fmtNum`, `miniBar`, `itemColor` |

### Known limits

- Council-aborted (`session.abort()`) sessions are deleted — absent from `session.children`, cost unrecoverable.
- Streaming assistant messages show in-progress tokens until `time.updated` ticks on completion.
- No `limit`+`before` pagination yet (the no-limit call serves sessions under ~1000 messages).
