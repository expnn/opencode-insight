import type { AggregatedMessage, NormalizedSession } from "./normalize";

export type { AggregatedMessage, NormalizedSession } from "./normalize";

// ── Aggregated data types ───────────────────────────────────────────

export interface AggregatedData {
  rootSessionID: string;
  /** ALL messages across the tree, sorted oldest→newest by message.time.created */
  messages: AggregatedMessage[];
  /** root + all descendants (normalized session-level cost/tokens for cross-check) */
  sessions: NormalizedSession[];
}

/**
 * 会话树数据源：v1（@opencode-ai/sdk/v2）与 v2（@opencode/client）各实现一份，
 * 负责取数并归一化；缓存与编排由 `aggregateSessionData` 统一处理。
 */
export interface DataSource {
  /** root + 全部后代子会话（BFS，深度 ≤ MAX_TREE_DEPTH；取数失败按叶子处理）。 */
  getTree(rootSessionID: string): Promise<NormalizedSession[]>;
  /** 单个会话的全部消息（内容内联、已归一化）。 */
  fetchMessages(sessionID: string): Promise<AggregatedMessage[]>;
}

// ── Cache ────────────────────────────────────────────────────────────

/**
 * Per-session message cache, keyed by root session ID. Each root tracks the
 * last-known tree plus a per-session message cache keyed by session ID with
 * the session's `time.updated` value at fetch time.
 *
 * Freshness signal: both runtimes expose `time.updated` (ticked when the
 * session record changes — new message added, message completed, cost/tokens
 * accumulated) and no `time.completed`. Staleness is detected by comparing
 * the fresh session's `time.updated` against the value cached at last fetch.
 */
interface SessionCacheEntry {
  messages: AggregatedMessage[];
  timeUpdated: number;
}
interface RootCacheEntry {
  sessions: NormalizedSession[];
  perSession: Map<string, SessionCacheEntry>;
}
const aggregationCache = new Map<string, RootCacheEntry>();

// ── Main aggregation function ────────────────────────────────────────

/**
 * Aggregate all data across the session tree (root + all descendants).
 *
 * Always fetches a fresh tree (to detect new/removed children), then refetches
 * messages ONLY for sessions whose `time.updated` changed or are new;
 * completed/static sessions reuse cached messages.
 */
export async function aggregateSessionData(
  source: DataSource,
  rootSessionID: string,
): Promise<AggregatedData> {
  const sessions = await source.getTree(rootSessionID);

  const cached = aggregationCache.get(rootSessionID);
  const perSession = cached?.perSession ?? new Map<string, SessionCacheEntry>();

  const toFetch: NormalizedSession[] = [];
  for (const session of sessions) {
    const entry = perSession.get(session.id);
    if (!entry || entry.timeUpdated !== session.timeUpdated) {
      toFetch.push(session);
    }
  }

  if (toFetch.length > 0) {
    const fetched = await Promise.all(toFetch.map((session) => source.fetchMessages(session.id)));
    for (let i = 0; i < toFetch.length; i++) {
      perSession.set(toFetch[i].id, {
        messages: fetched[i],
        timeUpdated: toFetch[i].timeUpdated,
      });
    }
  }

  // Drop cache entries for sessions no longer in the tree (e.g., aborted council sessions)
  const freshIds = new Set(sessions.map((s) => s.id));
  for (const id of perSession.keys()) {
    if (!freshIds.has(id)) perSession.delete(id);
  }

  // Assemble all messages, sorted oldest→newest
  const messages: AggregatedMessage[] = [];
  for (const session of sessions) {
    const entry = perSession.get(session.id);
    if (entry) messages.push(...entry.messages);
  }
  messages.sort((a, b) => a.message.time.created - b.message.time.created);

  aggregationCache.set(rootSessionID, { sessions, perSession });

  return { rootSessionID, messages, sessions };
}

/**
 * Invalidate the cache for a given root session (e.g., on overlay cleanup).
 */
export function invalidateAggregationCache(rootSessionID: string): void {
  aggregationCache.delete(rootSessionID);
}
