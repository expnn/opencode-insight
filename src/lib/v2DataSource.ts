import type { OpenCodeClient, SessionInfo, SessionMessageInfo } from "@opencode/client";
import {
  MAX_TREE_DEPTH,
  normalizeV2Messages,
  normalizeV2Session,
  type NormalizedSession,
} from "./normalize";
import type { AggregatedMessage, DataSource } from "./sessionAggregator";

/** 子会话翻页防御上限（正常情况下 parentID 过滤一页返回）。 */
const MAX_PAGES = 50;

/**
 * v2 数据源：opencode v2 宿主提供的 `@opencode/client`（`ctx.client`）。
 *
 * - 会话树：`session.get` + `session.list({ parentID })`（v2 无 `children` 端点，
 *   按 cursor 翻页），深度 ≤ MAX_TREE_DEPTH
 * - 消息：`session.context({ sessionID })`（全量、内容内联）
 * - 归一化：`normalizeV2Messages` / `normalizeV2Session`
 */
export function createV2DataSource(client: OpenCodeClient): DataSource {
  async function listChildren(parentID: string): Promise<SessionInfo[]> {
    const out: SessionInfo[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await client.session.list({ parentID, cursor });
      out.push(...response.data);
      const next = response.cursor?.next ?? undefined;
      if (!next) break;
      cursor = next;
    }
    return out;
  }

  return {
    async getTree(rootSessionID: string): Promise<NormalizedSession[]> {
      const sessions: NormalizedSession[] = [];
      try {
        const root = await client.session.get({ sessionID: rootSessionID });
        sessions.push(normalizeV2Session(root));
      } catch {
        return sessions;
      }

      const queue: { id: string; depth: number }[] = [{ id: rootSessionID, depth: 0 }];
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth >= MAX_TREE_DEPTH) continue;
        try {
          for (const child of await listChildren(id)) {
            sessions.push(normalizeV2Session(child));
            queue.push({ id: child.id, depth: depth + 1 });
          }
        } catch {
          // 取数失败 → 视为叶子
        }
      }
      return sessions;
    },

    async fetchMessages(sessionID: string): Promise<AggregatedMessage[]> {
      try {
        const messages: SessionMessageInfo[] = await client.session.context({ sessionID });
        return normalizeV2Messages(sessionID, messages);
      } catch {
        return [];
      }
    },
  };
}
