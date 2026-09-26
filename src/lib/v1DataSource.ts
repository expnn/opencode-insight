import type { Message, OpencodeClient, Part, Session } from "@opencode-ai/sdk/v2";
import {
  MAX_TREE_DEPTH,
  normalizeV1Message,
  normalizeV1Session,
  type NormalizedSession,
} from "./normalize";
import type { AggregatedMessage, DataSource } from "./sessionAggregator";

/**
 * v1 数据源：opencode v1 宿主提供的 `@opencode-ai/sdk/v2` 客户端。
 *
 * - 会话树：`session.get` + BFS `session.children`（深度 ≤ MAX_TREE_DEPTH）
 * - 消息：`session.messages`（无 limit，一次取全量，内容内联）
 * - 归一化：`normalizeV1Message` / `normalizeV1Session`
 */
export function createV1DataSource(client: OpencodeClient): DataSource {
  return {
    async getTree(rootSessionID: string): Promise<NormalizedSession[]> {
      const sessions: NormalizedSession[] = [];
      try {
        const root = (await client.session.get({ sessionID: rootSessionID })).data as
          | Session
          | undefined;
        if (!root) return sessions;
        sessions.push(normalizeV1Session(root));
      } catch {
        return sessions;
      }

      const queue: { id: string; depth: number }[] = [{ id: rootSessionID, depth: 0 }];
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth >= MAX_TREE_DEPTH) continue;
        try {
          const children =
            ((await client.session.children({ sessionID: id })).data as Session[] | undefined) ?? [];
          for (const child of children) {
            sessions.push(normalizeV1Session(child));
            queue.push({ id: child.id, depth: depth + 1 });
          }
        } catch {
          // 404 or error → treat as leaf (no children)
        }
      }
      return sessions;
    },

    async fetchMessages(sessionID: string): Promise<AggregatedMessage[]> {
      try {
        const data = (await client.session.messages({ sessionID })).data as
          | Array<{ info: Message; parts: Part[] }>
          | undefined;
        return (data ?? []).map((item) => normalizeV1Message(sessionID, item.info, item.parts));
      } catch {
        return [];
      }
    },
  };
}
