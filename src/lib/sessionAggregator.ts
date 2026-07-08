import type { OpencodeClient, Session, Message, Part } from "@opencode-ai/sdk/v2";

// ── Aggregated data types ───────────────────────────────────────────

export interface AggregatedMessage {
  /** Which session this message came from (for attribution) */
  sessionID: string;
  /** The Message (info) object — has .agent .modelID .tokens .cost .role .time */
  message: Message;
  /** Inline parts (text, reasoning, tool) — from WithParts response */
  parts: Part[];
}

export interface AggregatedData {
  rootSessionID: string;
  /** ALL messages across the tree, sorted oldest→newest by message.time.created */
  messages: AggregatedMessage[];
  /** root + all descendants (session-level cost/tokens for cross-check) */
  sessions: Session[];
}

// ── Session tree traversal ───────────────────────────────────────────

const MAX_DEPTH = 4;

/**
 * Walk the session tree (BFS): root + all descendant child sessions.
 * On 404/error for a node's children, treat as leaf (no children).
 * Never throws — catches errors and returns what we have.
 *
 * Note: sessions aborted via session.abort() are deleted and won't appear
 * in children — their cost is unrecoverable. This is accepted.
 */
export async function getSessionTree(client: OpencodeClient, rootId: string): Promise<Session[]> {
  const sessions: Session[] = [];

  // Fetch the root session
  try {
    const rootResult = await client.session.get({ sessionID: rootId });
    const root = rootResult.data as Session | undefined;
    if (root) {
      sessions.push(root);
    } else {
      // If we can't even get the root, return empty
      return sessions;
    }
  } catch {
    return sessions;
  }

  // BFS: expand children for each discovered session up to MAX_DEPTH
  const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (depth >= MAX_DEPTH) continue;

    try {
      const childrenResult = await client.session.children({ sessionID: id });
      const children = (childrenResult.data as Session[] | undefined) ?? [];

      for (const child of children) {
        sessions.push(child);
        queue.push({ id: child.id, depth: depth + 1 });
      }
    } catch {
      // 404 or error → treat as leaf (no children)
    }
  }

  return sessions;
}

// ── Fetch messages for one session ───────────────────────────────────

/**
 * Fetch all messages for a session via api.client (no limit = gets all).
 * Returns the WithParts array ({info, parts}[]).
 * On error, returns [] (don't crash aggregation).
 *
 * Note: Pagination via X-Next-Cursor + before backward pagination can be
 * added later for huge sessions (>1000 msgs). For v1, no-limit fetch is
 * sufficient — typical sessions are well under 1000 messages.
 */
export async function fetchSessionMessages(
  client: OpencodeClient,
  sessionID: string,
): Promise<Array<{ info: Message; parts: Part[] }>> {
  try {
    // NO limit → server returns all messages in one call
    const result = await client.session.messages({ sessionID });
    const data = result.data as Array<{ info: Message; parts: Part[] }> | undefined;
    return data ?? [];
  } catch {
    return [];
  }
}

// ── Cache ────────────────────────────────────────────────────────────

/**
 * Per-session message cache, keyed by root session ID. Each root tracks the
 * last-known tree plus a per-session message cache keyed by session ID with
 * the session's `time.updated` value at fetch time.
 *
 * Freshness signal: the v2 Session type has `time.updated` (ticked when the
 * session record changes — new message added, message completed, cost/tokens
 * accumulated) but NO `time.completed`. So we detect staleness by comparing
 * the fresh session's `time.updated` against the value cached at last fetch:
 *   - changed (or session is new) → refetch that session's messages
 *   - unchanged                   → reuse cached messages (static)
 * This correctly catches a root session going idle→working (new message →
 * time.updated ticks → refetch) WITHOUT re-fetching completed subagents, and
 * without the stale "hasWorkingSessions(cached)" self-reference bug.
 */
interface SessionCacheEntry {
  messages: AggregatedMessage[];
  timeUpdated: number;
}
interface RootCacheEntry {
  sessions: Session[];
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
  client: OpencodeClient,
  rootSessionID: string,
): Promise<AggregatedData> {
  // Always fetch the tree to detect new/removed children
  const sessions = await getSessionTree(client, rootSessionID);

  const cached = aggregationCache.get(rootSessionID);
  const perSession = cached?.perSession ?? new Map<string, SessionCacheEntry>();

  // Determine which sessions need a message refetch (new or time.updated changed)
  const toFetch: Session[] = [];
  for (const session of sessions) {
    const entry = perSession.get(session.id);
    if (!entry || entry.timeUpdated !== session.time.updated) {
      toFetch.push(session);
    }
  }

  // Fetch only changed/new sessions in parallel
  if (toFetch.length > 0) {
    const fetched = await Promise.all(
      toFetch.map((session) => fetchSessionMessages(client, session.id)),
    );
    for (let i = 0; i < toFetch.length; i++) {
      const session = toFetch[i];
      const withParts = fetched[i];
      const msgs: AggregatedMessage[] = withParts.map((item) => ({
        sessionID: session.id,
        message: item.info,
        parts: item.parts,
      }));
      perSession.set(session.id, {
        messages: msgs,
        timeUpdated: session.time.updated,
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

  // Update cache
  aggregationCache.set(rootSessionID, { sessions, perSession });

  return { rootSessionID, messages, sessions };
}

/**
 * Invalidate the cache for a given root session (e.g., on overlay cleanup).
 */
export function invalidateAggregationCache(rootSessionID: string): void {
  aggregationCache.delete(rootSessionID);
}
